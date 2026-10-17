# 0012. Feature-based project structure

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Agents work best when everything about one feature sits in one place: they can read one folder and change it without touching unrelated code.

## Decision

Group code by feature, not by technical layer. TanStack Start requires pages in `src/routes/`, so route files stay thin and delegate to the feature.

```
src/
  routes/                        # file-based routes only, thin
    api/                         # REST endpoints for agents, thin
  features/
    <feature>/
      db/
        schema.ts                # Drizzle tables and RLS policies
        schema.test.ts           # RLS tests for these tables
      server/
        capture-order.ts         # server functions and API handlers
        capture-order.test.ts
      model/
        order.ts                 # types, Zod schemas, business rules
        order.test.ts
      ui/
        OrderTable.tsx           # React components (added in the design session)
        OrderTable.test.tsx      # component test, next to its component
      emails/
        OrderCaptured.tsx        # email template, if the feature sends any
        OrderCaptured.test.tsx
      orders.e2e.ts              # Playwright flows for the whole feature
      index.ts                   # what other features may import
      README.md                  # what the feature does, for humans and agents
  shared/
    db/                          # Drizzle client, withUser() RLS helper
    auth/                        # session and role helpers
    email/                       # transport (Resend or Mailpit)
    api/                         # validation, errors, OpenAPI generation
supabase/                        # Supabase CLI config, seed data
drizzle/                         # generated SQL migrations
docs/                            # idea and ADRs
```

Rules:

- **Everything about a feature lives in its folder**: schema, server code, rules, components, emails, tests and docs.
- **Tests sit next to the file they test**, with the same name plus `.test.ts` or `.test.tsx`. That includes component tests next to their component. There is no separate `tests/` or `__tests__/` folder.
- End-to-end flows for a feature go in `<feature>.e2e.ts` at the feature root.
- A feature may import from `shared/`, never from another feature's internals. Cross-feature calls go through the other feature's exported `index.ts`.
- `shared/` never imports from `features/`.

## Links

- TanStack Router file-based routing: <https://tanstack.com/router/latest/docs/framework/react/routing/file-based-routing>
- Feature-Sliced Design (related idea): <https://feature-sliced.design/>

## How to use

To add a feature, create `src/features/<name>/` with only the folders it needs, then add thin route files that call into it. When you add a file, add its test beside it.

## Known limits

The import rules need a lint rule to enforce them; see [0013](0013-lint-format.md).

## Consequences

Features are easy to find, test and delete. Some code is duplicated before it earns a place in `shared/`.
