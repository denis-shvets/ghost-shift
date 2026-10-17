# Stores

A merchant's stores, one per market (country), each with its own currency and a `live` or `test` status.

## What it does now

- Only the `stores` table, so orders can point at a real store and must use its currency.
- The `/stores` page still shows mock data. It switches to this table when the stores feature is built.

## Data

- Table `stores`, defined in [db/schema.ts](db/schema.ts).
- `market` must be 2 capital letters (ISO 3166-1, `SE`) and `currency` 3 capital letters (ISO 4217, `SEK`).
- `(id, currency)` is unique, so `orders` can reference both together.
- Row-level security is on. Anyone can read for now. Demo rows live in [supabase/seed.sql](../../../supabase/seed.sql).
