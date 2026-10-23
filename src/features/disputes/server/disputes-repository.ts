import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, withUser } from "~/shared/db/client";
import { keysetPage } from "~/shared/db/keyset-page";
import { pgError } from "~/shared/db/pg-error";

import { orders } from "~/features/orders/db/schema";

import { orderDisputes } from "../db/schema";
import type { OpenDisputeInput } from "../model/open-dispute-input";
import { DISPUTABLE_ORDER_STATUSES } from "../model/disputable-order-statuses";
import type { ListDisputesInput } from "../model/list-disputes-input";

// Base for every refusal, so the server function can show these messages and log anything else.
export class DisputeError extends Error {}

// Thrown when the user may not open a dispute on that order. The insert policy refuses it, and so does a missing order.
export class DisputeForbiddenError extends DisputeError {}

// Thrown when the order exists but never took money, so there is nothing to dispute.
export class DisputeOrderError extends DisputeError {}

// Thrown when the order already has an open dispute.
export class DisputeAlreadyOpenError extends DisputeError {}

// Runs as the signed-in user, so row-level security decides which orders they may dispute.
export function openDispute(db: Database, user: UserClaims, input: OpenDisputeInput) {
  return withUser(db, user, async (tx) => {
    // Orders the user can't see come back empty, the same as a missing order.
    const [order] = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, input.orderId));
    if (!order) throw new DisputeForbiddenError("Forbidden");
    if (!(DISPUTABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      throw new DisputeOrderError(
        "Only orders with captured money that is not fully refunded can be disputed",
      );
    }
    try {
      const [dispute] = await tx.insert(orderDisputes).values(input).returning();
      return dispute!;
    } catch (error) {
      // 42501 is "insufficient_privilege": the policy refused the row.
      if (pgError(error)?.code === "42501") throw new DisputeForbiddenError("Forbidden");
      // 23505 is "unique_violation": the order already has an open dispute, from this request or another.
      if (pgError(error)?.code === "23505")
        throw new DisputeAlreadyOpenError("This order already has an open dispute");
      throw error;
    }
  });
}

export function listOpenDisputes(db: Database, user: UserClaims) {
  return withUser(db, user, (tx) =>
    tx
      .select()
      .from(orderDisputes)
      .where(eq(orderDisputes.status, "open"))
      .orderBy(desc(orderDisputes.openedAt)),
  );
}

// Runs as the signed-in user, so row-level security limits the rows to disputes of their stores.
// Pages are ordered by (opened_at, id), like orders, so disputes opened at the same time can't be skipped.
// The cursor is a dispute id: its opened_at and id are looked up in the same query.
export function listDisputes(
  db: Database,
  user: UserClaims,
  { limit, cursor, direction, status, storeId }: ListDisputesInput,
) {
  return withUser(db, user, async (tx) => {
    // "prev" reads the disputes newer than the cursor. Without a cursor there is nothing to go back from.
    const newer = direction === "prev" && cursor !== undefined;
    const anchor = sql`(select ${orderDisputes.openedAt}, ${orderDisputes.id} from ${orderDisputes} where ${orderDisputes.id} = ${cursor})`;
    const rows = await tx
      .select({
        id: orderDisputes.id,
        orderId: orderDisputes.orderId,
        orderReference: orders.reference,
        reason: orderDisputes.reason,
        status: orderDisputes.status,
        openedAt: orderDisputes.openedAt,
        closedAt: orderDisputes.closedAt,
      })
      .from(orderDisputes)
      .innerJoin(orders, eq(orders.id, orderDisputes.orderId))
      .where(
        and(
          cursor
            ? sql`(${orderDisputes.openedAt}, ${orderDisputes.id}) ${sql.raw(
                newer ? ">" : "<",
              )} ${anchor}`
            : undefined,
          status ? eq(orderDisputes.status, status) : undefined,
          storeId ? eq(orders.storeId, storeId) : undefined,
        ),
      )
      .orderBy(
        newer ? asc(orderDisputes.openedAt) : desc(orderDisputes.openedAt),
        newer ? asc(orderDisputes.id) : desc(orderDisputes.id),
      )
      // One extra row tells us whether another page exists in this direction.
      .limit(limit + 1);

    const { page, nextCursor, prevCursor } = keysetPage(rows, { limit, cursor, newer });
    return { disputes: page, nextCursor, prevCursor };
  });
}

// A cursor the user can't see gives an empty page with no links, so fall back to the first page.
// The filters stay, so the first page is still the filtered one.
// shortcut: one extra query only when the cursor is invisible, upgrade if that path gets hot
export async function listDisputesOrFirstPage(
  db: Database,
  user: UserClaims,
  input: ListDisputesInput,
) {
  const page = await listDisputes(db, user, input);
  if (page.disputes.length > 0 || input.cursor === undefined) return page;
  return listDisputes(db, user, { ...input, cursor: undefined, direction: undefined });
}
