import { sql } from "drizzle-orm";

import { orders } from "~/features/orders/db/schema";
import type { PaymentMethod } from "~/features/orders/model/payment-methods";
import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, withUser } from "~/shared/db/client";

type Totals = {
  orderCount: number;
  settledOrderCount: number;
  totalAmount: number;
  capturedAmount: number;
  refundedAmount: number;
  capturedOrderCount: number;
  expiredOrderCount: number;
  uncapturedExpiringAmount: number;
};

export type CurrencyInsights = Totals & {
  currency: string;
  paymentMethods: { paymentMethod: PaymentMethod; orderCount: number; totalAmount: number }[];
};

// Runs as the signed-in user, so row-level security limits the orders counted.
// Each currency is its own row: amounts in different currencies are never added together.
export function getInsights(db: Database, user: UserClaims): Promise<CurrencyInsights[]> {
  return withUser(db, user, async (tx) => {
    // One query, so every number comes from the same snapshot. One row per currency and
    // payment method; every column is a count or a sum, so the currency row is their total.
    const rows = await tx
      .select({
        currency: orders.currency,
        paymentMethod: orders.paymentMethod,
        orderCount: sql<number>`count(*)::int`,
        // Settled: the outcome is known. Only an authorization that can still be captured is open.
        settledOrderCount: sql<number>`count(*) filter (where not (${orders.status} = 'authorized' and ${orders.expiresAt} > now()))::int`,
        totalAmount: sql<number>`coalesce(sum(${orders.totalAmount}), 0)::float8`,
        capturedAmount: sql<number>`coalesce(sum(${orders.capturedAmount}), 0)::float8`,
        refundedAmount: sql<number>`coalesce(sum(${orders.refundedAmount}), 0)::float8`,
        // By money, not status: a part-captured order that is then canceled still had a capture.
        capturedOrderCount: sql<number>`count(*) filter (where ${orders.capturedAmount} > 0)::int`,
        // An authorization past its expiry is decided even before the expiry job marks it expired.
        expiredOrderCount: sql<number>`count(*) filter (where ${orders.status} = 'expired' or (${orders.status} = 'authorized' and ${orders.expiresAt} <= now()))::int`,
        uncapturedExpiringAmount: sql<number>`coalesce(sum(${orders.uncapturedAmount}) filter (where ${orders.status} in ('authorized', 'part_captured') and ${orders.expiresAt} between now() and now() + interval '7 days'), 0)::float8`,
      })
      .from(orders)
      .groupBy(orders.currency, orders.paymentMethod)
      .orderBy(orders.currency, orders.paymentMethod);

    // Rows arrive sorted by currency, and a Map keeps insertion order, so the result is too.
    const byCurrency = new Map<string, CurrencyInsights>();
    for (const { currency, paymentMethod, ...totals } of rows) {
      const method = {
        paymentMethod,
        orderCount: totals.orderCount,
        totalAmount: totals.totalAmount,
      };
      const row = byCurrency.get(currency);
      if (!row) {
        byCurrency.set(currency, { currency, ...totals, paymentMethods: [method] });
        continue;
      }
      for (const key of Object.keys(totals) as (keyof Totals)[]) row[key] += totals[key];
      row.paymentMethods.push(method);
    }
    return [...byCurrency.values()];
  });
}
