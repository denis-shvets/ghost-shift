# Architecture Decision Records

Each file records one decision: why we made it, what we chose, how to use it, and its known limits.
Free-tier limits change often. Every limit below was checked on **2026-10-17**; re-check the linked pricing page before relying on it.

| #    | Decision                                                                                     | Status             |
| ---- | -------------------------------------------------------------------------------------------- | ------------------ |
| 0001 | [Record decisions as ADRs](0001-record-decisions.md)                                         | Accepted           |
| 0002 | [Free tier and open source only](0002-free-and-open-source.md)                               | Accepted           |
| 0003 | [TanStack Start for frontend and backend](0003-tanstack-start.md)                            | Accepted           |
| 0004 | [Host on Cloudflare Workers](0004-cloudflare-workers.md)                                     | Accepted           |
| 0005 | [Supabase as the backend platform](0005-supabase.md)                                         | Accepted           |
| 0006 | [Drizzle ORM for schema and queries](0006-drizzle.md)                                        | Accepted           |
| 0007 | [Humans and agents as real users](0007-agent-identities.md)                                  | Accepted           |
| 0008 | [Supabase Storage for files](0008-file-storage.md)                                           | Accepted           |
| 0009 | [Resend for email, Mailpit for testing](0009-email.md)                                       | Accepted           |
| 0010 | [Testing with Vitest and Playwright](0010-testing.md)                                        | Accepted           |
| 0011 | [CI on GitHub Actions](0011-ci.md)                                                           | Accepted           |
| 0012 | [Feature-based project structure](0012-feature-structure.md)                                 | Accepted           |
| 0013 | [Oxlint and Oxfmt for linting and formatting](0013-lint-format.md)                           | Accepted           |
| 0014 | [No UI design in the first scaffold](0014-no-design-yet.md)                                  | Superseded by 0018 |
| 0015 | [Role-based access with scoped assignments](0015-role-based-access.md)                       | Accepted           |
| 0016 | [Scheduled jobs run in pg_cron](0016-scheduled-jobs-pg-cron.md)                              | Accepted           |
| 0017 | [Customers are planned locally and placed by a Worker cron](0017-local-agents-hosted-app.md) | Accepted           |
| 0018 | [Structural styling with Tailwind](0018-structural-styling.md)                               | Accepted           |

New decision: copy [template.md](template.md), take the next number, add a row here.
A decision is never edited away: replace it with a new ADR and mark the old one `Superseded by NNNN`.
