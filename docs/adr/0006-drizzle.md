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
- `pnpm db:generate` creates a SQL migration in `supabase/migrations/` from schema changes. Review it, then commit it.
- `pnpm db:reset` applies all migrations and the seed data to the local database. The Supabase CLI applies the same folder to the hosted project.
- Drizzle can't generate `grant` statements. For each new table, add a hand-written migration with `pnpm db:generate --custom --name <name>` that grants the API roles exactly what the policies expect, for example `grant select on table public.orders to anon, authenticated;`. A grant lets a role ask; RLS policies still decide which rows it gets.
- Name every constraint yourself, as `<table>_<what it covers>_<kind>`, so error messages say which rule failed:
  - `_fk` for foreign keys: `orders_store_currency_fk`
  - `_check` for checks: `orders_currency_format_check`
  - `_unique` for uniqueness: `order_lines_order_position_unique`
  - Primary keys keep Postgres's own `<table>_pkey`.

  Declare foreign keys with `foreignKey({ name, ... })` in the table's extra config, not `.references()`, because `.references()` can't take a name. Keep names under 63 characters, where Postgres cuts them off.

- Never query as the connection's own user from a request handler. Use the shared `withRole(db, role, tx => ...)` helper from `src/shared/db/client.ts` so RLS applies. Until sign-in exists, pages read as `anon`; signed-in users will get a helper that also sets their claims.

## Known limits

- On Workers, connect through Supabase's transaction pooler (or Cloudflare Hyperdrive) and keep connections per request. Prepared statements must be off in transaction pooling mode.
- A query that skips `withRole` silently bypasses RLS. Tests must prove agents can't read other users' data (see [0010](0010-testing.md)).

## Consequences

A typed, reviewable schema and strong SQL. More setup, and one easy-to-miss security rule that tests must guard.
