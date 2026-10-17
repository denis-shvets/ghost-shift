# 0010. Testing with Vitest and Playwright

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

QA is part of the showcase. A human tester runs manual QA, and agents need automated tests to trust their own changes.

## Decision

- **Vitest** for unit and integration tests, including API routes against the local Supabase database.
- **Playwright** for end-to-end tests in a real browser, including reading emails from Mailpit.
- **Security tests** prove that RLS holds: an agent or user can't read or change data outside its role.

## Links

- Vitest: <https://vitest.dev/>
- Playwright: <https://playwright.dev/>
- Playwright test generator (record tests by clicking): <https://playwright.dev/docs/codegen>
- Mailpit API: <https://mailpit.axllent.org/docs/api-v1/>

## How to use

- `pnpm test` runs Vitest. `pnpm test:e2e` runs Playwright against a local build.
- Tests live next to the feature they cover (see [0012](0012-feature-structure.md)).
- `pnpm supabase db reset` before a run gives a known starting state.
- A manual tester can record a bug as a test with `pnpm exec playwright codegen`.

## Known limits

- End-to-end tests need Docker running for local Supabase.

## Consequences

Every feature ships with tests. Bugs found in manual QA can be turned into regression tests.
