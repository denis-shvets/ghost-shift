import { eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import { orderEvents, orders } from "~/features/orders/db/schema";
import { payoutAccounts, stores } from "~/features/stores/db/schema";
import { createDb, withUser } from "~/shared/db/client";
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

import { getSettlementSummary, saveSchedule } from "../server/settlements-repository";

import { settlementItems, settlementSchedules, settlements } from "./schema";

// Runs the sweep against the local database with seed data. It checks invariants, not exact
// amounts, so it still passes when the seed changes.
const db = createDb(testDatabaseUrl);
const day = 24 * 60 * 60 * 1000;
const developer = { sub: testAccounts.developer, global_roles: ["platform_developer"] };
const merchant = { sub: testAccounts.merchantAdmin, global_roles: [] };
let storeId: string;
let payoutAccountId: string;

beforeAll(async () => {
  await createTestAccounts(db);
  // The 15-minute job would close due periods between the steps below, so it is paused while these run.
  await db.execute(sql`select cron.unschedule('close-due-settlement-periods')`);
  // A store of its own, so the seeded settlements on other stores are never touched.
  storeId = randomUUID();
  await db.insert(stores).values({
    id: storeId,
    organizationId: seedIds.organizations.larkLoom,
    name: `Sweep test ${storeId}`,
    market: "SE",
    currency: "SEK",
    status: "test",
  });
  const [account] = await db
    .insert(payoutAccounts)
    .values({
      organizationId: seedIds.organizations.larkLoom,
      label: "Sweep test",
      accountHolderName: "Sweep test",
      lastFour: "0000",
      currency: "SEK",
    })
    .returning();
  payoutAccountId = account!.id;
  await db.update(stores).set({ payoutAccountId }).where(eq(stores.id, storeId));
});

afterAll(async () => {
  await db.delete(settlements).where(eq(settlements.storeId, storeId));
  await db.delete(settlementSchedules).where(eq(settlementSchedules.storeId, storeId));
  await db.delete(orders).where(eq(orders.storeId, storeId));
  await db.update(stores).set({ payoutAccountId: null }).where(eq(stores.id, storeId));
  await db.delete(payoutAccounts).where(eq(payoutAccounts.id, payoutAccountId));
  await db.delete(stores).where(eq(stores.id, storeId));
  await db.execute(
    sql`select cron.schedule('close-due-settlement-periods', '*/15 * * * *', 'select public.close_due_periods()')`,
  );
  await db.close();
});

describe("public.run_settlements", () => {
  it("closes one overdue period per run for the picked schedule, and stops when none are due", async () => {
    const now = new Date();
    // Two full weeks ended before now, so the schedule has two periods to close, one run at a time.
    const [schedule] = await db
      .insert(settlementSchedules)
      .values({
        storeId,
        frequency: "weekly",
        payoutAccountId,
        periodStart: new Date(now.getTime() - 14 * day),
        periodEnd: new Date(now.getTime() - 7 * day),
      })
      .returning();
    const pick = sql`array[${schedule!.id}]::uuid[]`;

    const closed: number[] = [];
    for (let run = 0; run < 3; run++) {
      const [result] = await db.execute<{ n: number }>(
        sql`select public.run_settlements(${pick}) as n`,
      );
      closed.push(Number(result?.n ?? 0));
    }
    // The third run has nothing to close: the next period ends in the future.
    expect(closed).toEqual([1, 1, 0]);
  });

  it("refuses a merchant admin from running the sweep directly", async () => {
    // Drizzle wraps the database error, so the Postgres message is on its cause.
    const error = await withUser(db, merchant, (tx) =>
      tx.execute(sql`select public.run_settlements(array[${randomUUID()}]::uuid[])`),
    ).catch((caught: unknown) => caught);
    expect((error as { cause?: { message?: string } }).cause?.message).toMatch(/permission denied/);
  });

  it("leaves a due schedule alone when it is not picked", async () => {
    const dueEnd = new Date(Date.now() - 7 * day);
    await db
      .update(settlementSchedules)
      .set({ periodStart: new Date(Date.now() - 14 * day), periodEnd: dueEnd })
      .where(eq(settlementSchedules.storeId, storeId));
    const [result] = await db.execute<{ n: number }>(
      sql`select public.run_settlements(array[${randomUUID()}]::uuid[]) as n`,
    );
    expect(Number(result?.n ?? 0)).toBe(0);
    const [schedule] = await db
      .select()
      .from(settlementSchedules)
      .where(eq(settlementSchedules.storeId, storeId));
    expect(schedule?.periodEnd.getTime()).toBe(dueEnd.getTime());
  });

  it("gives the summary's next period end as a Date, for the dashboard to format", async () => {
    const now = Date.now();
    await db
      .insert(settlementSchedules)
      .values({
        storeId,
        frequency: "weekly",
        payoutAccountId,
        periodStart: new Date(now),
        periodEnd: new Date(now + 7 * day),
      })
      .onConflictDoUpdate({
        target: settlementSchedules.storeId,
        set: { periodEnd: new Date(now + 7 * day) },
      });
    const summary = await getSettlementSummary(db, {
      sub: testAccounts.developer,
      global_roles: ["platform_developer"],
    });
    const row = summary.currencies.find((currency) => currency.nextPeriodEnd !== null);
    expect(row?.nextPeriodEnd).toBeInstanceOf(Date);
  });

  it("moves captured money from available to pending when the period closes", async () => {
    // Other tests share SEK, so compare against the totals before this test's money goes in.
    const sek = async () => {
      const summary = await getSettlementSummary(db, developer);
      return summary.currencies.find((currency) => currency.currency === "SEK");
    };
    const before = await sek();
    const [order] = await db
      .insert(orders)
      .values({
        reference: `SWEEP-${randomUUID()}`,
        storeId,
        currency: "SEK",
        customerFirstName: "Sweep",
        customerLastName: "Test",
        customerEmail: "sweep@example.test",
        paymentMethod: "apple_pay",
        status: "captured",
        totalAmount: 1000,
        capturedAmount: 1000,
        refundedAmount: 300,
        shippingCarrier: "Test",
      })
      .returning();
    await db.insert(orderEvents).values([
      {
        orderId: order!.id,
        action: "captured",
        actorName: "Sweep test",
        metadata: { amount: 1000 },
      },
      {
        orderId: order!.id,
        action: "refunded",
        actorName: "Sweep test",
        metadata: { amount: 300 },
      },
    ]);
    expect((await sek())!.available - before!.available).toBe(700);

    // Ending the period now, after the events, so the sweep takes them into a settlement.
    await db
      .update(settlementSchedules)
      .set({ periodEnd: sql`now()` })
      .where(eq(settlementSchedules.storeId, storeId));
    const [schedule] = await db
      .select()
      .from(settlementSchedules)
      .where(eq(settlementSchedules.storeId, storeId));
    await db.execute(sql`select public.run_settlements(array[${schedule!.id}]::uuid[])`);

    const after = await sek();
    expect(after!.pendingNet - before!.pendingNet).toBe(700);
    expect(after!.available - before!.available).toBe(0);
  });

  it("puts each order event into one settlement only", async () => {
    const items = await db
      .select({ orderEventId: settlementItems.orderEventId })
      .from(settlementItems)
      .innerJoin(settlements, eq(settlements.id, settlementItems.settlementId))
      .where(eq(settlements.storeId, storeId));
    const ids = items.map((item) => item.orderEventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("refuses a merchant admin writing the schedule table directly", async () => {
    const error = await withUser(db, merchant, (tx) =>
      tx.execute(
        sql`update public.settlement_schedules set payout_account_id = ${payoutAccountId}::uuid where store_id = ${storeId}::uuid`,
      ),
    ).catch((caught: unknown) => caught);
    expect((error as { cause?: { message?: string } }).cause?.message).toMatch(/permission denied/);
  });

  it("refuses a payout account of another organization when saving a schedule", async () => {
    const [foreign] = await db
      .insert(payoutAccounts)
      .values({
        organizationId: seedIds.organizations.northstarThreads,
        label: "Foreign",
        accountHolderName: "Foreign",
        lastFour: "0000",
        currency: "SEK",
      })
      .returning();
    await expect(
      saveSchedule(db, developer, {
        storeId,
        frequency: "weekly",
        payoutAccountId: foreign!.id,
      }),
    ).rejects.toThrow(/Pick a payout account/);
    await db.delete(payoutAccounts).where(eq(payoutAccounts.id, foreign!.id));
  });

  it("drops a period that nets negative, and its events roll into the next period", async () => {
    // Period 1 ends on a Monday, so period 2 ends exactly one week later and is due.
    const today = new Date();
    const thisMonday = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - ((today.getUTCDay() + 6) % 7),
    );
    const firstEnd = thisMonday - 4 * 7 * day;
    const [order] = await db
      .insert(orders)
      .values({
        reference: randomUUID(),
        storeId,
        currency: "SEK",
        customerFirstName: "Sweep",
        customerLastName: "Test",
        customerEmail: "sweep@example.test",
        paymentMethod: "bank_transfer",
        status: "part_captured",
        totalAmount: 1000,
        capturedAmount: 600,
        refundedAmount: 300,
        shippingCarrier: "",
      })
      .returning();
    // Period 1 nets 100 - 300 = -200. The 500 capture falls in period 2, which then nets 500 + 100 - 300 = 300.
    const [capture, refund, nextCapture] = await db
      .insert(orderEvents)
      .values([
        {
          orderId: order!.id,
          action: "captured",
          occurredAt: new Date(firstEnd - 3 * day),
          actorName: "Sweep test",
          metadata: { amount: 100 },
        },
        {
          orderId: order!.id,
          action: "refunded",
          occurredAt: new Date(firstEnd - 2 * day),
          actorName: "Sweep test",
          metadata: { amount: 300 },
        },
        {
          orderId: order!.id,
          action: "captured",
          occurredAt: new Date(firstEnd + day),
          actorName: "Sweep test",
          metadata: { amount: 500 },
        },
      ])
      .returning();
    await db.delete(settlementSchedules).where(eq(settlementSchedules.storeId, storeId));
    const [schedule] = await db
      .insert(settlementSchedules)
      .values({
        storeId,
        frequency: "weekly",
        payoutAccountId,
        periodStart: new Date(firstEnd - 7 * day),
        periodEnd: new Date(firstEnd),
      })
      .returning();
    const pick = sql`array[${schedule!.id}]::uuid[]`;

    await db.execute(sql`select public.run_settlements(${pick})`);
    const afterFirstRun = await db
      .select()
      .from(settlements)
      .where(eq(settlements.storeId, storeId));
    expect(afterFirstRun).toHaveLength(0);
    const unsettled = await db
      .select()
      .from(settlementItems)
      .where(inArray(settlementItems.orderEventId, [capture!.id, refund!.id]));
    expect(unsettled).toHaveLength(0);

    const [result] = await db.execute<{ n: number }>(
      sql`select public.run_settlements(${pick}) as n`,
    );
    expect(Number(result?.n)).toBe(1);
    const [next] = await db.select().from(settlements).where(eq(settlements.storeId, storeId));
    expect(next?.netAmount).toBe(300);
    const items = await db
      .select({ orderEventId: settlementItems.orderEventId })
      .from(settlementItems)
      .where(eq(settlementItems.settlementId, next!.id));
    expect(items.map((item) => item.orderEventId).sort()).toEqual(
      [capture!.id, refund!.id, nextCapture!.id].sort(),
    );
  });
});
