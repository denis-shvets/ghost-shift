import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import { orderEvents, orders } from "~/features/orders/db/schema";
import type { PlaceOrderInput } from "~/features/orders/model/create-order-input";
import {
  OrderCreateForbiddenError,
  StoreNotFoundError,
} from "~/features/orders/server/orders-repository";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb } from "~/shared/db/client";
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

import { scheduledCheckouts } from "../db/schema";

import {
  RELEASE_BATCH,
  planningContext,
  queueCheckouts,
  releaseDueCheckouts,
} from "./scheduled-checkouts-repository";

// Runs against the local Supabase database with seed data (`pnpm db:reset`).
const db = createDb(testDatabaseUrl);
const persona = "repository-test";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const customer: UserClaims = { sub: testAccounts.customer, global_roles: [] };

const order: PlaceOrderInput = {
  storeId: seedIds.stores.nordicBikesGermany,
  customer: { firstName: "Jonas", lastName: "Weber", email: "jonas.weber@example.com" },
  billingAddress: {
    firstName: "Jonas",
    lastName: "Weber",
    streetAddress: "Isestraße 63",
    postalCode: "20149",
    city: "Hamburg",
    country: "DE",
  },
  shippingAddress: {
    firstName: "Jonas",
    lastName: "Weber",
    streetAddress: "Isestraße 63",
    postalCode: "20149",
    city: "Hamburg",
    country: "DE",
  },
  paymentMethod: "amex",
  shippingCarrier: "UPS",
  lines: [
    {
      type: "physical",
      sku: "TEST-1",
      name: "Test bike",
      quantity: 1,
      unitPrice: 99000,
      taxRate: 1900,
    },
  ],
};

beforeAll(() => createTestAccounts(db));
// Rows first: they point at the orders.
async function cleanUp() {
  const rows = await db
    .delete(scheduledCheckouts)
    .where(eq(scheduledCheckouts.persona, persona))
    .returning({ orderId: scheduledCheckouts.orderId });
  const orderIds = rows.flatMap((row) => (row.orderId ? [row.orderId] : []));
  if (orderIds.length > 0) await db.delete(orders).where(inArray(orders.id, orderIds));
}
afterEach(cleanUp);
afterAll(() => db.close());

// Adds a row as the table owner, the way only tests can: the insert policy refuses past times.
async function addDue(dueAt: Date, payload: PlaceOrderInput = order) {
  const [row] = await db
    .insert(scheduledCheckouts)
    .values({
      createdBy: testAccounts.customer,
      storeId: payload.storeId,
      persona,
      planId: randomUUID(),
      dueAt,
      payload,
    })
    .returning({ id: scheduledCheckouts.id });
  return row!.id;
}

function rowOf(id: string) {
  return db
    .select()
    .from(scheduledCheckouts)
    .where(eq(scheduledCheckouts.id, id))
    .then(([row]) => row!);
}

describe("queueCheckouts", () => {
  it("queues every checkout as the signed-in user, pending", async () => {
    const planId = randomUUID();
    // Later than the other test files' rows, so it is the latest pending one.
    const dueAt = new Date(Date.now() + 3 * HOUR).toISOString();
    const result = await queueCheckouts(db, customer, {
      planId,
      checkouts: [
        { dueAt, persona, order },
        { dueAt, persona, order },
      ],
    });

    expect(result).toEqual({ planId, queued: 2 });
    const rows = await db
      .select()
      .from(scheduledCheckouts)
      .where(eq(scheduledCheckouts.planId, planId));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      createdBy: testAccounts.customer,
      storeId: order.storeId,
      status: "pending",
      payload: order,
    });
    expect(await planningContext(db, customer)).toMatchObject({ lastDueAt: new Date(dueAt) });
  });

  it("refuses a store the user can't see or can't order in, and queues nothing", async () => {
    const planId = randomUUID();
    const dueAt = new Date(Date.now() + HOUR).toISOString();
    const norway = { ...order, storeId: seedIds.stores.moonlightNorway };
    // Merchant A reads its Swedish store but may not create orders there.
    const merchant: UserClaims = { sub: testAccounts.merchantA, global_roles: [] };
    const sweden = { ...order, storeId: seedIds.stores.moonlightSweden };

    await expect(
      queueCheckouts(db, customer, {
        planId,
        checkouts: [
          { dueAt, persona, order },
          { dueAt, persona, order: norway },
        ],
      }),
    ).rejects.toBeInstanceOf(StoreNotFoundError);
    await expect(
      queueCheckouts(db, merchant, { planId, checkouts: [{ dueAt, persona, order: sweden }] }),
    ).rejects.toBeInstanceOf(OrderCreateForbiddenError);
    expect(
      await db.select().from(scheduledCheckouts).where(eq(scheduledCheckouts.planId, planId)),
    ).toEqual([]);
  });
});

describe("planningContext", () => {
  it("lists the stores the user may queue in", async () => {
    // The test customer is checkout_customer at Nordic Bikes Germany only.
    expect((await planningContext(db, customer)).storeIds).toEqual([
      seedIds.stores.nordicBikesGermany,
    ]);
    const merchant: UserClaims = { sub: testAccounts.merchantA, global_roles: [] };
    expect((await planningContext(db, merchant)).storeIds).toEqual([]);
  });
});

describe("releaseDueCheckouts", () => {
  it("places a due checkout as its creator, dated at the planned time", async () => {
    const dueAt = new Date(Date.now() - 20 * MINUTE);
    const id = await addDue(dueAt);

    expect(await releaseDueCheckouts(db)).toMatchObject({ placed: 1 });

    const row = await rowOf(id);
    expect(row).toMatchObject({ status: "placed", error: null, releasedAt: expect.any(Date) });
    const [placed] = await db.select().from(orders).where(eq(orders.id, row.orderId!));
    expect(placed).toMatchObject({ createdAt: dueAt, createdBy: testAccounts.customer });
    const [event] = await db.select().from(orderEvents).where(eq(orderEvents.orderId, placed!.id));
    expect(event?.occurredAt).toEqual(dueAt);
  });

  it("leaves a checkout that isn't due yet", async () => {
    const id = await addDue(new Date(Date.now() + HOUR));
    await releaseDueCheckouts(db);
    expect(await rowOf(id)).toMatchObject({ status: "pending", orderId: null });
  });

  it("skips a checkout more than 6 hours late, without an order", async () => {
    const id = await addDue(new Date(Date.now() - 7 * HOUR));
    expect(await releaseDueCheckouts(db)).toMatchObject({ skipped: 1 });
    expect(await rowOf(id)).toMatchObject({
      status: "skipped",
      orderId: null,
      error: "More than 6 hours late",
    });
  });

  it("marks a refused order failed and still places the next one", async () => {
    // The customer has no checkout_customer role in the Norway test store.
    const refused = await addDue(new Date(Date.now() - 2 * MINUTE), {
      ...order,
      storeId: seedIds.stores.moonlightNorway,
    });
    const fine = await addDue(new Date(Date.now() - MINUTE));

    expect(await releaseDueCheckouts(db)).toMatchObject({ placed: 1, failed: 1 });
    expect(await rowOf(refused)).toMatchObject({ status: "failed", error: "Store not found" });
    expect(await rowOf(fine)).toMatchObject({ status: "placed" });
  });

  it("places each checkout once when two runs overlap", async () => {
    const ids = await Promise.all(
      [1, 2, 3, 4].map((n) => addDue(new Date(Date.now() - n * MINUTE))),
    );
    const other = createDb(testDatabaseUrl);
    try {
      const [first, second] = await Promise.all([
        releaseDueCheckouts(db),
        releaseDueCheckouts(other),
      ]);
      expect(first.placed + second.placed).toBe(4);
    } finally {
      await other.close();
    }
    const rows = await db
      .select({ orderId: scheduledCheckouts.orderId })
      .from(scheduledCheckouts)
      .where(inArray(scheduledCheckouts.id, ids));
    expect(new Set(rows.map((row) => row.orderId)).size).toBe(4);
  });

  it(`places at most ${RELEASE_BATCH} per run, oldest first`, async () => {
    const ids = [];
    for (let n = RELEASE_BATCH + 2; n > 0; n--)
      ids.push(await addDue(new Date(Date.now() - n * MINUTE)));

    expect(await releaseDueCheckouts(db)).toMatchObject({ placed: RELEASE_BATCH });
    // The two newest wait for the next run.
    expect((await rowOf(ids.at(-1)!)).status).toBe("pending");
    expect((await rowOf(ids[0]!)).status).toBe("placed");
  });
});
