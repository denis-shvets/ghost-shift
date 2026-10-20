import { and, desc, asc, eq, sql } from "drizzle-orm";

import { orderEvents, orders } from "~/features/orders/db/schema";
import type { OrderEvent } from "~/features/orders/model/order-event";
import { stores } from "~/features/stores/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, withUser } from "~/shared/db/client";

import type { ActivityListInput } from "../model/activity-list-input";

// One timeline event with the order and store it belongs to.
export type ActivityEvent = OrderEvent & {
  orderId: string;
  reference: string;
  currency: string;
  storeId: string;
  storeName: string | null;
};

// Runs as the signed-in user, so row-level security decides which events they can read.
// Pages are ordered by (occurred_at, id), so events with the same time can't be skipped.
// The cursor is an event id: the anchor's occurred_at and id are looked up in the same query.
// shortcut: no index on order_events (occurred_at, id), so each page sorts all visible events; add one in a migration when the log gets slow
export function listActivity(
  db: Database,
  user: UserClaims,
  { limit, cursor, direction, action, storeId }: ActivityListInput,
) {
  return withUser(db, user, async (tx) => {
    // "prev" reads the events newer than the cursor. Without a cursor there is nothing to go back from.
    const newer = direction === "prev" && cursor !== undefined;
    const anchor = sql`(select ${orderEvents.occurredAt}, ${orderEvents.id} from ${orderEvents} where ${orderEvents.id} = ${cursor})`;
    const rows = await tx
      .select({
        id: orderEvents.id,
        occurredAt: orderEvents.occurredAt,
        action: orderEvents.action,
        actorName: orderEvents.actorName,
        metadata: orderEvents.metadata,
        orderId: orders.id,
        reference: orders.reference,
        currency: orders.currency,
        storeId: orders.storeId,
        storeName: stores.name,
      })
      .from(orderEvents)
      .innerJoin(orders, eq(orders.id, orderEvents.orderId))
      // Left join: only the orders policy decides which events show; a store the viewer can't read leaves the name empty.
      .leftJoin(stores, eq(stores.id, orders.storeId))
      .where(
        and(
          cursor
            ? sql`(${orderEvents.occurredAt}, ${orderEvents.id}) ${sql.raw(newer ? ">" : "<")} ${anchor}`
            : undefined,
          action ? eq(orderEvents.action, action) : undefined,
          storeId ? eq(orders.storeId, storeId) : undefined,
        ),
      )
      .orderBy(
        newer ? asc(orderEvents.occurredAt) : desc(orderEvents.occurredAt),
        newer ? asc(orderEvents.id) : desc(orderEvents.id),
      )
      // One extra row tells us whether another page exists in this direction.
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    // Going back, the nearest rows came first, so flip them to newest first.
    if (newer) page.reverse();
    const first = page.at(0);
    const last = page.at(-1);
    return {
      // jsonb comes back untyped; only our own code writes it, in the shapes OrderEvent names.
      events: page as ActivityEvent[],
      // Going forward, "older" exists only if there is an extra row. Going back, it always
      // exists, because the cursor event is older than this page.
      nextCursor: (newer || hasMore) && last ? last.id : null,
      // Going back, "newer" exists only if there is an extra row. Going forward with a
      // cursor, it always exists, because the cursor event is newer than this page.
      prevCursor: (newer ? hasMore : cursor !== undefined) && first ? first.id : null,
    };
  });
}

// A cursor the user can't see gives an empty page with no links, so fall back to the first page.
// shortcut: one extra query only when the cursor is invisible, upgrade if that path gets hot
export async function listActivityOrFirstPage(
  db: Database,
  user: UserClaims,
  input: ActivityListInput,
) {
  const page = await listActivity(db, user, input);
  if (page.events.length > 0 || input.cursor === undefined) return page;
  return listActivity(db, user, {
    limit: input.limit,
    action: input.action,
    storeId: input.storeId,
  });
}
