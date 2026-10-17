# Ghost Shift

An open-source merchant portal for Phantom Checkout, a fictional checkout provider, run by AI agents that act on their own.
Agents and people use the same app, the same API and the same permissions. Every action is logged with who did it and why, and humans can take over at any time.

> **Status:** planning. No code yet. See [the idea](docs/idea.md) and the [decision records](docs/adr/README.md).

## Stack

Everything runs on free plans with no card. Each row links to the service and to the ADR that explains how we use it and its limits.

| Area                | Choice                                                    | Why and limits                                  |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Frontend + backend  | [TanStack Start](https://tanstack.com/start/latest)       | [ADR 0003](docs/adr/0003-tanstack-start.md)     |
| Hosting             | [Cloudflare Workers](https://developers.cloudflare.com/workers/) | [ADR 0004](docs/adr/0004-cloudflare-workers.md) |
| Database, auth, realtime | [Supabase](https://supabase.com/)                    | [ADR 0005](docs/adr/0005-supabase.md)           |
| ORM and migrations  | [Drizzle](https://orm.drizzle.team/)                      | [ADR 0006](docs/adr/0006-drizzle.md)            |
| Agent accounts      | Supabase Auth users                                       | [ADR 0007](docs/adr/0007-agent-identities.md)   |
| File uploads        | [Supabase Storage](https://supabase.com/docs/guides/storage) | [ADR 0008](docs/adr/0008-file-storage.md)    |
| Email               | [Resend](https://resend.com/), [Mailpit](https://mailpit.axllent.org/) for testing | [ADR 0009](docs/adr/0009-email.md) |
| Tests               | [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/) | [ADR 0010](docs/adr/0010-testing.md) |
| CI                  | [GitHub Actions](https://docs.github.com/actions)         | [ADR 0011](docs/adr/0011-ci.md)                 |
| Structure           | Feature folders                                           | [ADR 0012](docs/adr/0012-feature-structure.md)  |
| Lint and format     | [Oxlint](https://oxc.rs/), Oxfmt                          | [ADR 0013](docs/adr/0013-lint-format.md)        |

## No custom domain yet

Ghost Shift deliberately runs without a paid domain for now. That means:

- The app lives on a `*.workers.dev` URL.
- **Real email only reaches the project owner's own address.** Resend refuses other recipients until a domain is verified. Tests and demos use Resend's test inboxes (`delivered+<label>@resend.dev`) and Mailpit.
- Agent accounts use Gmail plus-addresses on the owner's inbox (`owner+agent.<name>@gmail.com`).

When a domain is added: verify it in Resend, change the sender address, and update [ADR 0009](docs/adr/0009-email.md).

## Getting started

Coming with the first scaffold.

## License

To be decided before the first release.
