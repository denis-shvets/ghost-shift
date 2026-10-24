import { and, count, eq, inArray, max, sql } from "drizzle-orm";

import type { CreateOrderInput } from "~/features/orders/model/create-order-input";
import {
  LimitReachedError,
  OrderCreateForbiddenError,
  StoreNotFoundError,
  createOrder,
} from "~/features/orders/server/orders-repository";
import { stores } from "~/features/stores/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, withUser } from "~/shared/db/client";

import { scheduledCheckouts } from "../db/schema";
import {
  MAX_PENDING_SCHEDULED_CHECKOUTS,
  type ScheduledCheckoutsInput,
} from "../model/scheduled-checkout-input";

const HOUR = 60 * 60 * 1000;
// A row this late is skipped, not placed, so a cron that was down never dumps a burst of orders.
export const LATE_LIMIT = 6 * HOUR;
// The most rows one cron run places. Keeps a run well inside the Workers CPU and subrequest limits.
export const RELEASE_BATCH = 10;

// Runs as the signed-in user. Raw SQL, because Drizzle's insert names every column and the user may
// only insert the planned columns; the database fills in the id, the creator and the status.
export function queueCheckouts(
  db: Database,
  user: UserClaims,
  { planId, checkouts }: ScheduledCheckoutsInput,
) {
  return withUser(db, user, async (tx) => {
    // Ask the same function the insert policy uses, so a refusal is a clear 404 or 403, not a raw 42501.
    // The policy still guards the insert on its own.
    const storeIds = [...new Set(checkouts.map((checkout) => checkout.order.storeId))];
    const visible = await tx
      .select({
        id: stores.id,
        canCreate: sql<boolean>`public.has_permission('orders.create', ${stores.id})`,
      })
      .from(stores)
      .where(inArray(stores.id, storeIds));
    if (visible.length !== storeIds.length) throw new StoreNotFoundError("Store not found");
    if (visible.some((store) => !store.canCreate)) throw new OrderCreateForbiddenError("Forbidden");

    // Counted before the insert, so a refused upload writes nothing. Same race caveat as createOrder.
    const [counted] = await tx
      .select({ pending: count() })
      .from(scheduledCheckouts)
      .where(
        and(eq(scheduledCheckouts.createdBy, user.sub), eq(scheduledCheckouts.status, "pending")),
      );
    if (counted!.pending + checkouts.length > MAX_PENDING_SCHEDULED_CHECKOUTS) {
      throw new LimitReachedError(
        `Too many pending scheduled checkouts (limit ${MAX_PENDING_SCHEDULED_CHECKOUTS}). Wait for some to run before queueing more.`,
      );
    }

    const rows = checkouts.map((checkout) => ({
      store_id: checkout.order.storeId,
      persona: checkout.persona,
      plan_id: planId,
      due_at: checkout.dueAt,
      payload: checkout.order,
    }));
    // All rows in one statement: jsonb_to_recordset turns the JSON array into rows.
    const inserted = await tx.execute(sql`
      insert into public.scheduled_checkouts (store_id, persona, plan_id, due_at, payload)
      select store_id, persona, plan_id, due_at, payload
      from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
        as r(store_id uuid, persona text, plan_id uuid, due_at timestamptz, payload jsonb)
      returning id`);
    return { planId, queued: inserted.length };
  });
}

// Runs as the signed-in user. What the planner needs before it plans: the latest due time among
// their own checkouts that are still waiting, so the next plan starts after it, and the stores they
// may queue in, so it plans no order the database would refuse (a store missing from this database,
// or one no longer assigned).
export function planningContext(db: Database, user: UserClaims) {
  return withUser(db, user, async (tx) => {
    const [row] = await tx
      .select({ lastDueAt: max(scheduledCheckouts.dueAt) })
      .from(scheduledCheckouts)
      .where(
        and(eq(scheduledCheckouts.createdBy, user.sub), eq(scheduledCheckouts.status, "pending")),
      );
    const open = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(sql`public.has_permission('orders.create', ${stores.id})`)
      .orderBy(stores.id);
    return { lastDueAt: row?.lastDueAt ?? null, storeIds: open.map((store) => store.id) };
  });
}

type ClaimedRow = { id: string; created_by: string; due_at: string; payload: CreateOrderInput };

// The Worker cron's job, not a request: it runs as the connection's own user, so it sees every
// creator's rows. Each order is still placed through createOrder as the row's creator, so
// row-level security decides again whether that user may order in the store.
export async function releaseDueCheckouts(db: Database, now = new Date()) {
  const counts = { placed: 0, failed: 0, skipped: 0 };
  for (let n = 0; n < RELEASE_BATCH; n++) {
    // Claim one row at a time: pending → placing in one statement. SKIP LOCKED makes a second run
    // at the same time pass over a row the first has locked, so no row is claimed twice. A crash
    // or a lost connection leaves only the row in hand in placing, visible and never placed twice;
    // the rest stay pending for the next run.
    const [row] = await db.execute<ClaimedRow>(sql`
      update public.scheduled_checkouts set status = 'placing'
      where id = (
        select id from public.scheduled_checkouts
        where status = 'pending' and due_at <= ${now.toISOString()}::timestamptz
        order by due_at
        limit 1
        for update skip locked
      )
      returning id, created_by, due_at, payload`);
    if (!row) break;
    const dueAt = new Date(row.due_at);
    const finish = (values: Partial<typeof scheduledCheckouts.$inferInsert>) =>
      db
        .update(scheduledCheckouts)
        .set({ ...values, releasedAt: new Date() })
        .where(eq(scheduledCheckouts.id, row.id));

    if (now.getTime() - dueAt.getTime() > LATE_LIMIT) {
      await finish({ status: "skipped", error: "More than 6 hours late" });
      counts.skipped++;
      continue;
    }
    try {
      // The order's time is the planned time: up to one cron interval (30 minutes) in the past,
      // or up to LATE_LIMIT after a cron outage.
      const order = await createOrder(db, { sub: row.created_by, global_roles: [] }, row.payload, {
        createdAt: dueAt,
      });
      await finish({ status: "placed", orderId: order.id });
      counts.placed++;
    } catch (error) {
      // One refused order doesn't stop the others; the row says why.
      const message = error instanceof Error ? error.message : String(error);
      await finish({ status: "failed", error: message.slice(0, 500) });
      counts.failed++;
    }
  }
  return counts;
}
