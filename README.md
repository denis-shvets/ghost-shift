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
- Agent accounts use an email address you choose, such as a Gmail plus-address on your own inbox. It comes from `SEED_AGENT_EMAIL` in `.dev.vars`, and the account is created from `scripts/seed-users.local.ts` in the main checkout, so it stays out of this public repo.

When a domain is added: verify it in Resend, change the sender address, and update [ADR 0009](docs/adr/0009-email.md).

## Getting started

### What you need

- [Node.js](https://nodejs.org/) 26 or newer. Check with `node -v`.
- [pnpm](https://pnpm.io/installation) 12 or newer. On Windows, install it in PowerShell with `irm https://get.pnpm.io/install.ps1 | iex`, then open a new terminal. Check with `pnpm -v`.
- [Git](https://git-scm.com/) with SSH access to GitHub.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), running, for the local Supabase database. Check with `docker run --rm hello-world`.

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
3. Create your local settings file. The values in it only work on your machine:
   ```bash
   cp .dev.vars.example .dev.vars
   ```
4. Start the local Supabase database. The first run downloads the Docker images and takes a few minutes. It creates the tables and loads the demo data:
   ```bash
   pnpm db:start
   ```
5. Start the dev server:
   ```bash
   pnpm dev
   ```
6. Open <http://localhost:3000>. Use the navigation to visit every page. Changes to files in `src/` show up right away.
7. Stop the dev server with `Ctrl+C`. Stop the database when you're done for the day:
   ```bash
   pnpm db:stop
   ```

The Orders pages read from the database. The other pages still show invented data from `src/mocks/`. New to databases? Read [How the Orders pages read from the database](docs/guides/orders-database.md). Agents can call the orders API with a bearer token: [The orders API for agents](docs/guides/orders-api.md). Each agent job is recorded as an agent run: [Agent runs](docs/guides/agent-runs.md). Simulated customers are planned ahead and place orders at human hours: [Night Shift](docs/guides/night-shift.md).

### Work with the database

| Command            | What it does                                                                  |
| ------------------ | ----------------------------------------------------------------------------- |
| `pnpm db:start`    | Starts local Supabase in Docker.                                              |
| `pnpm db:stop`     | Stops it. Your data is kept for next time.                                    |
| `pnpm db:reset`    | Wipes the local database and reloads migrations and demo data. Use before QA. |
| `pnpm db:generate` | Creates a migration in `supabase/migrations/` after you change a `schema.ts`. |

Supabase Studio, a web UI for browsing tables, runs at <http://127.0.0.1:64323> while the database is up. Local Supabase uses ports 64320 to 64329, because Windows reserves the default 543xx ports ([ADR 0005](docs/adr/0005-supabase.md)).

### Check the code

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `pnpm lint`         | Lints with Oxlint.                                       |
| `pnpm format`       | Formats every file with Oxfmt.                           |
| `pnpm format:check` | Checks formatting without changing files.                |
| `pnpm typecheck`    | Type checks with TypeScript.                             |
| `pnpm test`         | Runs Vitest. Needs the local database running.           |
| `pnpm build`        | Builds the production app into `dist/`.                  |
| `pnpm preview`      | Serves the production build locally, after `pnpm build`. |
| `pnpm run deploy`   | Builds and deploys to Cloudflare Workers. See below.     |

GitHub Actions runs `lint`, `format:check`, `typecheck`, `build` and `test`, fastest first, on every pull request and every push to `main` ([.github/workflows/ci.yml](.github/workflows/ci.yml)). Run them locally before you push to catch problems early.

A daily workflow, [keepalive.yml](.github/workflows/keepalive.yml), requests the live `/health/database` route, which queries the hosted database. This stops the free Supabase project from pausing after 7 days without activity ([ADR 0005](docs/adr/0005-supabase.md)). It fails if the page doesn't return `200`. To run it by hand, open the **Actions** tab, choose **Keep Supabase awake**, and click **Run workflow**.

### Set up the hosted database

The live site reads from a free hosted [Supabase](https://supabase.com/) project ([ADR 0005](docs/adr/0005-supabase.md)). This is done once. Steps that involve passwords are yours, so the database password never leaves your machine.

1. Sign in at <https://supabase.com/dashboard> and create a project named `ghost-shift` on the **Free** plan. Click **Generate a password** and save it in your password manager.
2. Copy the project ref from the address bar: `supabase.com/dashboard/project/<project-ref>`.
3. Connect the Supabase CLI. `login` opens a browser; `link` asks for the database password:
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <project-ref>
   ```
4. Preview, then create the tables and load the demo data:
   ```bash
   pnpm exec supabase db push --dry-run --include-seed
   pnpm exec supabase db push --include-seed
   ```
5. In the dashboard, click **Connect**, choose **Transaction pooler** (port **6543**, which Cloudflare Workers need) and copy the URI. Replace `[YOUR-PASSWORD]`, brackets included, with your password.
6. Store it as a Cloudflare secret. Paste the URI when asked:
   ```bash
   pnpm exec wrangler secret put DATABASE_URL
   ```

New hosted projects don't let the `anon` and `authenticated` roles read new tables on their own, while local Supabase does. The migrations grant that access explicitly, so you don't need to change any dashboard setting.

**After a change adds a migration**, apply it to the hosted database before deploying the code that needs it:

```bash
pnpm exec supabase db push
```

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
  routes/            # one file per page; the file path is the URL
    __root.tsx       # page shell and navigation
    orders/          # /orders and /orders/<uuid>
  features/
    orders/          # everything about orders, with its own README
    stores/          # the stores table orders belong to
  shared/db/         # database client and the withRole() RLS helper
  mocks/             # invented data for pages without a feature yet
  router.tsx         # router setup
  routeTree.gen.ts   # generated by TanStack Router, don't edit
supabase/
  config.toml        # local Supabase settings
  migrations/        # SQL migrations generated by Drizzle Kit
  seed.sql           # demo data
docs/                # idea and decision records
wrangler.jsonc       # Cloudflare Workers config
```

To add a page, create a file in `src/routes/`, for example `src/routes/customers.tsx` for `/customers`, and add a link in `src/routes/__root.tsx`. The dev server regenerates `routeTree.gen.ts` for you.

Features follow [ADR 0012](docs/adr/0012-feature-structure.md): everything about a feature, tests included, lives in `src/features/<name>/`.

## License

To be decided before the first release.
