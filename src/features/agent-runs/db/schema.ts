import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

// One execution of an agent: who ran it, when, what for and how it ended. Order events made
// during the run point back here (order_events.agent_run_id).
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Filled in by the database from the caller's token, so a run can't be started for someone else.
    agentUserId: uuid()
      .notNull()
      .default(sql`auth.uid()`),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Empty while the run is going. Once set, the run can't be changed (see the access migration).
    endedAt: timestamp({ withTimezone: true }),
    purpose: text().notNull(),
    // What the agent says it did, written when the run ends.
    summary: text(),
  },
  (table) => [
    foreignKey({
      name: "agent_runs_agent_user_fk",
      columns: [table.agentUserId],
      foreignColumns: [authUsers.id],
    }).onDelete("cascade"),
    check(
      "agent_runs_purpose_length_check",
      sql`char_length(btrim(${table.purpose})) between 1 and 200`,
    ),
    check(
      "agent_runs_summary_length_check",
      sql`${table.summary} is null or char_length(${table.summary}) <= 2000`,
    ),
    check(
      "agent_runs_ended_after_started_check",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
    ),
  ],
).enableRLS();
