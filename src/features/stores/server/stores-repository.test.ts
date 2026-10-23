import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb, withUser } from "~/shared/db/client";
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

import { payoutAccounts, stores } from "../db/schema";
import {
  StoreSettingsError,
  createPayoutAccount,
  getStoreSettings,
  listReadableStores,
  updateStoreSettings,
} from "./stores-repository";

// Runs against the local Supabase database with seed data (`pnpm db:reset`).
const db = createDb(testDatabaseUrl);

beforeAll(() => createTestAccounts(db));
afterAll(() => db.close());

describe("listReadableStores", () => {
  it("lists every store for a platform operator, who can read stores but not organizations", async () => {
    const operator: UserClaims = {
      sub: testAccounts.operator,
      global_roles: ["platform_operator"],
    };

    const names = (await listReadableStores(db, operator)).map((store) => store.name);

    expect(names).toHaveLength(20);
    expect(names).toContain("Satin Sparrow");
  });

  it("lists only the stores an agent is assigned to", async () => {
    const agent: UserClaims = { sub: testAccounts.agent, global_roles: [] };

    const names = (await listReadableStores(db, agent)).map((store) => store.name);

    expect(names).toEqual(["Satin Sparrow"]);
  });

  it("lists no stores to a user with no access", async () => {
    const stranger: UserClaims = {
      sub: testAccounts.stranger,
      global_roles: [],
    };

    expect(await listReadableStores(db, stranger)).toEqual([]);
  });
});

// Velour Vault is a Northstar Threads store in SEK. Its payout accounts are the Northstar SEK ones.
const developer: UserClaims = { sub: testAccounts.developer, global_roles: ["platform_developer"] };
// Northstar merchant with order and dispute roles only: no stores.edit.
const merchant: UserClaims = { sub: testAccounts.merchantA, global_roles: [] };
// Northstar merchant admin: holds stores.edit at organization level, not as a global role.
const merchantAdmin: UserClaims = { sub: testAccounts.merchantAdmin, global_roles: [] };
const payoutAccountRefusal = "That payout account can't be used for this store";

describe("getStoreSettings", () => {
  it("lists only the payout accounts of the store's organization in its currency", async () => {
    const store = await getStoreSettings(db, developer, seedIds.stores.velourVault);

    const ids = store?.payoutAccounts.map((account) => account.id);
    expect(ids).toContain(seedIds.payoutAccounts.northstarSek);
    expect(ids).not.toContain(seedIds.payoutAccounts.northstarEur);
    expect(ids).not.toContain(seedIds.payoutAccounts.larkLoomSek);
  });

  it("hides payout accounts from a platform operator, who can read the store but not the organization's accounts", async () => {
    const operator: UserClaims = {
      sub: testAccounts.operator,
      global_roles: ["platform_operator"],
    };

    const store = await getStoreSettings(db, operator, seedIds.stores.velourVault);

    expect(store?.payoutAccounts).toEqual([]);
  });

  it("says whether the person can edit the store", async () => {
    const asDeveloper = await getStoreSettings(db, developer, seedIds.stores.velourVault);
    const asMerchant = await getStoreSettings(db, merchant, seedIds.stores.velourVault);

    expect(asDeveloper?.canEdit).toBe(true);
    expect(asMerchant?.canEdit).toBe(false);
  });

  it("lets a merchant admin edit the store and see its organization's accounts", async () => {
    const store = await getStoreSettings(db, merchantAdmin, seedIds.stores.velourVault);

    expect(store?.canEdit).toBe(true);
    expect(store?.canAddAccount).toBe(true);
    expect(store?.payoutAccounts.map((account) => account.id)).toContain(
      seedIds.payoutAccounts.northstarSek,
    );
  });

  it("returns nothing for a store the person can't read", async () => {
    const stranger: UserClaims = { sub: testAccounts.stranger, global_roles: [] };

    expect(await getStoreSettings(db, stranger, seedIds.stores.velourVault)).toBeNull();
  });
});

describe("updateStoreSettings", () => {
  it("saves the name, support email and payout account, then puts the originals back", async () => {
    const original = { name: "Velour Vault", supportEmail: "", payoutAccountId: "" };
    const changed = {
      storeId: seedIds.stores.velourVault,
      name: "Velour Vault Test",
      supportEmail: "help@velour.example",
      payoutAccountId: seedIds.payoutAccounts.northstarSek,
    };

    try {
      await updateStoreSettings(db, developer, changed);
      const saved = await getStoreSettings(db, developer, seedIds.stores.velourVault);
      expect(saved).toMatchObject({
        name: "Velour Vault Test",
        supportEmail: "help@velour.example",
        payoutAccountId: seedIds.payoutAccounts.northstarSek,
      });
    } finally {
      // Runs even when an expectation above fails, so the seed store is never left renamed.
      await updateStoreSettings(db, developer, { ...original, storeId: changed.storeId });
    }

    const restored = await getStoreSettings(db, developer, seedIds.stores.velourVault);
    expect(restored).toMatchObject({
      name: "Velour Vault",
      supportEmail: null,
      payoutAccountId: null,
    });
  });

  it("refuses a store the person can't edit, and changes nothing", async () => {
    await expect(
      updateStoreSettings(db, merchant, {
        storeId: seedIds.stores.velourVault,
        name: "Hacked",
        supportEmail: "",
        payoutAccountId: "",
      }),
    ).rejects.toThrow(new StoreSettingsError("You can't change this store"));

    const store = await getStoreSettings(db, developer, seedIds.stores.velourVault);
    expect(store?.name).toBe("Velour Vault");
  });

  it("refuses a payout account from another organization or another currency", async () => {
    // Lark & Loom Stockholm is in another organization than the Northstar account.
    await expect(
      updateStoreSettings(db, developer, {
        storeId: seedIds.stores.larkLoomStockholm,
        name: "Lark & Loom Stockholm",
        supportEmail: "",
        payoutAccountId: seedIds.payoutAccounts.northstarSek,
      }),
    ).rejects.toThrow(new StoreSettingsError(payoutAccountRefusal));

    // Velour Vault is in SEK, so the EUR account is refused even though it is the same organization.
    await expect(
      updateStoreSettings(db, developer, {
        storeId: seedIds.stores.velourVault,
        name: "Velour Vault",
        supportEmail: "",
        payoutAccountId: seedIds.payoutAccounts.northstarEur,
      }),
    ).rejects.toThrow(new StoreSettingsError(payoutAccountRefusal));
  });

  // Market and currency are locked by column grants, so the database refuses a direct change.
  it("refuses a direct change to a store's currency or market", async () => {
    const attempt = withUser(db, developer, (tx) =>
      tx.update(stores).set({ currency: "EUR" }).where(eq(stores.id, seedIds.stores.velourVault)),
    );

    await expect(attempt).rejects.toMatchObject({ cause: { code: "42501" } });
    const store = await getStoreSettings(db, developer, seedIds.stores.velourVault);
    expect(store?.currency).toBe("SEK");
  });
});

describe("createPayoutAccount", () => {
  // Removes the account this block adds, so later runs see the seed data only.
  afterAll(() => db.execute(sql`delete from public.payout_accounts where label = 'Test account'`));

  it("adds an account in the store's organization and currency", async () => {
    const account = await createPayoutAccount(db, developer, {
      storeId: seedIds.stores.velourVault,
      label: "Test account",
      accountHolderName: "Northstar Threads AB",
      accountNumber: "123456781234",
    });

    expect(account).toMatchObject({ label: "Test account", lastFour: "1234" });
    const store = await getStoreSettings(db, developer, seedIds.stores.velourVault);
    expect(store?.payoutAccounts.map((item) => item.id)).toContain(account.id);
  });

  it("lets a merchant admin add an account to the store's organization", async () => {
    const account = await createPayoutAccount(db, merchantAdmin, {
      storeId: seedIds.stores.velourVault,
      label: "Test account",
      accountHolderName: "Northstar Threads AB",
      accountNumber: "876587658765",
    });

    expect(account).toMatchObject({ label: "Test account", lastFour: "8765" });
  });

  it("refuses to add an account for a store the person can't edit, and adds nothing", async () => {
    const before = await db.select({ id: payoutAccounts.id }).from(payoutAccounts);

    await expect(
      createPayoutAccount(db, merchant, {
        storeId: seedIds.stores.velourVault,
        label: "Not allowed",
        accountHolderName: "Northstar Threads AB",
        accountNumber: "567856785678",
      }),
    ).rejects.toThrow(new StoreSettingsError("You can't add payout accounts to this store"));

    const after = await db.select({ id: payoutAccounts.id }).from(payoutAccounts);
    expect(after).toHaveLength(before.length);
  });
});
