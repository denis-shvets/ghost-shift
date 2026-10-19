# 0016. Scheduled jobs run in pg_cron

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Some work happens on a clock, not because someone asked for it. The first case: an order's payment authorization runs out after 7 or 28 days, and the order must then become `expired`. In the real world, the payment provider does this. No backoffice person decides it. The job must run reliably, for free ([0002](0002-free-and-open-source.md)), and leave a record in the order's timeline.

## Decision

Scheduled jobs that only change data run **inside the database with pg_cron**, the Postgres extension Supabase ships. Each job is a SQL function, and its schedule is saved in a migration. These jobs write their timeline events as `System`, with no user.

Rejected:

- **Cloudflare Workers cron trigger:** free, but needs a custom server entry next to TanStack Start's, and an identity to run the same SQL as.
- **An agent on a schedule** (a Claude task calling an `/api/` route): fits "agents do the work", but spends tokens on every run, and orders would never expire if the agent missed a run. Expiry isn't a judgment call. Agents do work that needs one, through the API ([0007](0007-agent-identities.md)).

## Links

- Supabase Cron: <https://supabase.com/docs/guides/cron>
- pg_cron: <https://github.com/citusdata/pg_cron>

## How to use

- Write the job as a SQL function in a custom migration (`pnpm db:generate --custom --name <name>`). Revoke `execute` from `public`, `anon`, `authenticated` and `service_role`, so only the owner (and pg_cron) can call it.
- Schedule it in the same migration: `select cron.schedule('<name>', '<cron expression>', 'select public.<function>()');`. Scheduling the same name again updates the job.
- See jobs with `select * from cron.job;` and runs with `select * from cron.job_run_details order by start_time desc;`, or in the dashboard under Integrations → Cron.
- First job: `expire-orders`, every 15 minutes ([orders database guide, section 5](../guides/orders-database.md#5-the-expiry-job-2026-10-20)).

## Known limits (checked 2026-10-20)

- Included in the free plan. Jobs stop while a free project is paused ([0005](0005-supabase.md)), then catch up on the first run after it resumes.
- The job runs as `postgres`, so row-level security doesn't apply. Its rules must be in the function, plus triggers or constraints.
- Local Supabase runs the jobs too, so `pnpm db:start` changes data on the schedule.

## Consequences

- Easier: no extra service, no tokens, and the job runs even when the app and agents are idle.
- Harder: the logic is SQL, not TypeScript, so it's tested against the local database.
- Revisit when a scheduled job needs judgment, outside services or email. Those belong to an agent or a Worker.
