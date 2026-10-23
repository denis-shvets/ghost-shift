import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { orders } from "~/features/orders/db/schema";

export const disputeStatus = pgEnum("dispute_status", ["open", "closed"]);

// A customer's claim against an order. It records the claim only: no money moves and the order's status stays the same.
export const orderDisputes = pgTable(
  "order_disputes",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid().notNull(),
    reason: text().notNull(),
    status: disputeStatus().notNull().default("open"),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Set exactly when the dispute is closed.
    closedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "order_disputes_order_fk",
      columns: [table.orderId],
      foreignColumns: [orders.id],
    }).onDelete("cascade"),
    check("order_disputes_reason_check", sql`length(btrim(${table.reason})) between 1 and 500`),
    check(
      "order_disputes_closed_at_check",
      sql`(${table.status} = 'closed') = (${table.closedAt} is not null)`,
    ),
    index("order_disputes_order_idx").on(table.orderId),
    // One open dispute per order. Closed ones don't count, so a new dispute can follow a closed one.
    uniqueIndex("order_disputes_open_order_unique")
      .on(table.orderId)
      .where(sql`${table.status} = 'open'`),
  ],
).enableRLS();
