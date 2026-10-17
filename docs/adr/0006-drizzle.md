# 0006. Drizzle ORM for schema and queries

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

`supabase-js` alone can query the database, but the project is also a showcase of backend skills: schema design, migrations and real SQL queries for backoffice reports.

## Decision

Use **Drizzle ORM** for the database schema (in TypeScript), migrations (`drizzle-kit`) and all queries in server code. Supabase keeps auth, realtime and storage.

**Row-level security stays on.** Every request runs its queries inside a transaction that switches to the signed-in user's role and claims, so RLS policies apply to Drizzle queries exactly as they do to `supabase-js`. Policies are declared next to the tables with Drizzle's `pgPolicy`.

Rejected: Prisma (heavier on Workers), `supabase-js` only (less to show, weaker for complex queries).

## Links

- Drizzle ORM: <https://orm.drizzle.team/>
- Drizzle with Supabase: <https://orm.drizzle.team/docs/connect-supabase>
- Drizzle Kit (migrations): <https://orm.drizzle.team/docs/kit-overview>
- RLS in Drizzle: <https://orm.drizzle.team/docs/rls>
- Supabase connection pooler: <https://supabase.com/docs/guides/database/connecting-to-postgres>

## How to use

- Each feature declares its tables and policies in `src/features/<name>/db/schema.ts`.
- `pnpm db:generate` creates a SQL migration from schema changes. Review it, then commit it.
- `pnpm db:migrate` applies migrations. Locally, `pnpm supabase db reset` replays everything.
- Never query with the service role from a request handler. Use the shared `withUser(db, user, tx => ...)` helper so RLS applies.

## Known limits

- On Workers, connect through Supabase's transaction pooler (or Cloudflare Hyperdrive) and keep connections per request. Prepared statements must be off in transaction pooling mode.
- A query that skips `withUser` silently bypasses RLS. Tests must prove agents can't read other users' data (see [0010](0010-testing.md)).

## Consequences

A typed, reviewable schema and strong SQL. More setup, and one easy-to-miss security rule that tests must guard.
