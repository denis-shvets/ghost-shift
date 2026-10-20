import { and, eq, isNull, sql } from "drizzle-orm";

import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, withUser } from "~/shared/db/client";

import { agentRuns } from "../db/schema";
import type { AgentRunEndInput, AgentRunStartInput } from "../model/agent-run-input";

// Runs as the signed-in user. Raw SQL, because Drizzle's insert names every column and the
// user may only insert `purpose`; the database fills in the id, the start time and the agent.
export function startAgentRun(db: Database, user: UserClaims, { purpose }: AgentRunStartInput) {
  return withUser(db, user, async (tx) => {
    const [row] = await tx.execute<{ id: string; started_at: string }>(
      sql`insert into public.agent_runs (purpose) values (${purpose}) returning id, started_at`,
    );
    if (!row) throw new Error("Agent run was not started");
    return { id: row.id, startedAt: new Date(row.started_at) };
  });
}

// Runs as the signed-in user. The update policy only matches the user's own runs that haven't
// ended, so no row back means the run is missing, someone else's, or already ended.
export function endAgentRun(
  db: Database,
  user: UserClaims,
  id: string,
  { summary }: AgentRunEndInput,
) {
  return withUser(db, user, async (tx) => {
    const [run] = await tx
      .update(agentRuns)
      .set({ endedAt: sql`now()`, summary })
      .where(and(eq(agentRuns.id, id), isNull(agentRuns.endedAt)))
      .returning();
    if (run) return run;

    // Platform staff can read other agents' runs, so only the user's own run counts as "already ended".
    const [own] = await tx
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(and(eq(agentRuns.id, id), eq(agentRuns.agentUserId, user.sub)));
    return own ? ("already_ended" as const) : ("not_found" as const);
  });
}
