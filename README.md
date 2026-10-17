# Ghost Shift

An open-source merchant portal for Phantom Checkout, a fictional checkout provider, run by AI agents that act on their own.
Agents and people use the same app, the same API and the same permissions. Every action is logged with who did it and why, and humans can take over at any time.

> **Live demo:** <https://ghost-shift.denis-shvets.workers.dev/>
>
> **Status:** scaffold. Routes and pages with mocked data only, no features, database or design yet. See [the idea](docs/idea.md) and the [decision records](docs/adr/README.md).

## Stack

Everything runs on free plans with no card. Each row links to the service and to the ADR that explains how we use it and its limits.

| Area                     | Choice                                                                             | Why and limits                                  |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| Frontend + backend       | [TanStack Start](https://tanstack.com/start/latest)                                | [ADR 0003](docs/adr/0003-tanstack-start.md)     |
| Hosting                  | [Cloudflare Workers](https://developers.cloudflare.com/workers/)                   | [ADR 0004](docs/adr/0004-cloudflare-workers.md) |
| Database, auth, realtime | [Supabase](https://supabase.com/)                                                  | [ADR 0005](docs/adr/0005-supabase.md)           |
| ORM and migrations       | [Drizzle](https://orm.drizzle.team/)                                               | [ADR 0006](docs/adr/0006-drizzle.md)            |
| Agent accounts           | Supabase Auth users                                                                | [ADR 0007](docs/adr/0007-agent-identities.md)   |
| File uploads             | [Supabase Storage](https://supabase.com/docs/guides/storage)                       | [ADR 0008](docs/adr/0008-file-storage.md)       |
| Email                    | [Resend](https://resend.com/), [Mailpit](https://mailpit.axllent.org/) for testing | [ADR 0009](docs/adr/0009-email.md)              |
| Tests                    | [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/)               | [ADR 0010](docs/adr/0010-testing.md)            |
| CI                       | [GitHub Actions](https://docs.github.com/actions)                                  | [ADR 0011](docs/adr/0011-ci.md)                 |
| Structure                | Feature folders                                                                    | [ADR 0012](docs/adr/0012-feature-structure.md)  |
| Lint and format          | [Oxlint](https://oxc.rs/), Oxfmt                                                   | [ADR 0013](docs/adr/0013-lint-format.md)        |

## No custom domain yet

Ghost Shift deliberately runs without a paid domain for now. That means:

- The app lives on a `*.workers.dev` URL.
- **Real email only reaches the project owner's own address.** Resend refuses other recipients until a domain is verified. Tests and demos use Resend's test inboxes (`delivered+<label>@resend.dev`) and Mailpit.
- Agent accounts use Gmail plus-addresses on the owner's inbox (`owner+agent.<name>@gmail.com`).

When a domain is added: verify it in Resend, change the sender address, and update [ADR 0009](docs/adr/0009-email.md).

## Getting started

### What you need

- [Node.js](https://nodejs.org/) 26 or newer. Check with `node -v`.
- [pnpm](https://pnpm.io/installation) 12 or newer. On Windows, install it in PowerShell with `irm https://get.pnpm.io/install.ps1 | iex`, then open a new terminal. Check with `pnpm -v`.
- [Git](https://git-scm.com/) with SSH access to GitHub.

### Run it

1. Clone the repository and go into it:
   ```bash
   git clone git@github.com:denis-shvets/ghost-shift.git
   cd ghost-shift
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the dev server:
   ```bash
   pnpm dev
   ```
4. Open <http://localhost:3000>. Use the navigation to visit every page. Changes to files in `src/` show up right away.
5. Stop the server with `Ctrl+C` in the terminal.

### Check the code

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `pnpm lint`         | Lints with Oxlint.                                       |
| `pnpm format`       | Formats every file with Oxfmt.                           |
| `pnpm format:check` | Checks formatting without changing files.                |
| `pnpm typecheck`    | Type checks with TypeScript.                             |
| `pnpm build`        | Builds the production app into `dist/`.                  |
| `pnpm preview`      | Serves the production build locally, after `pnpm build`. |
| `pnpm run deploy`   | Builds and deploys to Cloudflare Workers. See below.     |

GitHub Actions runs `lint`, `format:check`, `typecheck` and `build` on every pull request and every push to `main` ([.github/workflows/ci.yml](.github/workflows/ci.yml)). Run them locally before you push to catch problems early.

### Deploy to Cloudflare Workers

The app runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/) on the free plan ([ADR 0004](docs/adr/0004-cloudflare-workers.md)). `pnpm dev` and `pnpm preview` already run the server code in the local Workers runtime, so a page that works locally works there too.

First time only:

1. Create a free account at <https://dash.cloudflare.com/sign-up>. No card is needed.
2. Log Wrangler in to your account. This opens a browser window to approve access:
   ```bash
   pnpm exec wrangler login
   ```
3. Check that it worked. This shows your account name and ID:
   ```bash
   pnpm exec wrangler whoami
   ```

Every deploy:

1. Run the checks:
   ```bash
   pnpm lint
   pnpm format:check
   pnpm typecheck
   ```
2. Build and deploy. Use `pnpm run deploy`, not `pnpm deploy`, which is a different built-in pnpm command:
   ```bash
   pnpm run deploy
   ```
3. Open the URL it prints, `https://ghost-shift.<your-subdomain>.workers.dev`. The first deploy asks you to pick the `workers.dev` subdomain for your account.

To see logs from the live app, run `pnpm exec wrangler tail`, or open **Workers & Pages → ghost-shift → Logs** in the Cloudflare dashboard.

### Where things are

```
src/
  routes/          # one file per page; the file path is the URL
    __root.tsx     # page shell and navigation
    orders/        # /orders and /orders/<id>
  mocks/           # invented data the pages show, until features are built
  router.tsx       # router setup
wrangler.jsonc     # Cloudflare Workers config
  routeTree.gen.ts # generated by TanStack Router, don't edit
docs/              # idea and decision records
```

To add a page, create a file in `src/routes/`, for example `src/routes/customers.tsx` for `/customers`, and add a link in `src/routes/__root.tsx`. The dev server regenerates `routeTree.gen.ts` for you.

The feature folders from [ADR 0012](docs/adr/0012-feature-structure.md) arrive with the first real feature.

## License

To be decided before the first release.
