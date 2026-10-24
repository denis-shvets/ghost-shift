import { sql } from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  pgEnum,
  pgTable,
  bigint,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { orderEvents } from "~/features/orders/db/schema";
import { payoutAccounts, stores } from "~/features/stores/db/schema";

export const settlementFrequency = pgEnum("settlement_frequency", ["weekly", "monthly"]);

// One per store. The current period is [period_start, period_end); the sweep closes it and moves on.
export const settlementSchedules = pgTable(
  "settlement_schedules",
  {
    id: uuid().primaryKey().defaultRandom(),
    storeId: uuid().notNull(),
    frequency: settlementFrequency().notNull(),
    payoutAccountId: uuid().notNull(),
    periodStart: timestamp({ withTimezone: true }).notNull(),
    periodEnd: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    unique("settlement_schedules_store_unique").on(table.storeId),
    foreignKey({
      name: "settlement_schedules_store_fk",
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "settlement_schedules_payout_account_fk",
      columns: [table.payoutAccountId],
      foreignColumns: [payoutAccounts.id],
    }),
    check("settlement_schedules_period_check", sql`${table.periodEnd} > ${table.periodStart}`),
  ],
).enableRLS();

export const settlementStatus = pgEnum("settlement_status", ["pending", "paid"]);

// One payout for one store and period. Amounts are minor units; net = gross - refunded.
export const settlements = pgTable(
  "settlements",
  {
    id: uuid().primaryKey().defaultRandom(),
    storeId: uuid().notNull(),
    payoutAccountId: uuid().notNull(),
    // ISO 4217 code, copied from the store. Must match the store's currency.
    currency: char({ length: 3 }).notNull(),
    periodStart: timestamp({ withTimezone: true }).notNull(),
    periodEnd: timestamp({ withTimezone: true }).notNull(),
    status: settlementStatus().notNull().default("pending"),
    grossAmount: bigint({ mode: "number" }).notNull(),
    refundedAmount: bigint({ mode: "number" }).notNull(),
    // Can be negative: refunds on already-paid orders reduce the next payout.
    netAmount: bigint({ mode: "number" }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Set when a developer approves the payout. Only pending payouts can be approved.
    paidAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "settlements_store_fk",
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }),
    foreignKey({
      name: "settlements_payout_account_fk",
      columns: [table.payoutAccountId],
      foreignColumns: [payoutAccounts.id],
    }),
    // One settlement per store and period end. Re-running the sweep can't make a second one.
    unique("settlements_store_period_end_unique").on(table.storeId, table.periodEnd),
    check("settlements_currency_format_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("settlements_period_check", sql`${table.periodEnd} > ${table.periodStart}`),
    check("settlements_gross_amount_check", sql`${table.grossAmount} >= 0`),
    check("settlements_refunded_amount_check", sql`${table.refundedAmount} >= 0`),
    check(
      "settlements_net_amount_check",
      sql`${table.netAmount} = ${table.grossAmount} - ${table.refundedAmount}`,
    ),
  ],
).enableRLS();

// One row per captured or refunded order event. Each event is paid out exactly once.
export const settlementItems = pgTable(
  "settlement_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    settlementId: uuid().notNull(),
    orderEventId: uuid().notNull(),
    // Positive for a capture, negative for a refund.
    amount: bigint({ mode: "number" }).notNull(),
  },
  (table) => [
    unique("settlement_items_order_event_unique").on(table.orderEventId),
    foreignKey({
      name: "settlement_items_settlement_fk",
      columns: [table.settlementId],
      foreignColumns: [settlements.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "settlement_items_order_event_fk",
      columns: [table.orderEventId],
      foreignColumns: [orderEvents.id],
    }),
    check("settlement_items_amount_not_zero_check", sql`${table.amount} <> 0`),
  ],
).enableRLS();
