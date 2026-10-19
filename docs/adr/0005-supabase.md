# 0005. Supabase as the backend platform

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

A backoffice needs a database, logins with roles, live updates and file storage. Building each ourselves is slow; picking a separate free service for each adds accounts and limits.

## Decision

Use **Supabase** for:

- **Postgres** database (queried through Drizzle, see [0006](0006-drizzle.md)).
- **Auth** for humans and agents (see [0007](0007-agent-identities.md)).
- **Row-level security (RLS)**, so permissions are enforced in the database for every user, including agents.
- **Realtime**, so screens update live when an agent changes something.
- **Storage** for files (see [0008](0008-file-storage.md)).

Rejected: Neon (Postgres only, no auth, realtime or storage), Cloudflare D1 (SQLite, not Postgres).

## Links

- Supabase: <https://supabase.com/>
- Docs: <https://supabase.com/docs>
- Pricing: <https://supabase.com/pricing>
- CLI and local development: <https://supabase.com/docs/guides/local-development>
- Row-level security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Realtime: <https://supabase.com/docs/guides/realtime>
- `supabase-js`: <https://supabase.com/docs/reference/javascript/introduction>

## How to use

- Local development needs [Docker Desktop](https://www.docker.com/products/docker-desktop/). `pnpm db:start` runs the full stack in Docker, including Studio and Mailpit (see [0009](0009-email.md)). `pnpm db:stop` stops it.
- Local ports are 64320 to 64329 (database on 64322, Studio on 64323), set in `supabase/config.toml`. Supabase's default 543xx ports fall inside a range Windows reserves for Hyper-V, so they fail to bind there.
- `pnpm db:reset` rebuilds the local database from `supabase/migrations/` and `supabase/seed.sql`, for a clean QA run.
- Hosted: a free project, linked with `supabase link`, with migrations applied by `supabase db push`. The live site connects through the transaction pooler (port 6543) using the `DATABASE_URL` Cloudflare secret. Step by step in the README's "Set up the hosted database".
- New hosted projects don't grant `anon` and `authenticated` access to new tables, but local Supabase does. Every table therefore gets explicit `grant` statements in a migration, so all databases behave the same.
- Use `supabase-js` for auth, realtime and storage. Use Drizzle for database queries.
- Scheduled jobs that only change data, such as expiring orders, run in the database with pg_cron (see [0016](0016-scheduled-jobs-pg-cron.md)).

## Known limits (free plan, checked 2026-10-17; sources disagree, confirm on the pricing page)

- **Pauses after 7 days with no activity.** Data is kept, but the app stops until the project is restored in the dashboard. Our CI pings it daily (see [0011](0011-ci.md)).
- 2 active projects, 500 MB database per project.
- 50,000 monthly active users, 5 GB egress a month.
- Realtime: 200 concurrent connections, 2 million messages a month.
- Built-in auth emails are capped at a few per hour.

## Consequences

Much less backend code, and permissions that hold even if app code has a bug. We depend more on Supabase, but it is open source and can be self-hosted.
