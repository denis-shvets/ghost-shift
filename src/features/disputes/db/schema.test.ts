import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import { orders } from "~/features/orders/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb, withRole, withUser } from "~/shared/db/client";
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

import { orderDisputes } from "./schema";

// These tests check the row-level security rules for disputes, against the local database with seed data.
const db = createDb(testDatabaseUrl);

// Postgres error 42501 is "insufficient_privilege", which is what "permission denied" means.
const permissionDenied = { cause: { code: "42501" } };

// Orders this file adds, removed after the tests. Their disputes go with them (on delete cascade).
const created: string[] = [];
// A captured order at Velour Vault, which is the kind a dispute may be opened on.
let capturedOrder: string;

beforeAll(async () => {
  await createTestAccounts(db);
  capturedOrder = await orderWithStatus("captured");
});
afterAll(async () => {
  for (const id of created) await db.delete(orders).where(eq(orders.id, id));
  await db.close();
});

async function orderWithStatus(
  status: "authorized" | "part_captured" | "captured" | "refunded",
  storeId: string = seedIds.stores.velourVault,
  currency = "SEK",
) {
  const [order] = await db
    .insert(orders)
    .values({
      reference: `TEST-${randomUUID()}`,
      storeId,
      currency,
      customerFirstName: "Test",
      customerLastName: "Customer",
      customerEmail: "customer@ghostshift.test",
      paymentMethod: "card",
      status,
      totalAmount: 20000,
      capturedAmount: status === "authorized" ? 0 : 20000,
      refundedAmount: status === "refunded" ? 20000 : 0,
      shippingCarrier: "PostNord",
    })
    .returning({ id: orders.id });
  created.push(order!.id);
  return order!.id;
}

// For the amount rule: the status and money are set directly, so canceled and expired orders can hold captured money.
async function orderWithMoney(
  status: "canceled" | "expired",
  capturedAmount: number,
  refundedAmount: number,
) {
  const [order] = await db
    .insert(orders)
    .values({
      reference: `TEST-${randomUUID()}`,
      storeId: seedIds.stores.velourVault,
      currency: "SEK",
      customerFirstName: "Test",
      customerLastName: "Customer",
      customerEmail: "customer@ghostshift.test",
      paymentMethod: "card",
      status,
      totalAmount: 20000,
      capturedAmount,
      refundedAmount,
      shippingCarrier: "PostNord",
    })
    .returning({ id: orders.id });
  created.push(order!.id);
  return order!.id;
}

function asUser(id: string): UserClaims {
  return { sub: id, global_roles: [] };
}

function open(userId: string, orderId: string) {
  return withUser(db, asUser(userId), (tx) =>
    tx
      .insert(orderDisputes)
      .values({ orderId, reason: "Item never arrived" })
      .returning({ id: orderDisputes.id }),
  ).then(([row]) => row);
}

describe("opening disputes", () => {
  it("a platform developer can open a dispute on any captured order", async () => {
    const row = await open(testAccounts.developer, capturedOrder);
    expect(row?.id).toEqual(expect.any(String));
  });

  it("a merchant with disputes.manage can open one at their own store's order", async () => {
    const row = await open(testAccounts.merchantA, await orderWithStatus("captured"));
    expect(row?.id).toEqual(expect.any(String));
  });

  it("a merchant can't open a dispute on another company's order", async () => {
    // A captured order, so only the store check can refuse it. PA-2001 is authorized and would fail on status alone.
    const pocketCaptured = await orderWithStatus("captured", seedIds.stores.satinSparrow, "EUR");
    await expect(open(testAccounts.merchantA, pocketCaptured)).rejects.toMatchObject(
      permissionDenied,
    );
  });

  it("someone with no access can't open a dispute", async () => {
    await expect(open(testAccounts.stranger, capturedOrder)).rejects.toMatchObject(
      permissionDenied,
    );
  });

  it("nobody can change a dispute, not even a developer", async () => {
    await open(testAccounts.developer, await orderWithStatus("captured"));
    await expect(
      withUser(db, asUser(testAccounts.developer), (tx) =>
        tx.execute(sql`update public.order_disputes set reason = 'Changed'`),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });
});

describe("only orders that took money can be disputed", () => {
  it("refuses an authorized order, where no money was taken", async () => {
    const orderId = await orderWithStatus("authorized");
    await expect(open(testAccounts.developer, orderId)).rejects.toMatchObject(permissionDenied);
  });

  it("refuses a fully refunded order, where no captured money is left", async () => {
    const orderId = await orderWithStatus("refunded");
    await expect(open(testAccounts.developer, orderId)).rejects.toMatchObject(permissionDenied);
  });

  it("accepts a captured order", async () => {
    const orderId = await orderWithStatus("captured");
    const row = await open(testAccounts.developer, orderId);
    expect(row?.id).toEqual(expect.any(String));
  });

  it("accepts a part-captured order, which still holds captured money", async () => {
    const orderId = await orderWithStatus("part_captured");
    const row = await open(testAccounts.developer, orderId);
    expect(row?.id).toEqual(expect.any(String));
  });

  it("accepts a canceled order that keeps money captured before the cancel", async () => {
    const orderId = await orderWithMoney("canceled", 5000, 0);
    const row = await open(testAccounts.developer, orderId);
    expect(row?.id).toEqual(expect.any(String));
  });

  it("accepts an expired order that still holds captured money", async () => {
    const orderId = await orderWithMoney("expired", 5000, 0);
    const row = await open(testAccounts.developer, orderId);
    expect(row?.id).toEqual(expect.any(String));
  });

  it("refuses a canceled order whose captured money was all refunded", async () => {
    const orderId = await orderWithMoney("canceled", 5000, 5000);
    await expect(open(testAccounts.developer, orderId)).rejects.toMatchObject(permissionDenied);
  });
});

describe("one open dispute per order", () => {
  // Postgres error 23505 is "unique_violation": the open-dispute index refused a second one.
  const uniqueViolation = { cause: { code: "23505" } };

  it("refuses a second open dispute on the same order", async () => {
    const orderId = await orderWithStatus("captured");
    await open(testAccounts.developer, orderId);
    await expect(open(testAccounts.developer, orderId)).rejects.toMatchObject(uniqueViolation);
  });
});

describe("reading disputes", () => {
  it("a merchant with disputes.manage can read a dispute on their store's order", async () => {
    const orderId = await orderWithStatus("captured");
    await open(testAccounts.developer, orderId);
    const rows = await withUser(db, asUser(testAccounts.merchantA), (tx) =>
      tx.select().from(orderDisputes).where(eq(orderDisputes.orderId, orderId)),
    );
    expect(rows).toHaveLength(1);
  });

  it("anonymous visitors can't read them", async () => {
    await expect(
      withRole(db, "anon", (tx) => tx.select().from(orderDisputes)),
    ).rejects.toMatchObject(permissionDenied);
  });

  it("someone with no access sees none", async () => {
    await open(testAccounts.developer, await orderWithStatus("captured"));
    const rows = await withUser(db, asUser(testAccounts.stranger), (tx) =>
      tx.select().from(orderDisputes),
    );
    expect(rows).toEqual([]);
  });
});
