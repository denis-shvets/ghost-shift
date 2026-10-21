# 0017. Customers are planned on the owner's machine and placed by a Worker cron

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

Night Shift's customers and the orders agent should also work in the live demo, so visitors see orders arrive and get captured. The agents sign in as real Supabase users ([0007](0007-agent-identities.md)), which means a password or token must be wherever they run. Everything must stay free ([0002](0002-free-and-open-source.md)).

Most of a customer visit needs no judgment: when to shop is a dice roll from the persona's schedule, and placing the order is an API call. Only the basket follows the persona's habits in plain words. A demo also needs orders while the owner's computer is off.

## Decision

Split deciding from placing.

- **Planning runs on the owner's machine**, whenever the owner likes: `pnpm night-shift:plan` (or `:hosted`). Code draws the visit times from each persona's schedule. `claude -p` on Haiku at low effort, with no tools and no MCP server, makes each visit's choices as structured JSON: a store key, products as a list (`physical` or `digital`) and a number from 1 to 25 with quantities, a payment method and address keys, up to 150 visits per run. Code builds the orders from those choices, the persona's `.json` file and the store's catalog, so prices and addresses can't come out wrong, and checks them with the orders API's schema. The owner reads the plan file and uploads it (`pnpm night-shift:upload`), signed in as the checkout account. Its password stays in the git-ignored `.hosted.vars`.
- **Placing runs in the Worker**, through a Cloudflare cron trigger every 30 minutes. It claims the due rows of the `scheduled_checkouts` table and places each order through the app's own `createOrder`, as the user who queued it, so row-level security applies. The order is dated at its planned time.
- **The orders agent** stays a Claude run on the owner's machine (a scheduled task in the Claude desktop app), locally or against the live app (`ghost-shift-agent-hosted`). Hosted mode is explicit: its own pnpm scripts and `.mcp.json` entry, and an allowlist of the live app's host and `<project-ref>.supabase.co`.
- Jobs that need no judgment stay in pg_cron ([0016](0016-scheduled-jobs-pg-cron.md)), for example shipping queued orders some hours after they were placed.

Rejected:

- **An always-on runner on the owner's machine** that starts one Claude run per visit: orders stop while the computer sleeps or is off, and every order costs a Claude run.
- **Future-dated orders** (insert next week's orders now and hide them until their time): every query, policy and job that reads orders would have to filter them, and nothing could react when an order "arrives".
- **Placing in pg_cron:** order creation (totals, lines, addresses, the first event) lives in TypeScript and would have to be written again in SQL.
- **Claude in the cloud** (scheduled cloud agents, GitHub Actions): the hosted passwords would have to be stored with a third party, and runs there are billed or limited.
- **One Claude run per persona per plan:** more runs than needed, and the busy personas would still need splitting.

## Links

- Cloudflare Workers cron triggers: <https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- Cloudflare Workers limits: <https://developers.cloudflare.com/workers/platform/limits/>
- Claude Code headless mode (`claude -p`): <https://code.claude.com/docs/en/headless>

## How to use

- Local: `pnpm db:start`, `pnpm dev`, `pnpm night-shift:plan`, read the file, `pnpm night-shift:upload <file>`. Trigger the cron with `curl http://localhost:3000/cdn-cgi/handler/scheduled`.
- Hosted: fill in `.hosted.vars` from `.hosted.vars.example`, then the `:hosted` scripts. The deployed Worker's cron places the orders.
- Steps and owner-only setup: [Night Shift guide](../guides/night-shift.md).

## Known limits (checked 2026-10-21)

- The Workers free plan allows 5 cron triggers per account and 10 ms of CPU per run; waiting for the database doesn't count. One run places at most 10 orders.
- A plan is fixed when it's made. Rows for a store that closed later fail when they come due, with the reason stored.
- When the queue runs empty, orders stop until the owner plans again.
- Hosted passwords sit in a plain file on the owner's disk, like `.dev.vars`. They belong to accounts that can only do what their store roles allow.

## Consequences

- Easier: the live demo gets orders around the clock, it stays free, Claude runs once per 150 orders, and the owner can read every order before it happens.
- Harder: one more table and a cron in the Worker. The cron acts as the queuing user without a password, so its code must only ever place orders through `createOrder` with row-level security.
- Revisit when the demo needs customers that react to what happens in the app (for example, reorder after a refund). That needs judgment at the time of the visit, not a week before.
