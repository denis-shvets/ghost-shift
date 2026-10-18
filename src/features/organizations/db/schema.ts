import { pgTable, text, uuid } from "drizzle-orm/pg-core";

// A merchant company. Each store belongs to one organization, and a merchant's people
// get access to all of its stores.
export const organizations = pgTable("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
}).enableRLS();
