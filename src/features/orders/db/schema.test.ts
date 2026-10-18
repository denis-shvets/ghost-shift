import { TransactionRollbackError, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import { stores } from "~/features/stores/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb, withRole, withUser } from "~/shared/db/client";

import { orderLines, orders } from "./schema";

// These tests check the row-level security rules themselves, against the local database.
// They need the database with seed data (`pnpm db:reset`), not the Auth service.
const db = createDb(testDatabaseUrl);

beforeAll(() => createTestAccounts(db));
afterAll(() => db.close());

// Postgres error 42501 is "insufficient_privilege", which is what "permission denied" means.
// Drizzle wraps the Postgres error, so the code sits on its `cause`.
const permissionDenied = { cause: { code: "42501" } };

// Ids shared with supabase/seed.sql through src/shared/seed/seed-ids.json.
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

const moonlightGoods = seedIds.organizations.moonlightGoods;
const moonlightSweden = seedIds.stores.moonlightSweden;
const nordicBikesGermany = seedIds.stores.nordicBikesGermany;

// The claims the app would send for this account. Only the subject matters to the policies.
function asUser(id: string): UserClaims {
  return { sub: id, global_roles: [] };
}

function readableReferences(userId: string) {
  return withUser(db, asUser(userId), (tx) => tx.select().from(orders)).then((rows) =>
    rows.map((order) => order.reference).sort(),
  );
}

async function hasPermission(userId: string, permission: string, storeId: string) {
  const [row] = await withUser(db, asUser(userId), (tx) =>
    tx.execute<{ allowed: boolean }>(
      sql`select public.has_permission(${permission}, ${storeId}::uuid) as allowed`,
    ),
  );
  return row?.allowed;
}

describe("anonymous visitors", () => {
  it("can't read orders", async () => {
    await expect(withRole(db, "anon", (tx) => tx.select().from(orders))).rejects.toMatchObject(
      permissionDenied,
    );
  });

  it("can't read order lines", async () => {
    await expect(withRole(db, "anon", (tx) => tx.select().from(orderLines))).rejects.toMatchObject(
      permissionDenied,
    );
  });

  it("can't read stores", async () => {
    await expect(withRole(db, "anon", (tx) => tx.select().from(stores))).rejects.toMatchObject(
      permissionDenied,
    );
  });
});

describe("signed-in users see what their access allows", () => {
  const ownOrders = ["MG-1001", "MG-1002", "MG-1003", "MG-1004"];

  it("a merchant sees their own company's orders only", async () => {
    expect(await readableReferences(testAccounts.merchantA)).toEqual(ownOrders);
  });

  it("another merchant sees only their own company's orders", async () => {
    expect(await readableReferences(testAccounts.merchantB)).toEqual(["NB-2001"]);
  });

  it("an agent sees only orders of the stores assigned to them", async () => {
    expect(await readableReferences(testAccounts.agent)).toEqual(["NB-2001"]);
  });

  it("a developer sees every order", async () => {
    expect(await readableReferences(testAccounts.developer)).toEqual([
      "MG-1001",
      "MG-1002",
      "MG-1003",
      "MG-1004",
      "NB-2001",
    ]);
  });

  it("someone with no access sees no orders or stores", async () => {
    expect(await readableReferences(testAccounts.stranger)).toEqual([]);
    const storeRows = await withUser(db, asUser(testAccounts.stranger), (tx) =>
      tx.select().from(stores),
    );
    expect(storeRows).toEqual([]);
  });

  it("can't write orders, because no write policy exists yet", async () => {
    await expect(
      withUser(db, asUser(testAccounts.merchantA), (tx) =>
        tx.execute(sql`update public.orders set shopper_name = 'Changed'`),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });
});

describe("a person's permissions are the union of their roles", () => {
  it("a merchant with two roles at one company may edit orders and handle disputes", async () => {
    expect(await hasPermission(testAccounts.merchantA, "orders.edit", moonlightSweden)).toBe(true);
    expect(await hasPermission(testAccounts.merchantA, "disputes.manage", moonlightSweden)).toBe(
      true,
    );
  });

  it("a merchant's roles don't reach another company's stores", async () => {
    expect(await hasPermission(testAccounts.merchantA, "orders.edit", nordicBikesGermany)).toBe(
      false,
    );
    expect(await hasPermission(testAccounts.merchantA, "disputes.manage", nordicBikesGermany)).toBe(
      false,
    );
  });

  it("a dispute handler may handle disputes but not edit orders", async () => {
    expect(await hasPermission(testAccounts.merchantB, "disputes.manage", nordicBikesGermany)).toBe(
      true,
    );
    expect(await hasPermission(testAccounts.merchantB, "orders.edit", nordicBikesGermany)).toBe(
      false,
    );
  });

  it("an agent with second-line support may edit orders at an assigned store", async () => {
    expect(await hasPermission(testAccounts.agent, "orders.edit", nordicBikesGermany)).toBe(true);
  });

  it("removing one of two roles removes only that role's permissions", async () => {
    // Remove second-line support, check, then put it back so later tests still see it.
    await db.execute(
      sql`delete from public.store_assignments
        where user_id = ${testAccounts.agent}::uuid and role = 'agent_second_line'`,
    );
    try {
      expect(await hasPermission(testAccounts.agent, "orders.edit", nordicBikesGermany)).toBe(
        false,
      );
      expect(await hasPermission(testAccounts.agent, "orders.read", nordicBikesGermany)).toBe(true);
    } finally {
      await db.execute(
        sql`insert into public.store_assignments (user_id, store_id, role)
          values (${testAccounts.agent}::uuid, ${nordicBikesGermany}::uuid, 'agent_second_line')
          on conflict do nothing`,
      );
    }
  });

  it("a permission that doesn't exist is never granted", async () => {
    expect(await hasPermission(testAccounts.developer, "orders.delete", nordicBikesGermany)).toBe(
      false,
    );
  });
});

describe("a role can only be granted at its own scope", () => {
  // Postgres error 23503 is "foreign_key_violation": the role doesn't exist at that scope.
  const foreignKeyViolation = { cause: { code: "23503" } };

  it("a store role can't be given at company level", async () => {
    await expect(
      db.execute(
        sql`insert into public.org_members (user_id, organization_id, role)
          values (${testAccounts.stranger}::uuid, ${moonlightGoods}::uuid, 'agent_first_line')`,
      ),
    ).rejects.toMatchObject(foreignKeyViolation);
  });

  it("a company role can't be given at store level", async () => {
    await expect(
      db.execute(
        sql`insert into public.store_assignments (user_id, store_id, role)
          values (${testAccounts.stranger}::uuid, ${nordicBikesGermany}::uuid, 'merchant_admin')`,
      ),
    ).rejects.toMatchObject(foreignKeyViolation);
  });
});

describe("access token hook", () => {
  // Makes its own user inside a transaction that is rolled back, so the test leaves no rows
  // behind and needs no seeded accounts (CI runs only the database, not Auth).
  it("copies the user's global roles into the global_roles claim", async () => {
    const userId = randomUUID();
    let roles: string[] | undefined;

    await db
      .transaction(async (tx) => {
        await tx.execute(
          sql`insert into auth.users (id, email, raw_app_meta_data)
            values (${userId}::uuid, 'hook-test@ghostshift.test', '{}'::jsonb)`,
        );
        await tx.execute(
          sql`insert into public.user_roles (user_id, role) values (${userId}::uuid, 'platform_developer')`,
        );
        const [row] = await tx.execute<{ claims: { global_roles: string[] } }>(
          sql`select public.custom_access_token_hook(
            jsonb_build_object(
              'user_id', ${userId}::text,
              'claims', jsonb_build_object('sub', ${userId}::text)
            )
          ) -> 'claims' as claims`,
        );
        roles = row?.claims.global_roles;
        tx.rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });

    expect(roles).toEqual(["platform_developer"]);
  });
});
