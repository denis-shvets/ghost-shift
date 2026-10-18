import { sql } from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { stores } from "~/features/stores/db/schema";

export const orderStatus = pgEnum("order_status", [
  "authorized",
  "captured",
  "part_captured",
  "refunded",
  "part_refunded",
  "canceled",
  "expired",
]);

export const paymentMethod = pgEnum("payment_method", [
  "card",
  "invoice",
  "wallet",
  "bank_transfer",
]);

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
    // The human-readable order number shown to merchants and shoppers.
    reference: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    storeId: uuid().notNull(),
    // ISO 4217 currency code, for example SEK. Must match the store's currency.
    currency: char({ length: 3 }).notNull(),
    shopperName: text().notNull(),
    shopperEmail: text().notNull(),
    // ISO 3166-1 alpha-2 country code, for example SE.
    shopperCountry: char({ length: 2 }).notNull(),
    paymentMethod: paymentMethod().notNull(),
    status: orderStatus().notNull(),
    totalAmount: integer().notNull(),
    capturedAmount: integer().notNull().default(0),
    refundedAmount: integer().notNull().default(0),
    // Temporary: moves to a shipments table when shipping is built.
    shippingCarrier: text().notNull(),
    shippingTracking: text(),
  },
  (table) => [
    foreignKey({
      name: "orders_store_currency_fk",
      columns: [table.storeId, table.currency],
      foreignColumns: [stores.id, stores.currency],
    }),
    check("orders_currency_format_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("orders_shopper_country_format_check", sql`${table.shopperCountry} ~ '^[A-Z]{2}$'`),
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
    totalAmount: integer()
      .notNull()
      .generatedAlwaysAs(sql`unit_price * quantity`),
    // The tax included in totalAmount, rounded to the nearest minor unit.
    totalTaxAmount: integer()
      .notNull()
      .generatedAlwaysAs(
        sql`round((unit_price * quantity)::numeric * tax_rate / (10000 + tax_rate))::integer`,
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
