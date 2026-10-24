import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
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
});
