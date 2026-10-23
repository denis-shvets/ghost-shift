import { desc, eq } from "drizzle-orm";

import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, withUser } from "~/shared/db/client";
import { pgError } from "~/shared/db/pg-error";

import { orders } from "~/features/orders/db/schema";

import { orderDisputes } from "../db/schema";
import type { OpenDisputeInput } from "../model/open-dispute-input";
import { DISPUTABLE_ORDER_STATUSES } from "../model/disputable-order-statuses";

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
