import { sql } from "drizzle-orm";
import { char, check, pgEnum, pgPolicy, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { anonRole, authenticatedRole } from "drizzle-orm/supabase";

export const storeStatus = pgEnum("store_status", ["live", "test"]);

// One store per market. Orders in a store use the store's currency.
export const stores = pgTable(
  "stores",
  {
    id: uuid().primaryKey().defaultRandom(),
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
    // Demo data is public for now. Writes get their own policies when sign-in arrives.
    pgPolicy("stores are readable by everyone", {
      for: "select",
      to: [anonRole, authenticatedRole],
      using: sql`true`,
    }),
  ],
);
