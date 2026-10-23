import { sql } from "drizzle-orm";
import { char, check, foreignKey, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { organizations } from "~/features/organizations/db/schema";

export const storeStatus = pgEnum("store_status", ["live", "test"]);

// Sample payout accounts, owned by a merchant company. Only the last four digits are stored.
// Real accounts would come from a payout service; these are invented.
export const payoutAccounts = pgTable(
  "payout_accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    label: text().notNull(),
    accountHolderName: text().notNull(),
    // Shown as ************0987. Never the full number.
    lastFour: char({ length: 4 }).notNull(),
    currency: char({ length: 3 }).notNull(),
  },
  (table) => [
    check("payout_accounts_last_four_format_check", sql`${table.lastFour} ~ '^[0-9]{4}$'`),
    check("payout_accounts_currency_format_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    // Lets a store point at an account of its own organization and currency, all in one foreign key.
    unique("payout_accounts_id_organization_currency_unique").on(
      table.id,
      table.organizationId,
      table.currency,
    ),
    foreignKey({
      name: "payout_accounts_organization_fk",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }),
  ],
).enableRLS();

// One store per market. Orders in a store use the store's currency.
export const stores = pgTable(
  "stores",
  {
    id: uuid().primaryKey().defaultRandom(),
    // The merchant company that owns the store. Access to the store follows its organization.
    organizationId: uuid().notNull(),
    name: text().notNull(),
    // ISO 3166-1 alpha-2 country code, for example SE.
    market: char({ length: 2 }).notNull(),
    // ISO 4217 currency code, for example SEK.
    currency: char({ length: 3 }).notNull(),
    status: storeStatus().notNull(),
    supportEmail: text(),
    payoutAccountId: uuid(),
  },
  (table) => [
    check("stores_market_format_check", sql`${table.market} ~ '^[A-Z]{2}$'`),
    check("stores_currency_format_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    // Lets orders point at (store, currency) together, so an order must use its store's currency.
    unique("stores_id_currency_unique").on(table.id, table.currency),
    foreignKey({
      name: "stores_organization_fk",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }),
    // The payout account must belong to the store's organization and use its currency.
    // A column that is null skips the check, so a store with no payout account is fine.
    foreignKey({
      name: "stores_payout_account_fk",
      columns: [table.payoutAccountId, table.organizationId, table.currency],
      foreignColumns: [payoutAccounts.id, payoutAccounts.organizationId, payoutAccounts.currency],
    }),
    // Who may read stores is decided by policies in the access migration, not here.
  ],
).enableRLS();
