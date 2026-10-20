import { inArray } from "drizzle-orm";
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

import { listActivity, listActivityOrFirstPage, listReadableStores } from "./activity-repository";

// Runs against the local Supabase database with seed data (`pnpm db:reset`).
const db = createDb(testDatabaseUrl);

beforeAll(() => createTestAccounts(db));
afterAll(() => db.close());

// Merchant A (Moonlight Goods) reads the events in these tests.
const merchant: UserClaims = { sub: testAccounts.merchantA, global_roles: [] };
const developer: UserClaims = { sub: testAccounts.developer, global_roles: ["platform_developer"] };

// Orders created by the refund test, deleted afterwards so the merchant's log stays as seeded.
const created: string[] = [];
afterAll(async () => {
  await db.delete(orders).where(inArray(orders.id, created));
});

// A refund for the Swedish store (Moonlight Goods), made as the merchant, so the log has one.
async function refundedOrder() {
  const input: CreateOrderInput = {
    storeId: seedIds.stores.moonlightSweden,
    customer: { firstName: "Test", lastName: "Activity", email: "activity@example.com" },
    billingAddress: {
      firstName: "Test",
      lastName: "Activity",
      streetAddress: "Storgatan 1",
      postalCode: "111 22",
      city: "Stockholm",
      country: "SE",
    },
    shippingAddress: {
      firstName: "Test",
      lastName: "Activity",
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
    ],
  };
  const { id } = await createOrder(db, developer, input);
  created.push(id);
  await applyOrderAction(db, merchant, {
    action: "capture",
    orderId: id,
    amount: 1000,
    reason: "Shipped",
  });
  await applyOrderAction(db, merchant, {
    action: "refund",
    orderId: id,
    amount: 500,
    reason: "Damaged",
  });
  return id;
}

describe("listActivity", () => {
  it("shows only the events of the signed-in merchant's company, newest first", async () => {
    const { events } = await listActivity(db, merchant, { limit: 50 });

    expect(events.length).toBeGreaterThan(0);
    // Nordic Bikes' orders are seeded as NB-, so none of them may appear here.
    expect(events.some((event) => event.reference.startsWith("NB-"))).toBe(false);
    const times = events.map((event) => event.occurredAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("pages forward, then back, without repeating or skipping events", async () => {
    const first = await listActivity(db, merchant, { limit: 3 });
    expect(first.nextCursor).not.toBeNull();
    const second = await listActivity(db, merchant, { limit: 3, cursor: first.nextCursor! });
    expect(second.prevCursor).not.toBeNull();
    expect(second.events.map((event) => event.id)).not.toEqual(
      first.events.map((event) => event.id),
    );
    const back = await listActivity(db, merchant, {
      limit: 3,
      cursor: second.prevCursor!,
      direction: "prev",
    });

    expect(back.events.map((event) => event.id)).toEqual(first.events.map((event) => event.id));

    // Walk every page forward: each event appears exactly once.
    const seen: string[] = [];
    let page = await listActivity(db, merchant, { limit: 3 });
    seen.push(...page.events.map((event) => event.id));
    while (page.nextCursor) {
      page = await listActivity(db, merchant, { limit: 3, cursor: page.nextCursor });
      seen.push(...page.events.map((event) => event.id));
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("filters by action, returning only refunds", async () => {
    const id = await refundedOrder();

    const { events } = await listActivity(db, merchant, { limit: 100, action: "refunded" });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.action === "refunded")).toBe(true);
    expect(events.some((event) => event.orderId === id)).toBe(true);
  });

  it("filters by store", async () => {
    const storeId = seedIds.stores.moonlightSweden;

    const { events } = await listActivity(db, merchant, { limit: 100, storeId });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.storeId === storeId)).toBe(true);
  });

  it("filters refunds by store, as the refunds page does", async () => {
    const id = await refundedOrder();
    const storeId = seedIds.stores.moonlightSweden;

    const { events } = await listActivity(db, merchant, {
      limit: 100,
      action: "refunded",
      storeId,
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.action === "refunded" && event.storeId === storeId)).toBe(
      true,
    );
    expect(events.some((event) => event.orderId === id)).toBe(true);
  });

  it("falls back to the first page when the cursor can't be seen", async () => {
    const first = await listActivity(db, merchant, { limit: 3 });
    // A valid uuid that matches no event, like a link to a deleted order's event.
    const page = await listActivityOrFirstPage(db, merchant, {
      limit: 3,
      cursor: "00000000-0000-4000-8000-000000000000",
    });

    expect(page.events.map((event) => event.id)).toEqual(first.events.map((event) => event.id));
  });

  it("shows no events to a user with no access", async () => {
    const stranger: UserClaims = { sub: testAccounts.stranger, global_roles: [] };

    const { events, nextCursor, prevCursor } = await listActivity(db, stranger, { limit: 50 });

    expect(events).toEqual([]);
    expect(nextCursor).toBeNull();
    expect(prevCursor).toBeNull();
  });
});

describe("listReadableStores", () => {
  it("lists every store for a platform operator, who can read stores but not organizations", async () => {
    const operator: UserClaims = {
      sub: testAccounts.operator,
      global_roles: ["platform_operator"],
    };

    const names = (await listReadableStores(db, operator)).map((store) => store.name);

    expect(names).toEqual([
      "Moonlight Goods Finland",
      "Moonlight Goods Norway",
      "Moonlight Goods Sweden",
      "Nordic Bikes Germany",
    ]);
  });

  it("lists only the stores an agent is assigned to", async () => {
    const agent: UserClaims = { sub: testAccounts.agent, global_roles: [] };

    const names = (await listReadableStores(db, agent)).map((store) => store.name);

    expect(names).toEqual(["Nordic Bikes Germany"]);
  });

  it("lists no stores to a user with no access", async () => {
    const stranger: UserClaims = { sub: testAccounts.stranger, global_roles: [] };

    expect(await listReadableStores(db, stranger)).toEqual([]);
  });
});
