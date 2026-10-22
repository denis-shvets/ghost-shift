import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

import type { CreateOrderInput } from "~/features/orders/model/create-order-input";
import { orders } from "~/features/orders/db/schema";
import { stores } from "~/features/stores/db/schema";

import { SCHEDULED_CHECKOUT_STATUSES } from "../model/scheduled-checkout-input";

export const scheduledCheckoutStatus = pgEnum(
  "scheduled_checkout_status",
  SCHEDULED_CHECKOUT_STATUSES,
);

// Night Shift's queue: orders planned ahead on the owner's machine, placed by the Worker cron when
// they are due (docs/guides/night-shift.md). The status only moves forward:
// pending → placing → placed, failed or skipped.
export const scheduledCheckouts = pgTable(
  "scheduled_checkouts",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Filled in by the database from the caller's token. The cron places the order as this user.
    createdBy: uuid()
      .notNull()
      .default(sql`auth.uid()`),
    storeId: uuid().notNull(),
    // The persona file the order was planned for, e.g. jonas-weber. For reading the queue.
    persona: text().notNull(),
    // One upload, so a plan can be found or removed together.
    planId: uuid().notNull(),
    // When the customer shops. The order gets this as its created_at.
    dueAt: timestamp({ withTimezone: true }).notNull(),
    // The order to place, checked against createOrderInput when it was queued.
    payload: jsonb().$type<CreateOrderInput>().notNull(),
    status: scheduledCheckoutStatus().notNull().default("pending"),
    orderId: uuid(),
    // Why the order was not placed, for failed and skipped rows.
    error: text(),
    // When the cron finished with the row.
    releasedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "scheduled_checkouts_created_by_fk",
      columns: [table.createdBy],
      foreignColumns: [authUsers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduled_checkouts_store_fk",
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }),
    foreignKey({
      name: "scheduled_checkouts_order_fk",
      columns: [table.orderId],
      foreignColumns: [orders.id],
    }),
    check(
      "scheduled_checkouts_persona_length_check",
      sql`char_length(${table.persona}) between 1 and 60`,
    ),
    // A placed row always points at its order; no other row does.
    check(
      "scheduled_checkouts_order_when_placed_check",
      sql`(${table.status} = 'placed') = (${table.orderId} is not null)`,
    ),
    // Rows can be inserted through the Data API, past the API's Zod check, so the database checks
    // that the order goes to the store the insert policy checked.
    // `is not distinct from`, not `=`: a payload with no storeId gives null, and `=` would let it pass.
    check(
      "scheduled_checkouts_payload_store_check",
      sql`${table.payload} ->> 'storeId' is not distinct from ${table.storeId}::text`,
    ),
    // The cron's claim query: pending rows by due time.
    index("scheduled_checkouts_status_due_at_idx").on(table.status, table.dueAt),
  ],
).enableRLS();
