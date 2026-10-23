# Working on Ghost Shift

Rules for AI agents (and humans) changing this repo. The reasons behind the stack are in [docs/adr/](docs/adr/README.md); read the ADR before changing a technology.

## Before you push

- Ask the owner before every push. Never push on your own.
- Run `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` and `pnpm test` (needs `pnpm db:start`). CI runs the same, fastest first.
- Keep history clean: the owner often asks to amend into an existing commit and force-push with `--force-with-lease`.
- Use conventional commit subjects, for example `feat(orders): …`, `fix(db): …`, `docs: …`.

## Code

- Feature folders: everything about a feature lives in `src/features/<name>/` ([ADR 0012](docs/adr/0012-feature-structure.md)). Route files in `src/routes/` stay thin.
- Tests sit next to the file they test (`money.ts` and `money.test.ts`), component tests included. No `tests/` folders.
- No barrel files: no `index.ts` that re-exports. Import from the defining file.
- Validate everything that comes from outside (server function input, API requests, environment) with Zod. Don't re-validate data from the database or between our own functions.
- Styling and UI rules are set in [docs/adr/](docs/adr/README.md). Check the index first, since a later ADR can supersede an earlier one.

## Database

- Schema in `src/features/<name>/db/schema.ts`; `pnpm db:generate` writes the migration into `supabase/migrations/`. Never edit a migration that has been applied to the hosted database; add a new one.
- Always pass `--name <name>` to `pnpm db:generate`, so the migration isn't given a random name. Use lowercase snake_case that says what changes, starting with the table or feature: `orders_list_index`, `orders_drop_shopper`.
- Every new table needs a hand-written grant migration (`pnpm db:generate --custom --name <name>`), because hosted Supabase doesn't grant `anon`/`authenticated` automatically.
- Request handlers query through `withUser` so row-level security applies to the signed-in person. `withRole` is only for anonymous-access tests.
- Name constraints `<table>_<what it covers>_<kind>`: `_fk`, `_check`, `_unique` ([ADR 0006](docs/adr/0006-drizzle.md)).
- Money in integer minor units; tax rates in basis points.
- Keep [docs/guides/](docs/guides/) up to date with database changes.

## Dependencies and tools

- Exact versions only (`saveExact: true` in `pnpm-workspace.yaml`). pnpm 12, Node 26.
- `.gitignore` lists only entries actually in use.
- Free plans only, no card ([ADR 0002](docs/adr/0002-free-and-open-source.md)).

## Writing

- US English wording (`canceled`, `color`), but the `en-GB` locale for number and date formatting.
- Ghost Shift's provider (Phantom Checkout), merchants and data are invented. Don't name or reference real payment providers, their products or anyone's employer projects anywhere in the repo. Payment-method names (Amazon Pay, Amex, Apple Pay, Google Pay, PayPal) may be used as enum values and labels.

## Owner-only steps

Logins, secrets, `pnpm exec supabase db push` against the hosted project and `pnpm run deploy` are done by the owner. Give them step-by-step instructions instead of running these.
