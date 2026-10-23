import { asc, eq, sql } from "drizzle-orm";

import { type Database, withUser } from "~/shared/db/client";
import { pgError } from "~/shared/db/pg-error";
import type { UserClaims } from "~/shared/auth/user-claims";

import type { PayoutAccountInput, StoreSettingsInput } from "../model/store-settings-input";
import { payoutAccounts, stores } from "../db/schema";

// Shown to the person as-is. Anything else goes to the log instead.
export class StoreSettingsError extends Error {}

// For the store filter. Stores only, no organizations join: operators and agents can read stores
// but not organization names, and the join would hide every store from them.
export function listReadableStores(db: Database, user: UserClaims) {
  return withUser(db, user, (tx) =>
    tx
      .select({
        id: stores.id,
        name: stores.name,
        market: stores.market,
        currency: stores.currency,
        status: stores.status,
      })
      .from(stores)
      .orderBy(asc(stores.name)),
  );
}

// The settings page. The payout accounts are the ones the store's organization owns in its currency.
export function getStoreSettings(db: Database, user: UserClaims, storeId: string) {
  return withUser(db, user, async (tx) => {
    const [store] = await tx
      .select({
        id: stores.id,
        name: stores.name,
        market: stores.market,
        currency: stores.currency,
        status: stores.status,
        supportEmail: stores.supportEmail,
        payoutAccountId: stores.payoutAccountId,
        canEdit: sql<boolean>`public.has_permission('stores.edit', ${stores.id})`,
        // Adding an account is checked per organization, so it can differ from canEdit.
        canAddAccount: sql<boolean>`public.has_organization_permission('stores.edit', ${stores.organizationId})`,
        // One round trip: the accounts come back as a JSON array in the same row. Row-level security
        // applies inside the subquery too, so people without payout_accounts.read get an empty list.
        payoutAccounts: sql<
          { id: string; label: string; accountHolderName: string; lastFour: string }[]
        >`coalesce((
          select json_agg(json_build_object(
            'id', pa.id, 'label', pa.label, 'accountHolderName', pa.account_holder_name, 'lastFour', pa.last_four
          ) order by pa.label)
          from public.payout_accounts pa
          where pa.organization_id = stores.organization_id and pa.currency = stores.currency
        ), '[]'::json)`,
      })
      .from(stores)
      .where(eq(stores.id, storeId));
    return store ?? null;
  });
}

// Market and currency are not in the input, and the column grants refuse them too.
export function updateStoreSettings(db: Database, user: UserClaims, input: StoreSettingsInput) {
  return withUser(db, user, async (tx) => {
    const updated = await tx
      .update(stores)
      .set({
        name: input.name,
        supportEmail: input.supportEmail || null,
        payoutAccountId: input.payoutAccountId || null,
      })
      .where(eq(stores.id, input.storeId))
      .returning({ id: stores.id });
    // Row-level security hides stores the person can't edit, so the update changes nothing.
    if (updated.length === 0) throw new StoreSettingsError("You can't change this store");
  }).catch((error: unknown) => {
    // 23503 is a foreign key violation: the payout account isn't this store's organization or currency.
    if (pgError(error)?.code === "23503") {
      throw new StoreSettingsError("That payout account can't be used for this store");
    }
    throw error;
  });
}

// The new account takes the store's organization and currency, so it can always be used by this store.
export function createPayoutAccount(db: Database, user: UserClaims, input: PayoutAccountInput) {
  return withUser(db, user, async (tx) => {
    const [store] = await tx
      .select({
        organizationId: stores.organizationId,
        currency: stores.currency,
        canAdd: sql<boolean>`public.has_organization_permission('stores.edit', ${stores.organizationId})`,
      })
      .from(stores)
      .where(eq(stores.id, input.storeId));
    if (!store) throw new StoreSettingsError("Store not found");
    if (!store.canAdd) throw new StoreSettingsError("You can't add payout accounts to this store");

    const [account] = await tx
      .insert(payoutAccounts)
      .values({
        organizationId: store.organizationId,
        currency: store.currency,
        label: input.label,
        accountHolderName: input.accountHolderName,
        // Simulated payout service: the full number is not kept, only the last four digits.
        lastFour: input.accountNumber.slice(-4),
      })
      .returning({
        id: payoutAccounts.id,
        label: payoutAccounts.label,
        accountHolderName: payoutAccounts.accountHolderName,
        lastFour: payoutAccounts.lastFour,
      });
    // An insert that saves a row always returns it, so this only satisfies the type.
    if (!account) throw new StoreSettingsError("The account could not be saved");
    return account;
  });
}
