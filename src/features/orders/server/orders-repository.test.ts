import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb } from "~/shared/db/client";

import { orders } from "../db/schema";

import { getOrder, listOrders, listOrdersOrFirstPage } from "./orders-repository";

// Runs against the local Supabase database with seed data (`pnpm db:reset`).
const db = createDb(testDatabaseUrl);

beforeAll(() => createTestAccounts(db));
afterAll(() => db.close());

// Merchant A (orders editor at Moonlight Goods) reads the orders in these tests.
const merchant: UserClaims = { sub: testAccounts.merchantA, global_roles: [] };

// Order ids in supabase/seed.sql, newest first.
const mg1002 = "a04509c1-b524-494a-8662-8d6ed7bcfc8d";
const mg1003 = "29fb84e7-03da-44f2-9389-dbbe9e12d3f3";

describe("listOrders", () => {
  it("returns the orders of the signed-in merchant's company, newest first", async () => {
    const result = await listOrders(db, merchant, { limit: 50 });

    expect(result.orders.map((order) => order.reference)).toEqual([
      "MG-1001",
      "MG-1002",
      "MG-1003",
      "MG-1004",
    ]);
    expect(result.nextCursor).toBeNull();
    expect(result.prevCursor).toBeNull();
  });

  it("returns one page, with a cursor for the next page", async () => {
    const first = await listOrders(db, merchant, { limit: 2 });

    expect(first.orders.map((order) => order.reference)).toEqual(["MG-1001", "MG-1002"]);
    expect(first.nextCursor).toBe(mg1002);
    expect(first.prevCursor).toBeNull();
  });

  it("continues from the cursor, with a cursor back to the previous page", async () => {
    const second = await listOrders(db, merchant, { limit: 2, cursor: mg1002 });

    expect(second.orders.map((order) => order.reference)).toEqual(["MG-1003", "MG-1004"]);
    expect(second.prevCursor).toBe(mg1003);
    expect(second.nextCursor).toBeNull();
  });

  it("goes back to the previous page from a cursor", async () => {
    const back = await listOrders(db, merchant, { limit: 2, cursor: mg1003, direction: "prev" });

    expect(back.orders.map((order) => order.reference)).toEqual(["MG-1001", "MG-1002"]);
    expect(back.prevCursor).toBeNull();
    expect(back.nextCursor).toBe(mg1002);
  });

  it("goes back one order at a time, when more newer orders exist", async () => {
    const back = await listOrders(db, merchant, { limit: 1, cursor: mg1003, direction: "prev" });

    expect(back.orders.map((order) => order.reference)).toEqual(["MG-1002"]);
    expect(back.prevCursor).toBe(mg1002);
    expect(back.nextCursor).toBe(mg1002);
  });

  it("treats a previous request without a cursor as the first page", async () => {
    const result = await listOrders(db, merchant, { limit: 2, direction: "prev" });

    expect(result.orders.map((order) => order.reference)).toEqual(["MG-1001", "MG-1002"]);
  });

  it("only pages through the orders the signed-in user can read", async () => {
    // Nordic Bikes has one order, NB-2001, so a page size of 2 must not reveal Moonlight Goods.
    const other: UserClaims = { sub: testAccounts.merchantB, global_roles: [] };
    const result = await listOrders(db, other, { limit: 2 });

    expect(result.orders.map((order) => order.reference)).toEqual(["NB-2001"]);
    expect(result.nextCursor).toBeNull();
    expect(result.prevCursor).toBeNull();
  });

  it("shows the first page when the cursor is an order the user can't see", async () => {
    // NB-2001 belongs to Nordic Bikes, so the cursor is invisible to Moonlight Goods.
    const invisible = "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b";
    const result = await listOrdersOrFirstPage(db, merchant, { limit: 2, cursor: invisible });

    expect(result.orders.map((order) => order.reference)).toEqual(["MG-1001", "MG-1002"]);
    expect(result.nextCursor).toBe(mg1002);
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
        shopperName: "Test Shopper",
        shopperEmail: "tie@example.com",
        shopperCountry: "SE",
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

      expect(forward).toHaveLength(6);
      expect(new Set(forward.map((order) => order.reference))).toEqual(
        new Set(["MG-1001", "MG-1002", "MG-1003", "MG-1004", "TIE-1", "TIE-2"]),
      );

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
      status: "part_refunded",
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
