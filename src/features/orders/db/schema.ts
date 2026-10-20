import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

import { agentRuns } from "~/features/agent-runs/db/schema";
import { stores } from "~/features/stores/db/schema";

import { ORDER_EVENT_ACTIONS } from "../model/order-event";
import { ORDER_STATUSES } from "../model/order-statuses";
import { PAYMENT_METHODS } from "../model/payment-methods";

export const orderStatus = pgEnum("order_status", ORDER_STATUSES);

export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);

export const orderLineType = pgEnum("order_line_type", [
  "physical",
  "digital",
  "shipping_fee",
  "discount",
  "surcharge",
]);

// Amounts are stored in minor units (öre, cents), with the currency on the order.
export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    // The human-readable order number shown to merchants and customers.
    reference: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // When the authorization runs out and nothing more can be captured.
    expiresAt: timestamp({ withTimezone: true })
      .notNull()
      .default(sql`now() + interval '28 days'`),
    storeId: uuid().notNull(),
    // ISO 4217 currency code, for example SEK. Must match the store's currency.
    currency: char({ length: 3 }).notNull(),
    // The customer as they were when they ordered. Addresses are in order_addresses.
    customerFirstName: text().notNull(),
    customerLastName: text().notNull(),
    customerEmail: text().notNull(),
    customerPhone: text(),
    paymentMethod: paymentMethod().notNull(),
    status: orderStatus().notNull(),
    // bigint: a large order can add up to more than the 4-byte integer's limit.
    totalAmount: bigint({ mode: "number" }).notNull(),
    capturedAmount: bigint({ mode: "number" }).notNull().default(0),
    refundedAmount: bigint({ mode: "number" }).notNull().default(0),
    // What is left of the authorization. Computed by the database, like the line totals.
    uncapturedAmount: bigint({ mode: "number" })
      .notNull()
      .generatedAlwaysAs(sql`total_amount - captured_amount`),
    // Temporary: moves to a shipments table when shipping is built.
    shippingCarrier: text().notNull(),
    shippingTracking: text(),
    // When the merchant handed the parcel to the carrier. Empty until then.
    // Temporary: moves to a shipments table when shipping is built.
    shippedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "orders_store_currency_fk",
      columns: [table.storeId, table.currency],
      foreignColumns: [stores.id, stores.currency],
    }),
    check("orders_currency_format_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("orders_total_amount_not_negative_check", sql`${table.totalAmount} >= 0`),
    check(
      "orders_captured_amount_range_check",
      sql`${table.capturedAmount} between 0 and ${table.totalAmount}`,
    ),
    check(
      "orders_refunded_amount_range_check",
      sql`${table.refundedAmount} between 0 and ${table.capturedAmount}`,
    ),
    check("orders_expires_after_created_check", sql`${table.expiresAt} > ${table.createdAt}`),
    // An empty shipped_at passes: a check only refuses a row when it is false, not unknown.
    check("orders_shipped_after_created_check", sql`${table.shippedAt} >= ${table.createdAt}`),
    // Emails are stored in lower case, so the search and the index match without lower().
    check(
      "orders_customer_email_lowercase_check",
      sql`${table.customerEmail} = lower(${table.customerEmail})`,
    ),
    // Matches the list's sort order, so pages come straight off the index.
    index("orders_created_at_id_idx").on(table.createdAt.desc(), table.id.desc()),
    // Only open authorizations, so public.expire_orders() finds the due ones without a full scan.
    index("orders_authorized_expires_at_idx")
      .on(table.expiresAt)
      .where(sql`${table.status} = 'authorized'`),
    // Exact email search. Emails are stored in lower case (see the check below), so no lower() is needed.
    index("orders_customer_email_idx").on(table.customerEmail),
  ],
).enableRLS();

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid().notNull(),
    // 1 for the first item in the order, 2 for the second, and so on.
    position: integer().notNull(),
    type: orderLineType().notNull(),
    // The merchant's stock-keeping unit. Empty for lines that aren't products, like shipping.
    sku: text(),
    name: text().notNull(),
    quantity: integer().notNull(),
    // Price of one unit including tax, in minor units. Negative only for discounts.
    unitPrice: integer().notNull(),
    // Tax rate in basis points: 2500 = 25.00 %.
    taxRate: integer().notNull(),
    // Computed by the database, so they can never disagree with price, quantity and rate.
    // bigint and the ::bigint cast: unit_price * quantity can exceed the 4-byte integer's limit.
    totalAmount: bigint({ mode: "number" })
      .notNull()
      .generatedAlwaysAs(sql`unit_price::bigint * quantity`),
    // The tax included in totalAmount, rounded to the nearest minor unit.
    totalTaxAmount: bigint({ mode: "number" })
      .notNull()
      .generatedAlwaysAs(
        sql`round((unit_price::bigint * quantity)::numeric * tax_rate / (10000 + tax_rate))::bigint`,
      ),
  },
  (table) => [
    foreignKey({
      name: "order_lines_order_fk",
      columns: [table.orderId],
      foreignColumns: [orders.id],
    }).onDelete("cascade"),
    unique("order_lines_order_position_unique").on(table.orderId, table.position),
    check("order_lines_quantity_positive_check", sql`${table.quantity} > 0`),
    check("order_lines_tax_rate_range_check", sql`${table.taxRate} between 0 and 10000`),
    check(
      "order_lines_discount_sign_check",
      sql`(${table.type} = 'discount') = (${table.unitPrice} < 0) or ${table.unitPrice} = 0`,
    ),
  ],
).enableRLS();

export const addressKind = pgEnum("address_kind", ["billing", "shipping"]);

// Every order gets both a billing and a shipping address, even when they are the same.
export const orderAddresses = pgTable(
  "order_addresses",
  {
    orderId: uuid().notNull(),
    kind: addressKind().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    company: text(),
    streetAddress: text().notNull(),
    streetAddress2: text(),
    postalCode: text().notNull(),
    city: text().notNull(),
    region: text(),
    // ISO 3166-1 alpha-2 country code, for example SE.
    country: char({ length: 2 }).notNull(),
    phone: text(),
  },
  (table) => [
    primaryKey({ name: "order_addresses_pk", columns: [table.orderId, table.kind] }),
    foreignKey({
      name: "order_addresses_order_fk",
      columns: [table.orderId],
      foreignColumns: [orders.id],
    }).onDelete("cascade"),
    check("order_addresses_country_format_check", sql`${table.country} ~ '^[A-Z]{2}$'`),
  ],
).enableRLS();

export const orderEventAction = pgEnum("order_event_action", ORDER_EVENT_ACTIONS);

// The order's timeline. Append-only: nobody is granted update or delete.
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    action: orderEventAction().notNull(),
    // Empty for the system, or when the user has been deleted.
    actorUserId: uuid(),
    // A copy of who did it, because other users can't read auth.users.
    actorName: text().notNull(),
    // Shape per action: OrderEventMetadata in model/order-event.ts.
    metadata: jsonb().notNull().default({}),
    // The agent run that made this change. Empty for people acting outside a run.
    agentRunId: uuid(),
  },
  (table) => [
    foreignKey({
      name: "order_events_order_fk",
      columns: [table.orderId],
      foreignColumns: [orders.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "order_events_actor_user_fk",
      columns: [table.actorUserId],
      foreignColumns: [authUsers.id],
    }).onDelete("set null"),
    foreignKey({
      name: "order_events_agent_run_fk",
      columns: [table.agentRunId],
      foreignColumns: [agentRuns.id],
    }).onDelete("set null"),
    check("order_events_metadata_object_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("order_events_order_occurred_at_idx").on(table.orderId, table.occurredAt),
    // "Events of one run". Most events have no run, so only the linked ones are indexed.
    index("order_events_agent_run_idx")
      .on(table.agentRunId)
      .where(sql`${table.agentRunId} is not null`),
  ],
).enableRLS();
