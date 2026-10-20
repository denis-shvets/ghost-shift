import { asc } from "drizzle-orm";

import { type Database, withUser } from "~/shared/db/client";
import type { UserClaims } from "~/shared/auth/user-claims";

import { stores } from "../db/schema";

// For the store filter. Stores only, no organizations join: operators and agents can read stores
// but not organization names, and the join would hide every store from them.
export function listReadableStores(db: Database, user: UserClaims) {
  return withUser(db, user, (tx) =>
    tx.select({ id: stores.id, name: stores.name }).from(stores).orderBy(asc(stores.name)),
  );
}
