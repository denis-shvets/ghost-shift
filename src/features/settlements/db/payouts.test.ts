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

import { settlements } from "./schema";
import { approvePayouts } from "../server/settlements-repository";

// Approving a payout, against the local database. Each test gets its own store and pending payout.
const db = createDb(testDatabaseUrl);
const developer = { sub: testAccounts.developer, global_roles: ["platform_developer"] };
const merchant = { sub: testAccounts.merchantAdmin, global_roles: [] };
let storeId: string;
let payoutAccountId: string;
const created: string[] = [];

beforeAll(async () => {
  await createTestAccounts(db);
  storeId = randomUUID();
  await db.insert(stores).values({
    id: storeId,
    organizationId: seedIds.organizations.larkLoom,
    name: `Payout test ${storeId}`,
    market: "SE",
    currency: "SEK",
    status: "test",
  });
  const [account] = await db
    .insert(payoutAccounts)
    .values({
      organizationId: seedIds.organizations.larkLoom,
      label: "Payout test",
      accountHolderName: "Payout test",
      lastFour: "0000",
      currency: "SEK",
    })
    .returning();
  payoutAccountId = account!.id;
});

afterAll(async () => {
  await db.delete(settlements).where(eq(settlements.storeId, storeId));
  await db.delete(payoutAccounts).where(eq(payoutAccounts.id, payoutAccountId));
  await db.delete(stores).where(eq(stores.id, storeId));
  await db.close();
});

// A pending payout for the test store. Each call uses a different period, so rows never clash.
async function pendingPayout() {
  const start = new Date(Date.UTC(2020, 0, 1) + created.length * 31 * 86_400_000);
  const [row] = await db
    .insert(settlements)
    .values({
      storeId,
      payoutAccountId,
      currency: "SEK",
      periodStart: start,
      periodEnd: new Date(start.getTime() + 31 * 86_400_000),
      grossAmount: 0,
      refundedAmount: 0,
      netAmount: 0,
    })
    .returning();
  created.push(row!.id);
  return row!.id;
}

describe("public.approve_payout", () => {
  it("moves a pending payout to paid for a developer", async () => {
    const id = await pendingPayout();
    await withUser(db, developer, (tx) =>
      tx.execute(sql`select public.approve_payout(${id}::uuid)`),
    );
    const [row] = await db.select().from(settlements).where(eq(settlements.id, id));
    expect(row?.status).toBe("paid");
    expect(row?.paidAt).toBeInstanceOf(Date);
  });

  it("refuses a merchant admin, even at their own store", async () => {
    const id = await pendingPayout();
    const error = await withUser(db, merchant, (tx) =>
      tx.execute(sql`select public.approve_payout(${id}::uuid)`),
    ).catch((caught: unknown) => caught);
    expect((error as { cause?: { message?: string } }).cause?.message).toMatch(
      /platform developers/,
    );
    const [row] = await db.select().from(settlements).where(eq(settlements.id, id));
    expect(row?.status).toBe("pending");
  });

  it("refuses a payout that is already paid", async () => {
    const id = await pendingPayout();
    await withUser(db, developer, (tx) =>
      tx.execute(sql`select public.approve_payout(${id}::uuid)`),
    );
    const error = await withUser(db, developer, (tx) =>
      tx.execute(sql`select public.approve_payout(${id}::uuid)`),
    ).catch((caught: unknown) => caught);
    expect((error as { cause?: { message?: string } }).cause?.message).toMatch(/is not pending/);
  });

  it("approves several payouts at once, and undoes all of them if one can't be approved", async () => {
    const first = await pendingPayout();
    const second = await pendingPayout();
    await approvePayouts(db, developer, [first, second]);
    const rows = await db.select().from(settlements).where(eq(settlements.id, first));
    expect(rows[0]?.status).toBe("paid");

    const third = await pendingPayout();
    await expect(approvePayouts(db, developer, [third, first])).rejects.toThrow();
    const [untouched] = await db.select().from(settlements).where(eq(settlements.id, third));
    expect(untouched?.status).toBe("pending");
  });
});
