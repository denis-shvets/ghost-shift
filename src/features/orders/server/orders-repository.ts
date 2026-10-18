import { asc, desc, eq } from "drizzle-orm";

import { stores } from "~/features/stores/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, withUser } from "~/shared/db/client";
import { isUuid } from "~/shared/ids/is-uuid";

import { orderLines, orders } from "../db/schema";

export type OrderSummary = Awaited<ReturnType<typeof listOrders>>[number];
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

// Runs as the signed-in user, so row-level security decides what they can read.
export function listOrders(db: Database, user: UserClaims) {
  return withUser(db, user, (tx) =>
    tx
      .select({
        id: orders.id,
        reference: orders.reference,
        createdAt: orders.createdAt,
        shopperName: orders.shopperName,
        paymentMethod: orders.paymentMethod,
        status: orders.status,
        currency: orders.currency,
        totalAmount: orders.totalAmount,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt)),
  );
}

export async function getOrder(db: Database, user: UserClaims, id: string) {
  if (!isUuid(id)) return null;

  return withUser(db, user, async (tx) => {
    const [row] = await tx
      .select({ order: orders, storeName: stores.name })
      .from(orders)
      .innerJoin(stores, eq(stores.id, orders.storeId))
      .where(eq(orders.id, id));
    if (!row) return null;

    const lines = await tx
      .select({
        position: orderLines.position,
        type: orderLines.type,
        sku: orderLines.sku,
        name: orderLines.name,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
        taxRate: orderLines.taxRate,
        totalAmount: orderLines.totalAmount,
        totalTaxAmount: orderLines.totalTaxAmount,
      })
      .from(orderLines)
      .where(eq(orderLines.orderId, id))
      .orderBy(asc(orderLines.position));

    return { ...row.order, storeName: row.storeName, lines };
  });
}
