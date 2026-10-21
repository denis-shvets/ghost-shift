import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb, withRole, withUser } from "~/shared/db/client";
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

import { scheduledCheckouts } from "./schema";

// These tests check the row-level security rules and grants on scheduled_checkouts, against the
// local database.
const db = createDb(testDatabaseUrl);
const persona = "schema-test";

beforeAll(() => createTestAccounts(db));
afterAll(async () => {
  await db.delete(scheduledCheckouts).where(eq(scheduledCheckouts.persona, persona));
  await db.close();
});

// Postgres error 42501 is "insufficient_privilege"; Drizzle puts the Postgres error on `cause`.
const permissionDenied = { cause: { code: "42501" } };

function asUser(id: string, globalRoles: string[] = []): UserClaims {
  return { sub: id, global_roles: globalRoles };
}

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

// Queues one checkout the way the app does: only the planned columns are sent.
function queue(
  userId: string,
  storeId = seedIds.stores.nordicBikesGermany,
  dueAt = inOneHour(),
  payload: object = { storeId },
) {
  return withUser(db, asUser(userId), (tx) =>
    tx.execute<{ id: string; created_by: string; status: string }>(
      sql`insert into public.scheduled_checkouts (store_id, persona, plan_id, due_at, payload)
        values (${storeId}::uuid, ${persona}, ${randomUUID()}::uuid, ${dueAt}::timestamptz, ${JSON.stringify(payload)}::jsonb)
        returning id, created_by, status`,
    ),
  ).then(([row]) => row!);
}

async function visibleIds(user: UserClaims) {
  const rows = await withUser(db, user, (tx) =>
    tx.select({ id: scheduledCheckouts.id }).from(scheduledCheckouts),
  );
  return rows.map((row) => row.id);
}

describe("queuing a checkout", () => {
  it("lets the checkout customer queue in its store, as itself and pending", async () => {
    const row = await queue(testAccounts.customer);
    expect(row).toMatchObject({ created_by: testAccounts.customer, status: "pending" });
  });

  it("refuses a store where the user may not create orders", async () => {
    await expect(
      queue(testAccounts.customer, seedIds.stores.moonlightNorway),
    ).rejects.toMatchObject(permissionDenied);
    await expect(queue(testAccounts.merchantA)).rejects.toMatchObject(permissionDenied);
  });

  it("refuses a time in the past, so an order can't be backdated", async () => {
    await expect(
      queue(testAccounts.customer, undefined, new Date(Date.now() - 60_000).toISOString()),
    ).rejects.toMatchObject(permissionDenied);
  });

  it.each([
    ["another user's id", sql`created_by`, sql`${testAccounts.developer}::uuid`],
    ["a status", sql`status`, sql`'placed'`],
  ])("refuses %s", async (_, column, value) => {
    await expect(
      withUser(db, asUser(testAccounts.customer), (tx) =>
        tx.execute(
          sql`insert into public.scheduled_checkouts (store_id, persona, plan_id, due_at, payload, ${column})
            values (${seedIds.stores.nordicBikesGermany}::uuid, ${persona}, ${randomUUID()}::uuid,
              ${inOneHour()}::timestamptz, ${JSON.stringify({ storeId: seedIds.stores.nordicBikesGermany })}::jsonb, ${value})`,
        ),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });

  // Postgres error 23514 is "check_violation". The Data API reaches this table without the API's Zod check.
  it.each([
    ["an order for another store than the row's", { storeId: seedIds.stores.moonlightSweden }],
    ["an order with no store", {}],
    [
      "an order that says it already shipped",
      { storeId: seedIds.stores.nordicBikesGermany, shipped: true },
    ],
  ])("refuses %s", async (_, payload) => {
    await expect(queue(testAccounts.customer, undefined, undefined, payload)).rejects.toMatchObject(
      { cause: { code: "23514" } },
    );
  });

  it("is refused to anonymous visitors", async () => {
    await expect(
      withRole(db, "anon", (tx) => tx.select().from(scheduledCheckouts)),
    ).rejects.toMatchObject(permissionDenied);
  });
});

describe("reading and changing the queue", () => {
  it("shows the creator its own rows and platform staff all, but merchants none", async () => {
    const { id } = await queue(testAccounts.customer);

    expect(await visibleIds(asUser(testAccounts.customer))).toContain(id);
    expect(await visibleIds(asUser(testAccounts.developer, ["platform_developer"]))).toContain(id);
    expect(await visibleIds(asUser(testAccounts.merchantB))).not.toContain(id);
  });

  it.each([
    [
      "update",
      (id: string) => sql`update public.scheduled_checkouts set status = 'placed' where id = ${id}`,
    ],
    ["delete", (id: string) => sql`delete from public.scheduled_checkouts where id = ${id}`],
  ])("refuses an %s, even by the creator", async (_, query) => {
    const { id } = await queue(testAccounts.customer);
    await expect(
      withUser(db, asUser(testAccounts.customer), (tx) => tx.execute(query(id))),
    ).rejects.toMatchObject(permissionDenied);
  });
});
