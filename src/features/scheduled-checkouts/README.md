# Scheduled checkouts

Night Shift's queue: orders planned ahead on the owner's machine, placed by the Worker cron when they are due.

## What it does now

- `POST /api/v1/scheduled-checkouts` queues a plan (`{ planId, checkouts: [{ dueAt, persona, order }] }`) for the signed-in user. Every `dueAt` must be in the future, and the user needs `orders.create` in each order's store.
- `GET /api/v1/scheduled-checkouts` answers `{ lastDueAt, storeIds }`: the latest due time among the user's pending checkouts, so a new plan can start after it, and the stores the user may queue in, so the planner skips the rest.
- Every 30 minutes the Worker's `scheduled` handler (`src/server.ts`) places up to 10 due checkouts, claimed one at a time, through `createOrder`, as the user who queued them, dated at the planned time. More than 6 hours late is skipped; a refused order is marked failed.
- `pnpm night-shift:plan` and `pnpm night-shift:upload` (`scripts/night-shift.ts`) make and send the plans.

How it works, step by step: [the Night Shift guide](../../../docs/guides/night-shift.md).

## Files

| File                                       | Purpose                                             |
| ------------------------------------------ | --------------------------------------------------- |
| `db/schema.ts`                             | The `scheduled_checkouts` table and its status enum |
| `db/schema.test.ts`                        | Grant and row-level security tests                  |
| `model/scheduled-checkout-input.ts`        | Zod schema for a plan, and the statuses             |
| `server/scheduled-checkouts-repository.ts` | Queue a plan, the planning context, place due ones  |
