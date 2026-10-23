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

import { orderDisputes } from "../db/schema";
import {
  DisputeAlreadyOpenError,
  DisputeForbiddenError,
  DisputeOrderError,
  listDisputes,
  listDisputesOrFirstPage,
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

describe("listDisputes", () => {
  const all = { limit: 100 };

  it("lists the disputes of the user's stores, newest first", async () => {
    const first = await openDispute(db, asUser(testAccounts.developer), {
      orderId: await orderWithStatus("captured"),
      reason: "Item never arrived",
    });
    const second = await openDispute(db, asUser(testAccounts.developer), {
      orderId: await orderWithStatus("captured"),
      reason: "Item never arrived",
    });
    const { disputes } = await listDisputes(db, asUser(testAccounts.developer), all);
    const ids = disputes.map((dispute) => dispute.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
  });

  it("filters by store", async () => {
    const dispute = await openDispute(db, asUser(testAccounts.developer), {
      orderId: await orderWithStatus("captured"),
      reason: "Item never arrived",
    });
    const inStore = await listDisputes(db, asUser(testAccounts.developer), {
      ...all,
      storeId: seedIds.stores.velourVault,
    });
    const otherStore = await listDisputes(db, asUser(testAccounts.developer), {
      ...all,
      storeId: seedIds.stores.larkLoomStockholm,
    });
    expect(inStore.disputes.map((row) => row.id)).toContain(dispute.id);
    expect(otherStore.disputes.map((row) => row.id)).not.toContain(dispute.id);
  });

  it("hides disputes from a user who can't see the store", async () => {
    const dispute = await openDispute(db, asUser(testAccounts.developer), {
      orderId: await orderWithStatus("captured"),
      reason: "Item never arrived",
    });
    const { disputes } = await listDisputes(db, asUser(testAccounts.stranger), all);
    expect(disputes.map((row) => row.id)).not.toContain(dispute.id);
  });

  it("pages forward and back with the cursors", async () => {
    const open = (orderId: string) =>
      openDispute(db, asUser(testAccounts.developer), { orderId, reason: "Item never arrived" });
    const oldest = await open(await orderWithStatus("captured"));
    const middle = await open(await orderWithStatus("captured"));
    const newest = await open(await orderWithStatus("captured"));

    const first = await listDisputes(db, asUser(testAccounts.developer), { limit: 2 });
    expect(first.disputes.slice(0, 2).map((row) => row.id)).toEqual([newest.id, middle.id]);
    expect(first.prevCursor).toBeNull();

    const older = await listDisputes(db, asUser(testAccounts.developer), {
      limit: 2,
      cursor: middle.id,
      direction: "next",
    });
    expect(older.disputes.map((row) => row.id)).toContain(oldest.id);
    expect(older.disputes.map((row) => row.id)).not.toContain(newest.id);

    const back = await listDisputes(db, asUser(testAccounts.developer), {
      limit: 2,
      cursor: older.prevCursor!,
      direction: "prev",
    });
    expect(back.disputes.map((row) => row.id).slice(0, 2)).toEqual([newest.id, middle.id]);
  });

  it("filters by status", async () => {
    const open = await openDispute(db, asUser(testAccounts.developer), {
      orderId: await orderWithStatus("captured"),
      reason: "Item never arrived",
    });
    const closed = await openDispute(db, asUser(testAccounts.developer), {
      orderId: await orderWithStatus("captured"),
      reason: "Item never arrived",
    });
    // There is no close action yet, so the test closes the row directly.
    await db
      .update(orderDisputes)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(orderDisputes.id, closed.id));

    const openOnly = await listDisputes(db, asUser(testAccounts.developer), {
      ...all,
      status: "open",
    });
    const closedOnly = await listDisputes(db, asUser(testAccounts.developer), {
      ...all,
      status: "closed",
    });
    expect(openOnly.disputes.map((row) => row.id)).toContain(open.id);
    expect(openOnly.disputes.map((row) => row.id)).not.toContain(closed.id);
    expect(closedOnly.disputes.map((row) => row.id)).toContain(closed.id);
    expect(closedOnly.disputes.map((row) => row.id)).not.toContain(open.id);
  });

  it("falls back to the first page when the cursor can't be seen", async () => {
    const { disputes } = await listDisputesOrFirstPage(db, asUser(testAccounts.developer), {
      limit: 100,
      cursor: randomUUID(),
      direction: "next",
    });
    expect(disputes.length).toBeGreaterThan(0);
  });
});
