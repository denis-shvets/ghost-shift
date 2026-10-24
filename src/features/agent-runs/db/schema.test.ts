import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import { orderEvents, orders } from "~/features/orders/db/schema";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb, withRole, withUser } from "~/shared/db/client";

import { agentRuns } from "./schema";

// These tests check the row-level security rules and grants on agent_runs, against the local database.
const db = createDb(testDatabaseUrl);
const purpose = "Schema test run";

beforeAll(() => createTestAccounts(db));
afterAll(async () => {
  await db.delete(agentRuns).where(eq(agentRuns.purpose, purpose));
  await db.close();
});

// Postgres error 42501 is "insufficient_privilege"; Drizzle puts the Postgres error on `cause`.
const permissionDenied = { cause: { code: "42501" } };

function asUser(id: string): UserClaims {
  return { sub: id, global_roles: [] };
}

// Starts a run the way the app does: only the purpose is sent.
async function startRun(userId: string) {
  const [row] = await withUser(db, asUser(userId), (tx) =>
    tx.execute<{ id: string; agent_user_id: string }>(
      sql`insert into public.agent_runs (purpose) values (${purpose}) returning id, agent_user_id`,
    ),
  );
  return row!;
}

async function visibleRunIds(userId: string) {
  const rows = await withUser(db, asUser(userId), (tx) =>
    tx.select({ id: agentRuns.id }).from(agentRuns),
  );
  return rows.map((row) => row.id);
}

describe("starting a run", () => {
  it("fills in the signed-in user as the agent", async () => {
    const run = await startRun(testAccounts.agent);
    expect(run.agent_user_id).toBe(testAccounts.agent);
  });

  it.each([
    [
      "another user's id",
      sql`insert into public.agent_runs (purpose, agent_user_id) values (${purpose}, ${testAccounts.developer}::uuid)`,
    ],
    [
      "a start time",
      sql`insert into public.agent_runs (purpose, started_at) values (${purpose}, now() - interval '1 day')`,
    ],
  ])("refuses %s", async (_, query) => {
    await expect(
      withUser(db, asUser(testAccounts.agent), (tx) => tx.execute(query)),
    ).rejects.toMatchObject(permissionDenied);
  });

  it("is refused to anonymous visitors", async () => {
    await expect(
      withRole(db, "anon", (tx) =>
        tx.execute(sql`insert into public.agent_runs (purpose) values (${purpose})`),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });
});

describe("ending a run", () => {
  it("lets the agent end its own open run once", async () => {
    const { id } = await startRun(testAccounts.agent);
    const end = () =>
      withUser(db, asUser(testAccounts.agent), (tx) =>
        tx
          .update(agentRuns)
          .set({ endedAt: sql`now()`, summary: "Done" })
          .where(eq(agentRuns.id, id))
          .returning({ id: agentRuns.id }),
      );

    expect(await end()).toEqual([{ id }]);
    // An ended run no longer matches the update policy, so nothing changes.
    expect(await end()).toEqual([]);
  });

  it("doesn't let anyone else end it, not even platform staff", async () => {
    const { id } = await startRun(testAccounts.agent);

    const updated = await withUser(db, asUser(testAccounts.developer), (tx) =>
      tx
        .update(agentRuns)
        .set({ endedAt: sql`now()` })
        .where(eq(agentRuns.id, id))
        .returning(),
    );

    expect(updated).toEqual([]);
  });

  it.each([
    ["in the past", sql`started_at`],
    ["in the future", sql`now() + interval '1 day'`],
  ])("ends at the database's own time, not one sent %s", async (_, endedAt) => {
    const { id } = await startRun(testAccounts.agent);

    const [row] = await withUser(db, asUser(testAccounts.agent), (tx) =>
      tx
        .update(agentRuns)
        .set({ endedAt })
        .where(eq(agentRuns.id, id))
        .returning({
          startedAt: agentRuns.startedAt,
          endedAt: agentRuns.endedAt,
          endedNow: sql<boolean>`${agentRuns.endedAt} = now()`,
        }),
    );

    expect(row?.endedNow).toBe(true);
    expect(row!.endedAt!.getTime()).toBeGreaterThan(row!.startedAt.getTime());
  });

  it("can't change the purpose", async () => {
    const { id } = await startRun(testAccounts.agent);

    await expect(
      withUser(db, asUser(testAccounts.agent), (tx) =>
        tx.update(agentRuns).set({ purpose: "Something else" }).where(eq(agentRuns.id, id)),
      ),
    ).rejects.toMatchObject(permissionDenied);
  });
});

describe("linking events to runs", () => {
  // Events only get a run through order_action(), and nobody inserts events directly any more.
  it("refuses a developer's direct event, with or without a run", async () => {
    const { id: runId } = await startRun(testAccounts.agent);
    const [seeded] = await db.select().from(orders).limit(1);
    const developer: UserClaims = {
      sub: testAccounts.developer,
      global_roles: ["platform_developer"],
    };
    const addEvent = (agentRunId: string | null) =>
      withUser(db, developer, (tx) =>
        tx.insert(orderEvents).values({
          orderId: seeded!.id,
          action: "authorized",
          actorUserId: testAccounts.developer,
          actorName: "Schema test",
          agentRunId,
        }),
      );

    await expect(addEvent(null)).rejects.toMatchObject(permissionDenied);
    await expect(addEvent(runId)).rejects.toMatchObject(permissionDenied);
  });
});

describe("reading runs", () => {
  it("shows a run to its agent and to platform staff, not to merchants or strangers", async () => {
    const { id } = await startRun(testAccounts.agent);

    expect(await visibleRunIds(testAccounts.agent)).toContain(id);
    expect(await visibleRunIds(testAccounts.developer)).toContain(id);
    expect(await visibleRunIds(testAccounts.operator)).toContain(id);
    expect(await visibleRunIds(testAccounts.merchantB)).not.toContain(id);
    expect(await visibleRunIds(testAccounts.stranger)).not.toContain(id);
  });
});
