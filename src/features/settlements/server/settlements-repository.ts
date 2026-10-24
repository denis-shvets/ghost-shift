import { desc, eq, sql } from "drizzle-orm";

import { payoutAccounts, stores } from "~/features/stores/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, withUser } from "~/shared/db/client";

import { settlementSchedules, settlements } from "../db/schema";
import type { ScheduleInput } from "../model/settlement-input";

// Shown to the person as-is. Anything else goes to the log instead.
export class SettlementError extends Error {}

// Errors the database raises on purpose, with a message fit to show: no permission (42501), a bad store or
// account (22023), a payout that isn't pending (23514).
const REFUSAL_CODES = new Set(["42501", "22023", "23514"]);

// Drizzle wraps the Postgres error, so its code and message sit on the cause.
async function refused<T>(run: Promise<T>): Promise<T> {
  return run.catch((error: unknown) => {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    if (cause?.code && REFUSAL_CODES.has(cause.code)) {
      throw new SettlementError(cause.message ?? "Refused");
    }
    throw error;
  });
}

// Runs as the signed-in user, so row-level security decides which stores, schedules and accounts they see.
// canManage tells the page whether this person may change a store's schedule at all.
export function listSettlementsPage(db: Database, user: UserClaims) {
  return withUser(db, user, async (tx) => {
    const [settlementRows, scheduleRows, storeRows, accountRows] = await Promise.all([
      tx
        .select({
          id: settlements.id,
          storeName: stores.name,
          currency: settlements.currency,
          periodStart: settlements.periodStart,
          periodEnd: settlements.periodEnd,
          status: settlements.status,
          grossAmount: settlements.grossAmount,
          refundedAmount: settlements.refundedAmount,
          netAmount: settlements.netAmount,
        })
        .from(settlements)
        .innerJoin(stores, eq(stores.id, settlements.storeId))
        .orderBy(desc(settlements.periodEnd))
        .limit(100),
      tx
        .select({
          storeId: settlementSchedules.storeId,
          storeName: stores.name,
          frequency: settlementSchedules.frequency,
          payoutAccountId: settlementSchedules.payoutAccountId,
          periodStart: settlementSchedules.periodStart,
          periodEnd: settlementSchedules.periodEnd,
        })
        .from(settlementSchedules)
        .innerJoin(stores, eq(stores.id, settlementSchedules.storeId))
        .orderBy(stores.name),
      tx
        .select({
          id: stores.id,
          name: stores.name,
          currency: stores.currency,
          organizationId: stores.organizationId,
          canManage: sql<boolean>`public.has_permission('settlements.manage', ${stores.id})`,
        })
        .from(stores)
        .orderBy(stores.name),
      tx
        .select({
          id: payoutAccounts.id,
          label: payoutAccounts.label,
          organizationId: payoutAccounts.organizationId,
          currency: payoutAccounts.currency,
        })
        .from(payoutAccounts)
        .orderBy(payoutAccounts.label),
    ]);
    return {
      settlements: settlementRows,
      schedules: scheduleRows,
      stores: storeRows,
      accounts: accountRows,
    };
  });
}

// Creates a store's schedule, or replaces it. The database function checks the permission, the store and the
// payout account, and keeps the open period's start so captured money carries over.
// The UI asks the merchant to confirm before a store that already has a schedule is replaced.
export function saveSchedule(db: Database, user: UserClaims, input: ScheduleInput) {
  return withUser(db, user, async (tx) => {
    await refused(
      tx.execute(
        sql`select public.save_settlement_schedule(${input.storeId}::uuid, ${input.frequency}::public.settlement_frequency, ${input.payoutAccountId}::uuid)`,
      ),
    );
  });
}

// Pending payouts for the developer approval page. Developers only; the database checks the role too.
export function listPendingPayouts(db: Database, user: UserClaims) {
  return withUser(db, user, (tx) =>
    tx
      .select({
        id: settlements.id,
        storeName: stores.name,
        currency: settlements.currency,
        periodStart: settlements.periodStart,
        periodEnd: settlements.periodEnd,
        netAmount: settlements.netAmount,
      })
      .from(settlements)
      .innerJoin(stores, eq(stores.id, settlements.storeId))
      .where(eq(settlements.status, "pending"))
      .orderBy(settlements.periodEnd, stores.name),
  );
}

// Moves pending payouts to paid, all or nothing: one refused payout undoes the whole batch.
// The database refuses non-developers and payouts that aren't pending.
export function approvePayouts(db: Database, user: UserClaims, settlementIds: string[]) {
  return withUser(db, user, async (tx) => {
    for (const id of settlementIds) {
      await refused(tx.execute(sql`select public.approve_payout(${id}::uuid)`));
    }
  });
}

export type SettlementSummary = {
  currency: string;
  // Captured minus refunded, not yet in any settlement. Negative means the store owes money.
  available: number;
  settledNet: number;
  // Closed payouts waiting for approval, and their total net.
  pendingCount: number;
  pendingNet: number;
  nextPeriodEnd: Date | null;
};

// The per-currency numbers for the dashboard and insights. Each currency is its own row.
export function getSettlementSummary(db: Database, user: UserClaims) {
  return withUser(db, user, async (tx) => {
    const available = await tx.execute<{
      currency: string;
      amount: number;
    }>(sql`
      select o.currency,
        coalesce(sum(case when e.action = 'captured' then 1 else -1 end * (e.metadata ->> 'amount')::bigint), 0)::float8 as amount
      from public.order_events e
      join public.orders o on o.id = e.order_id
      where e.action in ('captured', 'refunded')
        and not exists (select 1 from public.settlement_items i where i.order_event_id = e.id)
      group by o.currency`);
    const paid = await tx
      .select({
        currency: settlements.currency,
        net: sql<number>`sum(${settlements.netAmount})::float8`,
      })
      .from(settlements)
      // Only paid settlements count as paid out; pending ones are still waiting.
      .where(eq(settlements.status, "paid"))
      .groupBy(settlements.currency);
    const schedules = await tx
      .select({
        currency: stores.currency,
        // A raw aggregate comes back as text, so turn it into a Date here.
        // Only periods that haven't ended yet. Ended ones are counted as awaiting settlement instead.
        nextPeriodEnd:
          sql<Date | null>`min(${settlementSchedules.periodEnd}) filter (where ${settlementSchedules.periodEnd} > now())`.mapWith(
            (value) => (value ? new Date(String(value)) : null),
          ),
      })
      .from(settlementSchedules)
      .innerJoin(stores, eq(stores.id, settlementSchedules.storeId))
      .groupBy(stores.currency);
    const pending = await tx
      .select({
        currency: settlements.currency,
        count: sql<number>`count(*)::int`,
        net: sql<number>`sum(${settlements.netAmount})::float8`,
      })
      .from(settlements)
      .where(eq(settlements.status, "pending"))
      .groupBy(settlements.currency);
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(settlementSchedules);
    const [manage] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(stores)
      .where(sql`public.has_permission('settlements.manage', ${stores.id})`);

    const byCurrency = new Map<string, SettlementSummary>();
    const row = (currency: string) => {
      let summary = byCurrency.get(currency);
      if (!summary) {
        summary = {
          currency,
          available: 0,
          settledNet: 0,
          pendingCount: 0,
          pendingNet: 0,
          nextPeriodEnd: null,
        };
        byCurrency.set(currency, summary);
      }
      return summary;
    };
    for (const r of available) row(r.currency).available = r.amount;
    for (const r of paid) row(r.currency).settledNet = r.net;
    for (const r of pending) {
      const summary = row(r.currency);
      summary.pendingCount = r.count;
      summary.pendingNet = r.net;
    }
    for (const r of schedules) {
      const summary = row(r.currency);
      summary.nextPeriodEnd = r.nextPeriodEnd;
    }
    return {
      currencies: [...byCurrency.values()],
      scheduleCount: count?.count ?? 0,
      canManage: (manage?.count ?? 0) > 0,
    };
  });
}
