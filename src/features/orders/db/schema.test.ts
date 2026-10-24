import { TransactionRollbackError, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import type { OrderStatus } from "~/features/orders/model/order-statuses";
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

const northstarThreads = seedIds.organizations.northstarThreads;
const velourVault = seedIds.stores.velourVault;
const satinSparrow = seedIds.stores.satinSparrow;

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
  const northstarOrders = ["NS-1001", "NS-1002", "NS-1003", "NS-1004"];

  it("a merchant sees their own company's orders only", async () => {
    const references = await readableReferences(testAccounts.merchantA);
    expect(references).toEqual(expect.arrayContaining(northstarOrders));
    expect(references.some((reference) => reference.startsWith("PA-"))).toBe(false);
  });

  it("another merchant sees only their own company's orders", async () => {
    const references = await readableReferences(testAccounts.merchantB);
    expect(references).toContain("PA-2001");
    expect(references.some((reference) => reference.startsWith("NS-"))).toBe(false);
  });

  it("an agent sees only orders of the stores assigned to them", async () => {
    const references = await readableReferences(testAccounts.agent);
    expect(references).toContain("PA-2001");
    expect(references.some((reference) => reference.startsWith("NS-"))).toBe(false);
  });

  it("a developer sees every order", async () => {
    const references = await readableReferences(testAccounts.developer);
    expect(references).toEqual(expect.arrayContaining([...northstarOrders, "PA-2001"]));
    expect(references.some((reference) => reference.startsWith("NS-"))).toBe(true);
    expect(references.some((reference) => reference.startsWith("PA-"))).toBe(true);
  });

  it("someone with no access sees no orders or stores", async () => {
    expect(await readableReferences(testAccounts.stranger)).toEqual([]);
    const storeRows = await withUser(db, asUser(testAccounts.stranger), (tx) =>
      tx.select().from(stores),
    );
    expect(storeRows).toEqual([]);
  });

  it("can't update orders directly, because no update policy exists", async () => {
    await expect(
      withUser(db, asUser(testAccounts.merchantA), (tx) =>
        tx.execute(sql`update public.orders set customer_first_name = 'Changed'`),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });
});

describe("addresses and timeline follow the order", () => {
  // NS-1001 belongs to Northstar Threads, PA-2001 to Pocket Atelier (supabase/seed-orders.sql).
  const northstarOrder = "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922";
  const pocketOrder = "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b";

  function readable(userId: string, orderId: string) {
    return withUser(db, asUser(userId), async (tx) => ({
      addresses: (await tx.select().from(orderAddresses).where(eq(orderAddresses.orderId, orderId)))
        .length,
      events: (await tx.select().from(orderEvents).where(eq(orderEvents.orderId, orderId))).length,
    }));
  }

  it("a merchant reads the addresses and timeline of their own company's orders", async () => {
    const own = await readable(testAccounts.merchantA, northstarOrder);
    expect(own.addresses).toBe(2);
    expect(own.events).toBeGreaterThan(0);
  });

  it("a merchant can't read another company's customer addresses or timeline", async () => {
    expect(await readable(testAccounts.merchantA, pocketOrder)).toEqual({
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
          orderId: northstarOrder,
          action: "captured",
          actorName: "Merchant",
          metadata: { amount: 1 },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("timeline events a developer adds", () => {
  // NS-1001, a Northstar Threads order the developer may add events to.
  const northstarOrder = "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922";

  function addEvent(values: { actorUserId: string; action: "authorized" | "refunded" }) {
    return withUser(db, asUser(testAccounts.developer), (tx) =>
      tx.insert(orderEvents).values({
        orderId: northstarOrder,
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
    expect(await readableOrganizations(testAccounts.merchantA)).toEqual([northstarThreads]);
  });
});

describe("a person's permissions are the union of their roles", () => {
  it("a merchant with two roles at one company may edit orders and handle disputes", async () => {
    expect(await hasPermission(testAccounts.merchantA, "orders.edit", velourVault)).toBe(true);
    expect(await hasPermission(testAccounts.merchantA, "disputes.manage", velourVault)).toBe(true);
  });

  it("a merchant's roles don't reach another company's stores", async () => {
    expect(await hasPermission(testAccounts.merchantA, "orders.edit", satinSparrow)).toBe(false);
    expect(await hasPermission(testAccounts.merchantA, "disputes.manage", satinSparrow)).toBe(
      false,
    );
  });

  it("a dispute handler may handle disputes but not edit orders", async () => {
    expect(await hasPermission(testAccounts.merchantB, "disputes.manage", satinSparrow)).toBe(true);
    expect(await hasPermission(testAccounts.merchantB, "orders.edit", satinSparrow)).toBe(false);
  });

  it("an agent with second-line support may edit orders at an assigned store", async () => {
    expect(await hasPermission(testAccounts.agent, "orders.edit", satinSparrow)).toBe(true);
  });

  it("removing one of two roles removes only that role's permissions", async () => {
    // Remove second-line support, check, then put it back so later tests still see it.
    await db.execute(
      sql`delete from public.store_assignments
        where user_id = ${testAccounts.agent}::uuid and role = 'agent_second_line'`,
    );
    try {
      expect(await hasPermission(testAccounts.agent, "orders.edit", satinSparrow)).toBe(false);
      expect(await hasPermission(testAccounts.agent, "orders.read", satinSparrow)).toBe(true);
    } finally {
      await db.execute(
        sql`insert into public.store_assignments (user_id, store_id, role)
          values (${testAccounts.agent}::uuid, ${satinSparrow}::uuid, 'agent_second_line')
          on conflict do nothing`,
      );
    }
  });

  it("a permission that doesn't exist is never granted", async () => {
    expect(await hasPermission(testAccounts.developer, "orders.delete", satinSparrow)).toBe(false);
  });
});

describe("a role can only be granted at its own scope", () => {
  // Postgres error 23503 is "foreign_key_violation": the role doesn't exist at that scope.
  const foreignKeyViolation = { cause: { code: "23503" } };

  it("a store role can't be given at company level", async () => {
    await expect(
      db.execute(
        sql`insert into public.org_members (user_id, organization_id, role)
          values (${testAccounts.stranger}::uuid, ${northstarThreads}::uuid, 'agent_first_line')`,
      ),
    ).rejects.toMatchObject(foreignKeyViolation);
  });

  it("a company role can't be given at store level", async () => {
    await expect(
      db.execute(
        sql`insert into public.store_assignments (user_id, store_id, role)
          values (${testAccounts.stranger}::uuid, ${satinSparrow}::uuid, 'merchant_admin')`,
      ),
    ).rejects.toMatchObject(foreignKeyViolation);
  });
});

describe("creating orders", () => {
  // Each test uses its own reference, so a failed run can't clash with the next one.
  function newOrder(reference: string) {
    return {
      reference,
      storeId: velourVault,
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

  // The total is worked out by public.create_order(), so a caller can't send one. The table itself
  // refuses a direct insert, even with the right permission, so a wrong total can't get in that way.
  it("a platform developer can't insert an order directly, not even with a wrong total", async () => {
    const reference = `TEST-${randomUUID()}`;
    await expect(
      withUser(db, asUser(testAccounts.developer), (tx) =>
        tx.insert(orders).values({ ...newOrder(reference), totalAmount: 1 }),
      ),
    ).rejects.toMatchObject(permissionDenied);
    const saved = await db.select().from(orders).where(eq(orders.reference, reference));
    expect(saved).toEqual([]);
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
      await db.insert(orders).values(newOrder(reference));
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

  // The orders table is reachable through the Data API too. The grant is gone, so a direct insert
  // fails whatever its values are. Placing an order goes through create_order(), which checks them.
  it.each<[string, Partial<typeof orders.$inferInsert>]>([
    ["a captured order", { status: "captured", capturedAmount: 20000 }],
    ["a captured amount on an authorization", { capturedAmount: 100 }],
    ["an order with a total the lines don't add up to", { totalAmount: 1 }],
    ["an order dated 8 hours ago", { createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000) }],
    ["an order in another user's name", { createdBy: testAccounts.developer }],
  ])("a checkout customer can't insert %s directly", async (_, values) => {
    const reference = `TEST-${randomUUID()}`;
    await expect(
      withUser(db, asUser(testAccounts.customer), (tx) =>
        tx.insert(orders).values({
          ...newOrder(reference),
          storeId: satinSparrow,
          currency: "EUR",
          ...values,
        }),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });

  // Lines, addresses and events can't be added after the fact, even to your own order: the one
  // place they are written is create_order(), in the same transaction as the order.
  it("nobody can add lines, addresses or events to an order directly, not even their own", async () => {
    const own = `TEST-${randomUUID()}`;
    try {
      const [mine] = await db
        .insert(orders)
        .values({
          ...newOrder(own),
          storeId: satinSparrow,
          currency: "EUR",
          createdBy: testAccounts.customer,
        })
        .returning({ id: orders.id });

      const line = (orderId: string) => ({
        orderId,
        position: 1,
        type: "physical" as const,
        name: "Test product",
        quantity: 1,
        unitPrice: 100,
        taxRate: 0,
      });
      const address = (orderId: string) => ({
        orderId,
        kind: "billing" as const,
        firstName: "Test",
        lastName: "Customer",
        streetAddress: "1 Test Street",
        postalCode: "10115",
        city: "Berlin",
        country: "DE",
      });
      const event = (orderId: string) => ({
        orderId,
        action: "authorized" as const,
        actorUserId: testAccounts.customer,
        actorName: "Test customer",
        metadata: { amount: 100 },
      });

      await expect(
        withUser(db, asUser(testAccounts.customer), (tx) =>
          tx.insert(orderLines).values(line(mine!.id)),
        ),
      ).rejects.toMatchObject(permissionDenied);
      await expect(
        withUser(db, asUser(testAccounts.customer), (tx) =>
          tx.insert(orderAddresses).values(address(mine!.id)),
        ),
      ).rejects.toMatchObject(permissionDenied);
      await expect(
        withUser(db, asUser(testAccounts.customer), (tx) =>
          tx.insert(orderEvents).values(event(mine!.id)),
        ),
      ).rejects.toMatchObject(permissionDenied);
    } finally {
      await removeOrder(own);
    }
  });

  it("a merchant can't add lines to their own store's order, even though they can read it", async () => {
    const reference = `TEST-${randomUUID()}`;
    try {
      await db.insert(orders).values(newOrder(reference));
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Runs as the owner inside a transaction that is rolled back, so the test leaves no rows behind.
async function inRollback(run: (tx: Tx) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await run(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
}

describe("access token hook", () => {
  // Makes its own user inside a transaction that is rolled back, so the test leaves no rows
  // behind and needs no seeded accounts (CI runs only the database, not Auth).
  it("copies the user's global roles into the global_roles claim", async () => {
    const userId = randomUUID();
    let roles: string[] | undefined;

    await inRollback(async (tx) => {
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
    });

    expect(roles).toEqual(["platform_developer"]);
  });
});

describe("expiring authorizations", () => {
  const DAY = 24 * 60 * 60 * 1000;

  // expire_orders() also expires any past-due seed orders inside inRollback, and that is rolled back too.

  // A card order created `daysAgo` days ago, so its authorization ran out 7 days after that.
  async function addOrder(tx: Tx, daysAgo: number, status: OrderStatus, capturedAmount = 0) {
    const createdAt = new Date(Date.now() - daysAgo * DAY);
    const [order] = await tx
      .insert(orders)
      .values({
        reference: `TEST-${randomUUID()}`,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 7 * DAY),
        storeId: velourVault,
        currency: "SEK",
        customerFirstName: "Test",
        customerLastName: "Customer",
        customerEmail: "customer@ghostshift.test",
        paymentMethod: "card",
        status,
        totalAmount: 20000,
        capturedAmount,
        shippingCarrier: "PostNord",
      })
      .returning();
    return order!;
  }

  async function expireOrders(tx: Tx) {
    await tx.execute(sql`select public.expire_orders()`);
  }

  function statusOf(tx: Tx, id: string) {
    return tx
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, id))
      .then(([row]) => row?.status);
  }

  it("expires an authorization that has run out, with one timeline event from the system", async () => {
    await inRollback(async (tx) => {
      const order = await addOrder(tx, 10, "authorized");
      await expireOrders(tx);
      // A second run must not add a second event.
      await expireOrders(tx);

      expect(await statusOf(tx, order.id)).toBe("expired");
      const events = await tx.select().from(orderEvents).where(eq(orderEvents.orderId, order.id));
      expect(events).toEqual([
        expect.objectContaining({
          action: "expired",
          actorUserId: null,
          actorName: "System",
          occurredAt: order.expiresAt,
          metadata: { releasedAmount: 20000, reason: "Authorization expired after 7 days" },
        }),
      ]);
    });
  });

  it("leaves open authorizations and part-captured orders alone", async () => {
    await inRollback(async (tx) => {
      const open = await addOrder(tx, 1, "authorized");
      const partCaptured = await addOrder(tx, 10, "part_captured", 5000);
      await expireOrders(tx);

      expect(await statusOf(tx, open.id)).toBe("authorized");
      expect(await statusOf(tx, partCaptured.id)).toBe("part_captured");
    });
  });

  it("can't be run by signed-in users, not even a developer", async () => {
    await expect(
      withUser(db, asUser(testAccounts.developer), (tx) =>
        tx.execute(sql`select public.expire_orders()`),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });

  // Postgres error 23514 is "check_violation", raised by the orders_status_transition_check trigger.
  it.each([
    ["expired", "authorized"],
    ["captured", "expired"],
  ] as const)("refuses %s -> %s, even for the owner", async (from, to) => {
    await expect(
      inRollback(async (tx) => {
        const order = await addOrder(tx, 10, from, from === "captured" ? 20000 : 0);
        await tx.update(orders).set({ status: to }).where(eq(orders.id, order.id));
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("runs every 15 minutes", async () => {
    const [job] = await db.execute<{ schedule: string }>(
      sql`select schedule from cron.job where jobname = 'expire-orders'`,
    );
    expect(job?.schedule).toBe("*/15 * * * *");
  });
});

describe("capture, cancel and refund", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const checkViolation = { cause: { code: "23514" } };

  // A fresh 200.00 SEK authorization at Velour Vault, saved as the owner. Removed after the tests.
  const created: string[] = [];
  async function newOrder(values: Partial<typeof orders.$inferInsert> = {}) {
    const [order] = await db
      .insert(orders)
      .values({
        reference: `TEST-${randomUUID()}`,
        storeId: velourVault,
        currency: "SEK",
        customerFirstName: "Test",
        customerLastName: "Customer",
        customerEmail: "customer@ghostshift.test",
        paymentMethod: "card",
        status: "authorized",
        totalAmount: 20000,
        shippingCarrier: "PostNord",
        ...values,
      })
      .returning();
    created.push(order!.id);
    return order!;
  }
  afterAll(async () => {
    for (const id of created) await db.delete(orders).where(eq(orders.id, id));
  });

  // Calls public.order_action as this user, on `on` (a second connection for the concurrency test).
  function act(
    userId: string,
    orderId: string,
    action: string,
    amount: number | null,
    reason: string | null,
    on = db,
  ) {
    return withUser(on, asUser(userId), (tx) =>
      tx.execute<{ status: OrderStatus }>(
        sql`select status from public.order_action(${orderId}::uuid, ${action}, ${amount}::bigint, ${reason})`,
      ),
    ).then(([row]) => row?.status);
  }

  async function amountsOf(id: string) {
    const [row] = await db
      .select({
        status: orders.status,
        captured: orders.capturedAmount,
        refunded: orders.refundedAmount,
      })
      .from(orders)
      .where(eq(orders.id, id));
    return row;
  }

  function eventsOf(id: string) {
    return db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id))
      .orderBy(orderEvents.occurredAt, orderEvents.id);
  }

  it("captures part, then the rest, then refunds it all, with one event per action", async () => {
    const order = await newOrder();
    const merchant = testAccounts.merchantA;

    expect(await act(merchant, order.id, "capture", 5000, " First parcel shipped ")).toBe(
      "part_captured",
    );
    expect(await act(merchant, order.id, "capture", 15000, "Second parcel shipped")).toBe(
      "captured",
    );
    expect(await act(merchant, order.id, "refund", 2000, "One mug arrived broken")).toBe(
      "captured",
    );
    expect(await act(merchant, order.id, "refund", 18000, "Customer returned the rest")).toBe(
      "refunded",
    );

    expect(await amountsOf(order.id)).toEqual({
      status: "refunded",
      captured: 20000,
      refunded: 20000,
    });
    const events = await eventsOf(order.id);
    expect(events.map((event) => [event.action, event.metadata])).toEqual(
      expect.arrayContaining([
        ["captured", { amount: 5000, reason: "First parcel shipped" }],
        ["captured", { amount: 15000, reason: "Second parcel shipped" }],
        ["refunded", { amount: 2000, reason: "One mug arrived broken" }],
        ["refunded", { amount: 18000, reason: "Customer returned the rest" }],
      ]),
    );
    expect(events).toHaveLength(4);
    // The person who did it, by id and by email.
    expect(events.every((event) => event.actorUserId === merchant)).toBe(true);
    expect(events.every((event) => event.actorName === "merchantA@test.ghostshift.test")).toBe(
      true,
    );
  });

  it("cancels what is left of a part-captured authorization and records what was released", async () => {
    const order = await newOrder();
    await act(testAccounts.merchantA, order.id, "capture", 5000, "Shipped what was in stock");
    expect(
      await act(testAccounts.merchantA, order.id, "cancel", null, "Rest is out of stock"),
    ).toBe("canceled");

    const events = await eventsOf(order.id);
    expect(events).toContainEqual(
      expect.objectContaining({
        action: "canceled",
        metadata: { releasedAmount: 15000, reason: "Rest is out of stock" },
      }),
    );
    // Captured money can still be refunded after a cancel; the status stays canceled.
    expect(await act(testAccounts.merchantA, order.id, "refund", 5000, "Returned")).toBe(
      "canceled",
    );
  });

  it("refuses a second cancel, so the timeline gets one event", async () => {
    const order = await newOrder();
    await act(testAccounts.merchantA, order.id, "cancel", null, "Customer canceled");
    await expect(
      act(testAccounts.merchantA, order.id, "cancel", null, "Clicked twice"),
    ).rejects.toMatchObject(checkViolation);
    expect(await eventsOf(order.id)).toHaveLength(1);
  });

  it.each([
    ["capture more than is uncaptured", "capture", 20001],
    ["refund before anything is captured", "refund", 1],
  ])("refuses to %s", async (_, action, amount) => {
    const order = await newOrder();
    await expect(
      act(testAccounts.merchantA, order.id, action, amount, "Testing limits"),
    ).rejects.toMatchObject(checkViolation);
    expect(await eventsOf(order.id)).toEqual([]);
  });

  it.each([
    ["no reason", null],
    ["a blank reason", "   "],
    ["a reason over 500 characters", "x".repeat(501)],
  ])("refuses an action with %s", async (_, reason) => {
    const order = await newOrder();
    await expect(
      act(testAccounts.merchantA, order.id, "cancel", null, reason),
    ).rejects.toMatchObject({ cause: { code: "22023" } });
  });

  it("refuses to capture once the authorization has run out", async () => {
    const createdAt = new Date(Date.now() - 10 * DAY);
    const order = await newOrder({ createdAt, expiresAt: new Date(createdAt.getTime() + DAY) });
    await expect(
      act(testAccounts.merchantA, order.id, "capture", 100, "Too late"),
    ).rejects.toMatchObject(checkViolation);
  });

  it("refuses to cancel a captured order or capture a canceled one", async () => {
    const order = await newOrder();
    await act(testAccounts.merchantA, order.id, "capture", 20000, "Shipped");
    await expect(
      act(testAccounts.merchantA, order.id, "cancel", null, "Changed my mind"),
    ).rejects.toMatchObject(checkViolation);

    const canceled = await newOrder();
    await act(testAccounts.merchantA, canceled.id, "cancel", null, "Customer canceled");
    await expect(
      act(testAccounts.merchantA, canceled.id, "capture", 100, "Shipped anyway"),
    ).rejects.toMatchObject(checkViolation);
  });

  it("refuses someone who may read the order but not move money", async () => {
    // Merchant B only handles disputes at Pocket Atelier.
    const order = await newOrder({ storeId: satinSparrow, currency: "EUR" });
    await expect(
      act(testAccounts.merchantB, order.id, "capture", 100, "Shipped"),
    ).rejects.toMatchObject(permissionDenied);
  });

  it("an agent with second-line support can't capture, since the agent role lost that right", async () => {
    const order = await newOrder({ storeId: satinSparrow, currency: "EUR" });
    await expect(
      act(testAccounts.agent, order.id, "capture", 100, "Shipped"),
    ).rejects.toMatchObject(permissionDenied);
  });

  it("reports another company's order as not found", async () => {
    const order = await newOrder();
    await expect(
      act(testAccounts.merchantB, order.id, "cancel", null, "Not mine"),
    ).rejects.toMatchObject({ cause: { code: "P0002" } });
    await expect(
      act(testAccounts.stranger, order.id, "cancel", null, "Not mine"),
    ).rejects.toMatchObject({ cause: { code: "P0002" } });
  });

  it("can't be called by anonymous visitors", async () => {
    const order = await newOrder();
    await expect(
      withRole(db, "anon", (tx) =>
        tx.execute(sql`select public.order_action(${order.id}::uuid, 'cancel', null, 'Anon')`),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });

  it("can't be done around the function, by updating the order directly", async () => {
    const order = await newOrder();
    await expect(
      withUser(db, asUser(testAccounts.merchantA), (tx) =>
        tx.update(orders).set({ status: "canceled" }).where(eq(orders.id, order.id)),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });

  it("lets only one of two captures at the same moment through when both don't fit", async () => {
    const order = await newOrder();
    const second = createDb(testDatabaseUrl);
    try {
      const results = await Promise.allSettled([
        act(testAccounts.merchantA, order.id, "capture", 15000, "First"),
        act(testAccounts.merchantA, order.id, "capture", 15000, "Second", second),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect((await amountsOf(order.id))?.captured).toBe(15000);
    } finally {
      await second.close();
    }
  });

  describe("the status trigger, for every writer including the owner", () => {
    it.each([
      ["captured", "canceled", { capturedAmount: 20000 }],
      ["canceled", "authorized", {}],
      ["refunded", "captured", { capturedAmount: 20000, refundedAmount: 20000 }],
    ] as const)("refuses %s -> %s", async (from, to, amounts) => {
      const order = await newOrder({ status: from, ...amounts });
      await expect(
        db.update(orders).set({ status: to }).where(eq(orders.id, order.id)),
      ).rejects.toMatchObject(checkViolation);
    });

    it("refuses to lower a captured amount", async () => {
      const order = await newOrder({ status: "part_captured", capturedAmount: 5000 });
      await expect(
        db.update(orders).set({ capturedAmount: 4000 }).where(eq(orders.id, order.id)),
      ).rejects.toMatchObject(checkViolation);
    });

    it("refuses a status that doesn't match the amounts", async () => {
      const order = await newOrder();
      await expect(
        db
          .update(orders)
          .set({ status: "captured", capturedAmount: 5000 })
          .where(eq(orders.id, order.id)),
      ).rejects.toMatchObject(checkViolation);
    });

    it("refuses captured money on an order that stays authorized", async () => {
      const order = await newOrder();
      await expect(
        db.update(orders).set({ capturedAmount: 5000 }).where(eq(orders.id, order.id)),
      ).rejects.toMatchObject(checkViolation);
    });

    it("refuses to expire an authorization that hasn't run out yet", async () => {
      const order = await newOrder();
      await expect(
        db.update(orders).set({ status: "expired" }).where(eq(orders.id, order.id)),
      ).rejects.toMatchObject(checkViolation);
    });

    it("still allows changes that don't touch status or money", async () => {
      const order = await newOrder();
      await db.update(orders).set({ shippingTracking: "TRACK-1" }).where(eq(orders.id, order.id));
      expect((await amountsOf(order.id))?.status).toBe("authorized");
    });
  });
});
