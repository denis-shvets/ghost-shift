import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import { orders } from "~/features/orders/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb } from "~/shared/db/client";
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

import {
  DisputeAlreadyOpenError,
  DisputeForbiddenError,
  DisputeOrderError,
  openDispute,
} from "./disputes-repository";

// Runs the repository against the local database with seed data, to check its error mapping.
const db = createDb(testDatabaseUrl);
const created: string[] = [];

beforeAll(async () => {
  await createTestAccounts(db);
});
afterAll(async () => {
  for (const id of created) await db.delete(orders).where(eq(orders.id, id));
  await db.close();
});

async function orderWithStatus(status: "authorized" | "captured") {
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
      capturedAmount: status === "authorized" ? 0 : 20000,
      refundedAmount: 0,
      shippingCarrier: "PostNord",
    })
    .returning({ id: orders.id });
  created.push(order!.id);
  return order!.id;
}

function asUser(id: string): UserClaims {
  return { sub: id, global_roles: [] };
}

describe("openDispute", () => {
  it("refuses an order that never took money", async () => {
    const orderId = await orderWithStatus("authorized");
    await expect(
      openDispute(db, asUser(testAccounts.developer), { orderId, reason: "Item never arrived" }),
    ).rejects.toBeInstanceOf(DisputeOrderError);
  });

  it("refuses a user who can't see the order", async () => {
    const orderId = await orderWithStatus("captured");
    await expect(
      openDispute(db, asUser(testAccounts.stranger), { orderId, reason: "Item never arrived" }),
    ).rejects.toBeInstanceOf(DisputeForbiddenError);
  });

  it("refuses a second open dispute on the same order", async () => {
    const orderId = await orderWithStatus("captured");
    await openDispute(db, asUser(testAccounts.developer), {
      orderId,
      reason: "Item never arrived",
    });
    await expect(
      openDispute(db, asUser(testAccounts.developer), { orderId, reason: "Item never arrived" }),
    ).rejects.toBeInstanceOf(DisputeAlreadyOpenError);
  });
});
