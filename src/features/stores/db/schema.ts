import { sql } from "drizzle-orm";
import { char, check, foreignKey, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { organizations } from "~/features/organizations/db/schema";

export const storeStatus = pgEnum("store_status", ["live", "test"]);

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
    // Who may read stores is decided by policies in the access migration, not here.
  ],
).enableRLS();
