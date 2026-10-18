import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb } from "~/shared/db/client";

import { getOrder, listOrders } from "./orders-repository";

// Runs against the local Supabase database with seed data (`pnpm db:reset`).
const db = createDb(testDatabaseUrl);

beforeAll(() => createTestAccounts(db));
afterAll(() => db.close());

// Merchant A (orders editor at Moonlight Goods) reads the orders in these tests.
const merchant: UserClaims = { sub: testAccounts.merchantA, global_roles: [] };

describe("listOrders", () => {
  it("returns the orders of the signed-in merchant's company, newest first", async () => {
    const result = await listOrders(db, merchant);

    expect(result.map((order) => order.reference)).toEqual([
      "MG-1001",
      "MG-1002",
      "MG-1003",
      "MG-1004",
    ]);
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
