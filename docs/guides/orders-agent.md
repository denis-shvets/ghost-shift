# The orders agent

The first real agent in Ghost Shift. It's a Claude run, started on a timer, that signs in as the Satin Sparrow agent account and captures the money for authorized orders that have shipped. Each time it does work, it starts an agent run and ends it with a summary, so you can follow everything it did in the activity log.

## 1. The big picture

```
claude -p (on a timer) ──► ghost-shift-agent MCP server ──► /api/v1 (bearer token) ──► database
  reads docs/agents/        signs in as SEED_AGENT_EMAIL      same API as any user       RLS + order_action()
  orders-agent.md           with SEED_PASSWORD                                            decide what's allowed
```

- **The instructions** are plain text in [`docs/agents/orders-agent.md`](../agents/orders-agent.md). To change what the agent does, for example "skip orders over 500 EUR", edit its **House rules** section. No code change needed.
- **The tools** come from `scripts/mcp-agent.ts` (`pnpm mcp:agent`):
  - `list_orders` and `get_order`
  - `start_agent_run` and `end_agent_run`
  - `capture_order`, which always needs a run id. There is no cancel or refund tool. The account's `agent_second_line` role would allow both, but this job never needs them, so an unattended run can't do them by mistake.
- **The permissions** are the agent account's roles (`agent_first_line` and `agent_second_line` at Satin Sparrow). The database checks them on every call, exactly as for a person (ADR 0007, ADR 0015). The agent can't see Northstar Threads' orders, even if its instructions told it to.

## 2. Why only these orders

The agent captures an order only when all of these hold:

- `status` is `authorized`. The money is held and nothing was taken yet.
- `shippedAt` is set. The merchant handed the parcel to the carrier, which is when a merchant may take the money.
- No house rule excludes it.

It leaves `part_captured` orders alone. A person chose to take only part of the money, so the rest is their decision. It can't cancel or refund: the server offers no tool for it. If an authorization expires between the list and the capture, the database refuses with `409`. The agent counts that order as skipped, not failed.

Why an agent and not a pg_cron job, as ADR 0016 does for expiry: the owner wants conditions written in words, and the work should show up as an accountable agent's runs. Capturing takes customers' money, which is a judgment call. The cost is tokens on each run.

## 3. How the agent signs in (no API tokens needed)

The **MCP server** signs in, not Claude:

1. The server starts with `node --env-file-if-exists=.dev.vars scripts/mcp-agent.ts`. It reads `SEED_AGENT_EMAIL` and `SEED_PASSWORD` from `.dev.vars` and checks them with Zod.
2. On its first tool call, it signs in to local Supabase (`signInWithPassword`) and keeps the access token in memory.
3. It sends the token as `Authorization: Bearer …` on every API call. When the token runs out (after about an hour) and the API answers `401`, it signs in again by itself.

Claude never sees the password. It's not in the instructions, the tool arguments or the transcript. It only works where `.dev.vars` and local Supabase exist, which is your machine. For the live app, the same server runs on your machine in hosted mode, with its own account and password (section 7).

## 4. Run it locally, step by step

1. Start the database: `pnpm db:start`.
2. Load the demo data: `pnpm db:reset`. PA-2004 and PA-2005 are shipped and authorized until 2026-11-15. PA-2001 is too, until its card authorization runs out on 2026-10-23.
3. Create the accounts: `pnpm db:seed-users`. `.dev.vars` needs `SEED_PASSWORD` and `SEED_AGENT_EMAIL`, and the agent account comes from `scripts/seed-users.local.ts` in the main checkout (see [section 7 of the auth guide](auth-and-policies.md#7-accounts-for-local-testing)). Without that file the agent account is not created, and the agent can't sign in.
4. Start the app: `pnpm dev`, and keep it running.
5. Run the agent once by hand, from the repo root:

```bash
claude -p "Follow docs/agents/orders-agent.md" --allowedTools "mcp__ghost-shift-agent"
```

The answer is the run's summary, for example `Captured 3 orders, skipped 0, failed 0.` (2 from 2026-10-23, once PA-2001 has expired). Run it again and it answers `Nothing to capture.`, because those orders are now `captured`.

To check that the server starts at all, run `pnpm mcp:agent`. It waits for an MCP client on stdin; stop it with Ctrl+C.

## 5. See what it did

- **Activity log** (`/audit-log`): each capture by the agent, with the run's purpose in the Run column.
- **An order's timeline** (`/orders`, open PA-2004): the capture, by the agent, with the reason `Shipped with UPS`.
- **The run itself**: `select * from agent_runs order by started_at desc;` in Supabase Studio shows the purpose, the start and end times, and the summary.

## 6. Owner steps: schedule it

Recommended: a **scheduled task in the Claude desktop app**, on your machine. It runs the same prompt as step 5 on a timer, in this repo's folder, so it picks up `.mcp.json` and `.dev.vars`.

1. In a normal Claude Code session in the repo folder, approve the `ghost-shift-agent` MCP server once when Claude Code asks.
2. Allow its tools without a prompt, so the task can run unattended. Add `"mcp__ghost-shift-agent"` to `permissions.allow` in `.claude/settings.local.json`. That file isn't committed. Allow only this server, not shell commands.
3. In the Claude desktop app, create a scheduled task:
   - folder: the repo root
   - prompt: `Follow docs/agents/orders-agent.md`
   - schedule: every hour (or every 30 minutes)
4. Use "Run now" once and check the activity log.
5. While it's scheduled, keep `pnpm db:start` and `pnpm dev` running, and the computer awake. A missed run does no harm: the next one finds the same orders.

The alternative is a plain cron job (or Windows Task Scheduler) running the `claude -p` command from step 5. It works the same way, but you don't get the app's run history.

## 7. Run it against the live app

The same agent can capture orders in the live app at <https://ghost-shift.denis-shvets.workers.dev>. It still runs on your machine ([ADR 0017](../adr/0017-local-agents-hosted-app.md)):

- `pnpm mcp:agent:hosted` starts the server in hosted mode, as the `ghost-shift-agent-hosted` MCP server. It reads `.hosted.vars` (git-ignored), never `.dev.vars`. Without `.hosted.vars` the server still starts, so sessions don't list it as failed, and every tool call answers with what is missing.
- It signs in with `HOSTED_AGENT_EMAIL` and `HOSTED_AGENT_PASSWORD`, a separate account in the hosted project, never `SEED_PASSWORD`.
- It only talks to `https://ghost-shift.denis-shvets.workers.dev` and `https://<project-ref>.supabase.co`. The local server (`ghost-shift-agent`) still refuses anything but this machine, so a local run can't capture live orders by accident.

Owner steps, once: follow the [Night Shift guide, section 7b](night-shift.md#b-owner-steps-once). It covers pushing the migrations, creating the hosted agent account, giving it `agent_first_line` and `agent_second_line` at Satin Sparrow (with ready-to-paste SQL), filling in `.hosted.vars` and approving `ghost-shift-agent-hosted`. Then try one run by hand:

```bash
claude -p "Follow docs/agents/orders-agent.md" --allowedTools "mcp__ghost-shift-agent-hosted"
```

and put it on a timer as in section 6, with `mcp__ghost-shift-agent-hosted` in the allow list and that prompt.

Its runs and captures show up in the live app's activity log, as for the local agent (section 5).

## 8. Limits and follow-ups

- The API allows 60 requests a minute per user. The agent waits and retries once on `429`. A run with more than ~55 orders takes longer, but it doesn't fail.
- New work comes by itself: Night Shift's customer orders, placed from its queue, ship 4 to 48 hours after they're created, by a database job ([orders database, section 6e](orders-database.md#6e-the-ship-job-orders-ship-some-hours-later-2026-10-21)). Only Satin Sparrow's orders are this agent's. For work right away, create an order with **Already shipped** ticked, or send `shipped: true` to `POST /api/v1/orders`.
- It runs only while your computer is on: locally or against the live app, never in the cloud ([ADR 0017](../adr/0017-local-agents-hosted-app.md)).

## 9. Tests

- `scripts/mcp-agent.test.ts`:
  - the tools send the right requests
  - there is no tool to create, cancel or refund orders
  - the server loads in plain Node, the way `pnpm mcp:agent` starts it
  - actions need a run id
  - ids that aren't uuids never reach a URL
  - the server needs `SEED_AGENT_EMAIL` and local URLs; in hosted mode it needs `HOSTED_AGENT_EMAIL` and `HOSTED_AGENT_PASSWORD` and never uses `SEED_PASSWORD`
- `scripts/mcp-developer.test.ts`: the hosted allowlist (exact hosts, https only)
- `src/features/orders/server/orders-repository.test.ts`: the `shipped` filter, and that the agent only gets its own store's shipped authorized orders. That test creates its own orders, so it passes whether or not the seed's demo orders were captured or expired.
