import { TransactionRollbackError, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import { organizations } from "~/features/organizations/db/schema";
import { stores } from "~/features/stores/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb, withRole, withUser } from "~/shared/db/client";

import { orderAddresses, orderEvents, orderLines, orders } from "./schema";

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
  // The seed has many generated orders too, so these checks look at the fixed ones and at prefixes.
  const moonlightOrders = ["MG-1001", "MG-1002", "MG-1003", "MG-1004"];

  it("a merchant sees their own company's orders only", async () => {
    const references = await readableReferences(testAccounts.merchantA);
    expect(references).toEqual(expect.arrayContaining(moonlightOrders));
    expect(references.some((reference) => reference.startsWith("NB-"))).toBe(false);
  });

  it("another merchant sees only their own company's orders", async () => {
    const references = await readableReferences(testAccounts.merchantB);
    expect(references).toContain("NB-2001");
    expect(references.some((reference) => reference.startsWith("MG-"))).toBe(false);
  });

  it("an agent sees only orders of the stores assigned to them", async () => {
    const references = await readableReferences(testAccounts.agent);
    expect(references).toContain("NB-2001");
    expect(references.some((reference) => reference.startsWith("MG-"))).toBe(false);
  });

  it("a developer sees every order", async () => {
    const references = await readableReferences(testAccounts.developer);
    expect(references).toEqual(expect.arrayContaining([...moonlightOrders, "NB-2001"]));
    expect(references.some((reference) => reference.startsWith("MG-"))).toBe(true);
    expect(references.some((reference) => reference.startsWith("NB-"))).toBe(true);
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
        tx.execute(sql`update public.orders set customer_first_name = 'Changed'`),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });
});

describe("addresses and timeline follow the order", () => {
  // MG-1001 belongs to Moonlight Goods, NB-2001 to Nordic Bikes (supabase/seed-orders.sql).
  const moonlightOrder = "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922";
  const nordicOrder = "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b";

  function readable(userId: string, orderId: string) {
    return withUser(db, asUser(userId), async (tx) => ({
      addresses: (await tx.select().from(orderAddresses).where(eq(orderAddresses.orderId, orderId)))
        .length,
      events: (await tx.select().from(orderEvents).where(eq(orderEvents.orderId, orderId))).length,
    }));
  }

  it("a merchant reads the addresses and timeline of their own company's orders", async () => {
    const own = await readable(testAccounts.merchantA, moonlightOrder);
    expect(own.addresses).toBe(2);
    expect(own.events).toBeGreaterThan(0);
  });

  it("a merchant can't read another company's customer addresses or timeline", async () => {
    expect(await readable(testAccounts.merchantA, nordicOrder)).toEqual({
      addresses: 0,
      events: 0,
    });
  });

  it("anonymous visitors can't read addresses or events", async () => {
    await expect(
      withRole(db, "anon", (tx) => tx.select().from(orderAddresses)),
    ).rejects.toMatchObject(permissionDenied);
    await expect(withRole(db, "anon", (tx) => tx.select().from(orderEvents))).rejects.toMatchObject(
      permissionDenied,
    );
  });

  it("nobody can rewrite the timeline, not even a developer", async () => {
    await expect(
      withUser(db, asUser(testAccounts.developer), (tx) =>
        tx.execute(sql`update public.order_events set actor_name = 'Changed'`),
      ),
    ).rejects.toMatchObject(permissionDenied);
    await expect(
      withUser(db, asUser(testAccounts.developer), (tx) =>
        tx.execute(sql`delete from public.order_events`),
      ),
    ).rejects.toMatchObject(permissionDenied);
    // TRUNCATE skips row-level security, so only the missing grant stops it.
    await expect(
      withUser(db, asUser(testAccounts.developer), (tx) =>
        tx.execute(sql`truncate public.order_events`),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });

  it("a merchant can't add timeline events, because only orders.create allows inserts", async () => {
    await expect(
      withUser(db, asUser(testAccounts.merchantA), (tx) =>
        tx.insert(orderEvents).values({
          orderId: moonlightOrder,
          action: "captured",
          actorName: "Merchant",
          metadata: { amount: 1 },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("timeline events a developer adds", () => {
  // MG-1001, a Moonlight Goods order the developer may add events to.
  const moonlightOrder = "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922";

  function addEvent(values: { actorUserId: string; action: "authorized" | "refunded" }) {
    return withUser(db, asUser(testAccounts.developer), (tx) =>
      tx.insert(orderEvents).values({
        orderId: moonlightOrder,
        actorName: "Phantom Checkout",
        metadata: { amount: 1 },
        ...values,
      }),
    );
  }

  it("must name the developer as the actor", async () => {
    await expect(
      addEvent({ actorUserId: testAccounts.merchantA, action: "authorized" }),
    ).rejects.toThrow();
  });

  it("can only be an authorization, so refunds can't be made up", async () => {
    await expect(
      addEvent({ actorUserId: testAccounts.developer, action: "refunded" }),
    ).rejects.toThrow();
  });
});

describe("organization names", () => {
  // Organizations are read through their own policy, not through the store's.
  function readableOrganizations(userId: string) {
    return withUser(db, asUser(userId), (tx) => tx.select().from(organizations)).then((rows) =>
      rows.map((organization) => organization.id).sort(),
    );
  }

  it("a platform operator can't read any organization name", async () => {
    expect(await readableOrganizations(testAccounts.operator)).toEqual([]);
  });

  it("a platform developer can read every organization name", async () => {
    expect(await readableOrganizations(testAccounts.developer)).toEqual(
      Object.values(seedIds.organizations).sort(),
    );
  });

  it("a merchant can read only their own organization", async () => {
    expect(await readableOrganizations(testAccounts.merchantA)).toEqual([moonlightGoods]);
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

describe("creating orders", () => {
  // Each test uses its own reference, so a failed run can't clash with the next one.
  function newOrder(reference: string) {
    return {
      reference,
      storeId: moonlightSweden,
      currency: "SEK",
      customerFirstName: "Test",
      customerLastName: "Customer",
      customerEmail: "customer@ghostshift.test",
      paymentMethod: "card" as const,
      status: "authorized" as const,
      totalAmount: 20000,
      shippingCarrier: "PostNord",
    };
  }

  // Removes the test order; its lines go with it (on delete cascade). Runs as the owner, so RLS doesn't apply.
  function removeOrder(reference: string) {
    return db.delete(orders).where(eq(orders.reference, reference));
  }

  it("a platform developer can create an order and its lines", async () => {
    const reference = `TEST-${randomUUID()}`;
    try {
      await withUser(db, asUser(testAccounts.developer), async (tx) => {
        const [order] = await tx.insert(orders).values(newOrder(reference)).returning();
        await tx.insert(orderLines).values([
          {
            orderId: order!.id,
            position: 1,
            type: "physical",
            name: "Test product",
            quantity: 2,
            unitPrice: 10000,
            taxRate: 2500,
          },
          {
            orderId: order!.id,
            position: 2,
            type: "discount",
            name: "Test discount",
            quantity: 1,
            unitPrice: -1000,
            taxRate: 0,
          },
        ]);
      });

      const lines = await db
        .select()
        .from(orderLines)
        .innerJoin(orders, eq(orderLines.orderId, orders.id))
        .where(eq(orders.reference, reference))
        .orderBy(orderLines.position);
      // The database computes the totals, so the app never sends them.
      expect(lines.map((row) => row.order_lines.totalAmount)).toEqual([20000, -1000]);
      expect(lines.map((row) => row.order_lines.totalTaxAmount)).toEqual([4000, 0]);
    } finally {
      await removeOrder(reference);
    }
  });

  it.each([
    ["a merchant", () => testAccounts.merchantA],
    ["an agent", () => testAccounts.agent],
    ["a platform operator", () => testAccounts.operator],
    ["someone with no access", () => testAccounts.stranger],
  ])("%s can't create an order", async (_, userId) => {
    const reference = `TEST-${randomUUID()}`;
    await expect(
      withUser(db, asUser(userId()), (tx) => tx.insert(orders).values(newOrder(reference))),
    ).rejects.toMatchObject(permissionDenied);
    // Nothing was saved, so there's nothing to clean up. Check anyway.
    const saved = await db.select().from(orders).where(eq(orders.reference, reference));
    expect(saved).toEqual([]);
  });

  it("a merchant can't add lines to an order they can't see", async () => {
    const reference = `TEST-${randomUUID()}`;
    try {
      await withUser(db, asUser(testAccounts.developer), (tx) =>
        tx.insert(orders).values(newOrder(reference)),
      );
      const [order] = await db.select().from(orders).where(eq(orders.reference, reference));
      await expect(
        withUser(db, asUser(testAccounts.stranger), (tx) =>
          tx.insert(orderLines).values({
            orderId: order!.id,
            position: 1,
            type: "physical",
            name: "Sneaky line",
            quantity: 1,
            unitPrice: 100,
            taxRate: 0,
          }),
        ),
      ).rejects.toMatchObject(permissionDenied);
    } finally {
      await removeOrder(reference);
    }
  });

  it("a merchant can't add lines to their own store's order, even though they can read it", async () => {
    const reference = `TEST-${randomUUID()}`;
    try {
      await withUser(db, asUser(testAccounts.developer), (tx) =>
        tx.insert(orders).values(newOrder(reference)),
      );
      const [order] = await db.select().from(orders).where(eq(orders.reference, reference));
      await expect(
        withUser(db, asUser(testAccounts.merchantA), (tx) =>
          tx.insert(orderLines).values({
            orderId: order!.id,
            position: 1,
            type: "physical",
            name: "Extra line",
            quantity: 1,
            unitPrice: 100,
            taxRate: 0,
          }),
        ),
      ).rejects.toMatchObject(permissionDenied);
    } finally {
      await removeOrder(reference);
    }
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
