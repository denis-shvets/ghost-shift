import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb } from "~/shared/db/client";

import { agentRuns } from "../db/schema";

import { endAgentRun, startAgentRun } from "./agent-runs-repository";

// Runs against the local Supabase database (`pnpm db:reset`).
const db = createDb(testDatabaseUrl);
const purpose = "Repository test run";

beforeAll(() => createTestAccounts(db));
afterAll(async () => {
  await db.delete(agentRuns).where(eq(agentRuns.purpose, purpose));
  await db.close();
});

const agent: UserClaims = { sub: testAccounts.agent, global_roles: [] };
const developer: UserClaims = { sub: testAccounts.developer, global_roles: ["platform_developer"] };

describe("startAgentRun and endAgentRun", () => {
  it("starts a run for the user and ends it with a summary", async () => {
    const started = await startAgentRun(db, agent, { purpose });
    expect(started.startedAt).toBeInstanceOf(Date);

    const ended = await endAgentRun(db, agent, started.id, { summary: "Captured 2 orders" });

    expect(ended).toMatchObject({
      id: started.id,
      agentUserId: testAccounts.agent,
      purpose,
      summary: "Captured 2 orders",
      endedAt: expect.any(Date),
    });
  });

  it("answers already_ended for the user's own ended run", async () => {
    const { id } = await startAgentRun(db, agent, { purpose });
    await endAgentRun(db, agent, id, {});

    expect(await endAgentRun(db, agent, id, {})).toBe("already_ended");
  });

  it("answers not_found for someone else's run, even to platform staff who can read it", async () => {
    const { id } = await startAgentRun(db, agent, { purpose });

    expect(await endAgentRun(db, developer, id, {})).toBe("not_found");
    expect(await endAgentRun(db, agent, crypto.randomUUID(), {})).toBe("not_found");
  });
});
