# Agent runs

One execution of an agent, for example a scheduled job that captures orders. Every order event the agent makes during the run points back to it.

## What it does now

- `POST /api/v1/agent-runs` starts a run for the signed-in user with a purpose. `PATCH /api/v1/agent-runs/<id>` ends it, with an optional summary. Only the run's own user can end it, and only once.
- Order actions take an optional `agentRunId`. `public.order_action()` checks the run and writes it on the event.
- The audit log (`/audit-log`) has a Run column: the run's purpose for the agent and platform staff, the first 8 characters of its id for merchants.
- `pnpm db:seed-users` adds one ended sample run for the seeded agent.

How it works, step by step: [the agent runs guide](../../../docs/guides/agent-runs.md).

## Files

| File                              | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `db/schema.ts`                    | The `agent_runs` table                    |
| `db/schema.test.ts`               | Grant and row-level security tests        |
| `model/agent-run-input.ts`        | Zod schemas for starting and ending a run |
| `server/agent-runs-repository.ts` | Start and end a run, through `withUser`   |
