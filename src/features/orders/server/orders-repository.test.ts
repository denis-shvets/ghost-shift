import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb } from "~/shared/db/client";
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

import { orderLines, orders } from "../db/schema";
import type { CreateOrderInput } from "../model/create-order-input";

import {
  OrderActionError,
  StoreNotFoundError,
  applyOrderAction,
  createOrder,
  getOrder,
  listOrders,
  listOrdersOrFirstPage,
  listStoresForOrder,
} from "./orders-repository";

// Runs against the local Supabase database with seed data (`pnpm db:reset`).
const db = createDb(testDatabaseUrl);

beforeAll(() => createTestAccounts(db));
afterAll(() => db.close());

// Merchant A (orders editor at Moonlight Goods) reads the orders in these tests.
const merchant: UserClaims = { sub: testAccounts.merchantA, global_roles: [] };

// The id of an order in the seed, looked up by reference so the tests don't hard-code random ids.
async function idOf(reference: string) {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.reference, reference));
  return row?.id;
}

// Moonlight Goods' fixed orders, newest first. Generated orders are all older than MG-1004.
const newestMoonlightOrders = [
  "MG-1010",
  "MG-1001",
  "MG-1002",
  "MG-1003",
  "MG-1005",
  "MG-1008",
  "MG-1009",
  "MG-1006",
  "MG-1007",
  "MG-1004",
];

describe("listOrders", () => {
  it("returns the orders of the signed-in merchant's company, newest first", async () => {
    const result = await listOrders(db, merchant, { limit: 50 });

    expect(
      result.orders.slice(0, newestMoonlightOrders.length).map((order) => order.reference),
    ).toEqual(newestMoonlightOrders);
    expect(result.orders.every((order) => order.reference.startsWith("MG-"))).toBe(true);
    expect(result.nextCursor).not.toBeNull();
    expect(result.prevCursor).toBeNull();
  });

  it("returns one page, with a cursor for the next page", async () => {
    const first = await listOrders(db, merchant, { limit: 2 });

    expect(first.orders.map((order) => order.reference)).toEqual(["MG-1010", "MG-1001"]);
    expect(first.nextCursor).toBe(await idOf("MG-1001"));
    expect(first.prevCursor).toBeNull();
  });

  it("continues from the cursor, with a cursor back to the previous page", async () => {
    const second = await listOrders(db, merchant, {
      limit: 2,
      cursor: await idOf("MG-1001"),
    });

    expect(second.orders.map((order) => order.reference)).toEqual(["MG-1002", "MG-1003"]);
    expect(second.prevCursor).toBe(await idOf("MG-1002"));
    expect(second.nextCursor).toBe(await idOf("MG-1003"));
  });

  it("goes back to the previous page from a cursor", async () => {
    const back = await listOrders(db, merchant, {
      limit: 2,
      cursor: await idOf("MG-1003"),
      direction: "prev",
    });

    expect(back.orders.map((order) => order.reference)).toEqual(["MG-1001", "MG-1002"]);
    expect(back.nextCursor).toBe(await idOf("MG-1002"));
  });

  it("goes back one order at a time, when more newer orders exist", async () => {
    const back = await listOrders(db, merchant, {
      limit: 1,
      cursor: await idOf("MG-1003"),
      direction: "prev",
    });

    expect(back.orders.map((order) => order.reference)).toEqual(["MG-1002"]);
    expect(back.prevCursor).toBe(await idOf("MG-1002"));
    expect(back.nextCursor).toBe(await idOf("MG-1002"));
  });

  it("treats a previous request without a cursor as the first page", async () => {
    const result = await listOrders(db, merchant, { limit: 2, direction: "prev" });

    expect(result.orders.map((order) => order.reference)).toEqual(["MG-1010", "MG-1001"]);
  });

  it("only pages through the orders the signed-in user can read", async () => {
    // Every order on this page must belong to Nordic Bikes, so a page size of 2 reveals no Moonlight Goods.
    const other: UserClaims = { sub: testAccounts.merchantB, global_roles: [] };
    const result = await listOrders(db, other, { limit: 2 });

    expect(result.orders).toHaveLength(2);
    expect(result.orders.every((order) => order.reference.startsWith("NB-"))).toBe(true);
    expect(result.prevCursor).toBeNull();
  });

  it("shows the first page when the cursor is an order the user can't see", async () => {
    // NB-2001 belongs to Nordic Bikes, so the cursor is invisible to Moonlight Goods.
    const invisible = await idOf("NB-2001");
    const result = await listOrdersOrFirstPage(db, merchant, {
      limit: 2,
      cursor: invisible,
    });

    expect(result.orders.map((order) => order.reference)).toEqual(["MG-1010", "MG-1001"]);
    expect(result.nextCursor).toBe(await idOf("MG-1001"));
  });

  it("doesn't skip or repeat orders that share a creation time", async () => {
    // Two extra orders with the same created_at, in the Moonlight Goods Sweden store.
    const shared = "2026-09-01T00:00:00Z";
    const tied = [
      { id: "aaaaaaaa-0000-4000-8000-000000000001", reference: "TIE-1" },
      { id: "aaaaaaaa-0000-4000-8000-000000000002", reference: "TIE-2" },
    ];
    await db.insert(orders).values(
      tied.map((order): typeof orders.$inferInsert => ({
        ...order,
        createdAt: new Date(shared),
        storeId: "e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6",
        currency: "SEK",
        customerFirstName: "Test",
        customerLastName: "Customer",
        customerEmail: "tie@example.com",
        paymentMethod: "card",
        status: "authorized",
        totalAmount: 1000,
        shippingCarrier: "PostNord",
      })),
    );

    try {
      // Walk forward one order at a time, then back again from the oldest order.
      const forward: { id: string; reference: string }[] = [];
      let cursor: string | undefined;
      do {
        const page = await listOrders(db, merchant, { limit: 1, cursor });
        forward.push(...page.orders.map(({ id, reference }) => ({ id, reference })));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);

      // Every Moonlight Goods order, the generated ones included, plus the two ties.
      const visible = await db.select({ reference: orders.reference }).from(orders);
      const expected = visible
        .map((order) => order.reference)
        .filter((reference) => reference.startsWith("MG-") || reference.startsWith("TIE-"));
      expect(forward).toHaveLength(expected.length);
      expect(new Set(forward.map((order) => order.reference))).toEqual(new Set(expected));

      const backward: string[] = [];
      let back: string | undefined = forward.at(-1)?.id;
      do {
        const page = await listOrders(db, merchant, { limit: 1, cursor: back, direction: "prev" });
        backward.push(...page.orders.map((order) => order.reference));
        back = page.prevCursor ?? undefined;
      } while (back);

      // Going back gives every order newer than the oldest, in the same order as the walk forward.
      expect(backward).toEqual(
        forward
          .slice(0, -1)
          .map((order) => order.reference)
          .reverse(),
      );
    } finally {
      await db.delete(orders).where(inArray(orders.reference, ["TIE-1", "TIE-2"]));
    }
  });
});

describe("getOrder", () => {
  // MG-1003 in supabase/seed.sql.
  const orderId = "29fb84e7-03da-44f2-9389-dbbe9e12d3f3";

  it("returns the order with its store and lines in order", async () => {
    const order = await getOrder(db, merchant, orderId);

    expect(order).toMatchObject({
      reference: "MG-1003",
      status: "captured",
      refundedAmount: 4000,
      storeName: "Moonlight Goods Finland",
    });
    expect(order?.lines.map((line) => line.name)).toEqual(["Wool blanket", "Night lamp"]);
  });

  it("returns line totals and tax computed by the database", async () => {
    const order = await getOrder(db, merchant, orderId);

    // EUR 80.00 including 25.5 % VAT holds EUR 16.25 of tax.
    expect(order?.lines[0]).toMatchObject({
      type: "physical",
      sku: "BLK-WOL-02",
      unitPrice: 8000,
      taxRate: 2550,
      totalAmount: 8000,
      totalTaxAmount: 1625,
    });
  });

  it("returns lines that aren't products without a SKU", async () => {
    // MG-1002 in supabase/seed.sql: two candle sets and a shipping fee.
    const order = await getOrder(db, merchant, "a04509c1-b524-494a-8662-8d6ed7bcfc8d");

    expect(order?.lines.map((line) => [line.type, line.sku, line.totalAmount])).toEqual([
      ["physical", "CND-SET-03", 49800],
      ["shipping_fee", null, 4900],
    ]);
  });

  it("hides an order of another merchant's company as if it didn't exist", async () => {
    // NB-2001 belongs to Nordic Bikes, not Moonlight Goods.
    expect(await getOrder(db, merchant, "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b")).toBeNull();
  });

  it("returns null for an unknown order", async () => {
    expect(await getOrder(db, merchant, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("returns null for an id that isn't a uuid, without querying", async () => {
    expect(await getOrder(db, merchant, "ord_1003")).toBeNull();
  });
});

// Moonlight Goods Sweden, a SEK store in supabase/seed.sql.
const swedenStore = "e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6";

const newOrder: CreateOrderInput = {
  storeId: swedenStore,
  customer: { firstName: "Test", lastName: "Developer", email: "dev@example.com" },
  billingAddress: {
    firstName: "Test",
    lastName: "Developer",
    streetAddress: "Storgatan 1",
    postalCode: "111 22",
    city: "Stockholm",
    country: "SE",
  },
  shippingAddress: {
    firstName: "Test",
    lastName: "Developer",
    streetAddress: "Storgatan 1",
    postalCode: "111 22",
    city: "Stockholm",
    country: "SE",
  },
  paymentMethod: "card",
  shippingCarrier: "PostNord",
  lines: [
    {
      type: "physical",
      sku: "TEST-1",
      name: "Test mug",
      quantity: 2,
      unitPrice: 1000,
      taxRate: 2500,
    },
    { type: "shipping_fee", name: "Shipping", quantity: 1, unitPrice: 4900, taxRate: 0 },
    { type: "discount", name: "Welcome", quantity: 1, unitPrice: -500, taxRate: 0 },
  ],
};

describe("createOrder", () => {
  const developer: UserClaims = {
    sub: testAccounts.developer,
    global_roles: ["platform_developer"],
  };
  // Orders created by these tests, deleted afterwards so the merchant lists stay as seeded.
  const created: string[] = [];

  afterAll(async () => {
    await db.delete(orders).where(inArray(orders.id, created));
  });

  it("creates the order and its lines, with the store's currency and the correct total", async () => {
    const { id, reference } = await createOrder(db, developer, newOrder);
    created.push(id);

    expect(reference).toMatch(/^DEV-[0-9A-F]{8}$/);

    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    expect(order).toMatchObject({
      reference,
      storeId: swedenStore,
      currency: "SEK",
      status: "authorized",
      totalAmount: 6400,
      capturedAmount: 0,
      refundedAmount: 0,
      shippingCarrier: "PostNord",
    });

    const lines = await db
      .select({
        position: orderLines.position,
        name: orderLines.name,
        totalAmount: orderLines.totalAmount,
      })
      .from(orderLines)
      .where(eq(orderLines.orderId, id))
      .orderBy(orderLines.position);
    expect(lines).toEqual([
      { position: 1, name: "Test mug", totalAmount: 2000 },
      { position: 2, name: "Shipping", totalAmount: 4900 },
      { position: 3, name: "Welcome", totalAmount: -500 },
    ]);

    const saved = await getOrder(db, developer, id);
    expect(saved?.addresses.map((address) => address.kind)).toEqual(["billing", "shipping"]);
    expect(saved?.events).toMatchObject([
      {
        occurredAt: order!.createdAt,
        action: "authorized",
        actorName: "Phantom Checkout",
        metadata: { amount: 6400 },
      },
    ]);
    // A card authorization runs out after 7 days.
    expect(order!.expiresAt.getTime() - order!.createdAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("denies users who can't create orders, and writes nothing", async () => {
    const countDevOrders = async () =>
      (await db.select({ id: orders.id }).from(orders).where(like(orders.reference, "DEV-%")))
        .length;
    const before = await countDevOrders();

    const denied: UserClaims[] = [
      { sub: testAccounts.merchantA, global_roles: [] },
      { sub: testAccounts.agent, global_roles: [] },
      { sub: testAccounts.operator, global_roles: ["platform_operator"] },
      { sub: testAccounts.stranger, global_roles: [] },
    ];
    for (const user of denied) {
      await expect(createOrder(db, user, newOrder)).rejects.toThrow();
    }

    expect(await countDevOrders()).toBe(before);
  });

  it("hides a store the user can't read as if it didn't exist", async () => {
    const otherStore = { ...newOrder, storeId: "d2a94f1c-7e3b-4c8d-9a60-b1e2f3a4c5d6" };
    const merchant: UserClaims = { sub: testAccounts.merchantA, global_roles: [] };
    await expect(createOrder(db, merchant, otherStore)).rejects.toThrow(StoreNotFoundError);
  });
});

describe("listStoresForOrder", () => {
  it("lists all four seed stores for a platform developer, by name", async () => {
    const developer: UserClaims = {
      sub: testAccounts.developer,
      global_roles: ["platform_developer"],
    };
    const stores = await listStoresForOrder(db, developer);

    expect(stores.map((store) => store.name)).toEqual([
      "Moonlight Goods Finland",
      "Moonlight Goods Norway",
      "Moonlight Goods Sweden",
      "Nordic Bikes Germany",
    ]);
    expect(stores[0]).toMatchObject({ currency: "EUR", organizationName: "Moonlight Goods" });
  });

  it("shows no stores to a user with no access", async () => {
    const stranger: UserClaims = { sub: testAccounts.stranger, global_roles: [] };
    expect(await listStoresForOrder(db, stranger)).toEqual([]);
  });
});

describe("applyOrderAction", () => {
  const developer: UserClaims = {
    sub: testAccounts.developer,
    global_roles: ["platform_developer"],
  };
  // Orders created by these tests, deleted afterwards so the merchant lists stay as seeded.
  const created: string[] = [];

  afterAll(async () => {
    await db.delete(orders).where(inArray(orders.id, created));
  });

  async function freshOrder() {
    const { id } = await createOrder(db, developer, newOrder);
    created.push(id);
    return id;
  }

  it("captures and returns the new status and amounts as numbers", async () => {
    const orderId = await freshOrder();
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));

    const result = await applyOrderAction(db, merchant, {
      action: "capture",
      orderId,
      amount: 1000,
      reason: "Shipped",
    });

    expect(result).toEqual({
      id: orderId,
      status: "part_captured",
      capturedAmount: 1000,
      refundedAmount: 0,
      uncapturedAmount: order!.totalAmount - 1000,
    });
  });

  it.each<[string, UserClaims, { amount?: number }, number]>([
    ["more than is left", merchant, { amount: 999_999_999 }, 409],
    ["a merchant of another company", { sub: testAccounts.merchantB, global_roles: [] }, {}, 404],
    ["a user who can't see the order", { sub: testAccounts.stranger, global_roles: [] }, {}, 404],
  ])("turns a refusal for %s into an OrderActionError", async (_, user, extra, status) => {
    const orderId = await freshOrder();
    const error = await applyOrderAction(db, user, {
      action: "capture",
      orderId,
      amount: 1,
      reason: "Shipped",
      ...extra,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OrderActionError);
    expect(error).toMatchObject({ status });
  });

  it("answers 403 to someone who may read the order but not cancel it", async () => {
    // Merchant B handles disputes at Nordic Bikes: they read its orders but may not move money.
    const { id: orderId } = await createOrder(db, developer, {
      ...newOrder,
      storeId: seedIds.stores.nordicBikesGermany,
    });
    created.push(orderId);
    const merchantB: UserClaims = { sub: testAccounts.merchantB, global_roles: [] };

    await expect(
      applyOrderAction(db, merchantB, { action: "cancel", orderId, reason: "Out of stock" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
