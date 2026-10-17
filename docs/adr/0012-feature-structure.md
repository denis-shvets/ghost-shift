# 0012. Feature-based project structure

- **Status:** Proposed
- **Date:** 2026-10-17

## Context

Agents work best when everything about one feature sits in one place: they can read one folder and change it without touching unrelated code.

## Decision

Group code by feature, not by technical layer. TanStack Start requires pages in `src/routes/`, so route files stay thin and delegate to the feature.

```
src/
  routes/                  # file-based routes only, thin
    api/                   # REST endpoints for agents, thin
  features/
    <feature>/
      db/schema.ts         # Drizzle tables and RLS policies
      server/              # server functions and API handlers
      model/               # types, Zod schemas, business rules
      ui/                  # React components (added in the design session)
      emails/              # email templates, if the feature sends any
      <feature>.test.ts    # Vitest
      <feature>.e2e.ts     # Playwright
      README.md            # what the feature does, for humans and agents
  shared/
    db/                    # Drizzle client, withUser() RLS helper
    auth/                  # session and role helpers
    email/                 # transport (Resend or Mailpit)
    api/                   # validation, errors, OpenAPI generation
supabase/                  # Supabase CLI config, seed data
drizzle/                   # generated SQL migrations
docs/                      # idea and ADRs
```

Rules:
- A feature may import from `shared/`, never from another feature's internals. Cross-feature calls go through the other feature's exported `index.ts`.
- `shared/` never imports from `features/`.

## Links

- TanStack Router file-based routing: <https://tanstack.com/router/latest/docs/framework/react/routing/file-based-routing>
- Feature-Sliced Design (related idea): <https://feature-sliced.design/>

## How to use

To add a feature, create `src/features/<name>/` with the folders above, then add thin route files that call into it.

## Known limits

The import rules need a lint rule to enforce them; see [0013](0013-lint-format.md).

## Consequences

Features are easy to find, test and delete. Some code is duplicated before it earns a place in `shared/`.
