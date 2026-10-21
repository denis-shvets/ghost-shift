import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import { orders } from "~/features/orders/db/schema";
import type { CreateOrderInput } from "~/features/orders/model/create-order-input";
import { applyOrderAction, createOrder } from "~/features/orders/server/orders-repository";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb } from "~/shared/db/client";
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

import { getInsights } from "./insights-repository";

// Runs against the local Supabase database with seed data (`pnpm db:reset`).
const db = createDb(testDatabaseUrl);

beforeAll(() => createTestAccounts(db));
afterAll(() => db.close());

const merchant: UserClaims = { sub: testAccounts.merchantA, global_roles: [] };
const stranger: UserClaims = { sub: testAccounts.stranger, global_roles: [] };

describe("getInsights", () => {
  it("counts only Northstar Threads orders, matching a direct count as the database owner", async () => {
    // The owner connection skips row-level security, so this is the true count per currency.
    const expected = await db.execute<{ currency: string; orders: number }>(
      sql`select o.currency, count(*)::int as orders
        from orders o
        join stores s on s.id = o.store_id
        where s.organization_id = ${seedIds.organizations.northstarThreads}::uuid
        group by o.currency
        order by o.currency`,
    );

    const rows = await getInsights(db, merchant);

    expect(rows.map(({ currency, orderCount }) => ({ currency, orders: orderCount }))).toEqual(
      expected,
    );
  });

  it("gives each currency its own row, with its own payment-method split", async () => {
    const rows = await getInsights(db, merchant);

    const currencies = rows.map((row) => row.currency);
    expect(currencies).toEqual([...new Set(currencies)]);
    expect(currencies).toEqual(expect.arrayContaining(["EUR", "SEK"]));
    for (const row of rows) {
      const methodOrders = row.paymentMethods.reduce((sum, method) => sum + method.orderCount, 0);
      expect(methodOrders).toBe(row.orderCount);
    }
  });

  it("returns no rows for a user with no organization access", async () => {
    expect(await getInsights(db, stranger)).toEqual([]);
  });
});

describe("getInsights after order actions", () => {
  const developer: UserClaims = {
    sub: testAccounts.developer,
    global_roles: ["platform_developer"],
  };
  // Orders created by these tests, deleted afterwards so the seed numbers stay as they were.
  const created: string[] = [];

  afterAll(async () => {
    await db.delete(orders).where(inArray(orders.id, created));
  });

  const newOrder: CreateOrderInput = {
    storeId: seedIds.stores.velourVault,
    customer: { firstName: "Test", lastName: "Insights", email: "insights@example.com" },
    billingAddress: {
      firstName: "Test",
      lastName: "Insights",
      streetAddress: "Storgatan 1",
      postalCode: "111 22",
      city: "Stockholm",
      country: "SE",
    },
    shippingAddress: {
      firstName: "Test",
      lastName: "Insights",
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
        quantity: 1,
        unitPrice: 5000,
        taxRate: 2500,
      },
    ],
  };

  async function sek() {
    const rows = await getInsights(db, merchant);
    const row = rows.find((item) => item.currency === "SEK");
    if (!row) throw new Error("No SEK row for Northstar Threads");
    return row;
  }

  it("counts an open order as not settled, and a part-captured then canceled order as captured", async () => {
    const before = await sek();

    const { id: orderId } = await createOrder(db, developer, newOrder);
    created.push(orderId);
    const open = await sek();
    expect(open.orderCount).toBe(before.orderCount + 1);
    expect(open.settledOrderCount).toBe(before.settledOrderCount);

    await applyOrderAction(db, merchant, {
      action: "capture",
      orderId,
      amount: 1000,
      reason: "Shipped",
    });
    await applyOrderAction(db, merchant, {
      action: "cancel",
      orderId,
      reason: "Rest out of stock",
    });
    const after = await sek();

    expect(after.settledOrderCount).toBe(before.settledOrderCount + 1);
    expect(after.capturedOrderCount).toBe(before.capturedOrderCount + 1);
    expect(after.capturedAmount).toBe(before.capturedAmount + 1000);
  });
});
