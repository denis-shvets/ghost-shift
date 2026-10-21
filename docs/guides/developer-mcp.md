# Local developer MCP server

A small local tool that lets a Claude agent create test orders and capture, cancel or refund them. It runs on your machine, talks to your local app, and signs in as the seeded `platform_developer` account. It never touches the hosted project.

The orders agent has its own server, `ghost-shift-agent` (`pnpm mcp:agent`). It signs in as the agent account: see [the orders agent guide](orders-agent.md).

## What it offers

| Tool                   | What it does                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_stores`          | Lists the stores you can see, with their currency. Calls `GET /api/v1/stores`.                                                                                                                                                 |
| `list_sample_products` | Lists a store's 50 products (25 physical, then 25 digital) with prices in that store's currency. Takes `storeId` (from `list_stores`) and optional `count` (1 to 20) for the first N. No network. Unknown stores get an error. |
| `create_order`         | Creates a test order. Calls `POST /api/v1/orders` and returns `{ id, reference }`. `shipped: true` creates it as already handed to the carrier, so the orders agent can capture it.                                            |
| `capture_order`        | Captures `amount` (minor units) of an order, with a `reason`. Partial captures are allowed.                                                                                                                                    |
| `refund_order`         | Refunds `amount` (minor units) of what was captured, with a `reason`.                                                                                                                                                          |
| `cancel_order`         | Cancels what is left of the authorization, with a `reason`.                                                                                                                                                                    |

The last three call `POST /api/v1/order-actions` with `{ action, orderId, amount?, reason }` and return the order's new `status`, `capturedAmount`, `refundedAmount` and `uncapturedAmount`. The database checks the permission and the rules, and writes a timeline event with the reason.

## Start it

Run these once, in order, from the repo root:

```bash
pnpm db:start
```

```bash
pnpm db:reset
```

```bash
pnpm db:seed-users
```

```bash
pnpm dev
```

`pnpm dev` serves the app on `http://localhost:3000`. Keep it running.

Claude Code reads `.mcp.json` at the repo root and starts the server for you (`pnpm mcp:developer`). You can also run it by hand to check it starts; it waits for an MCP client on stdin:

```bash
pnpm mcp:developer
```

## Settings

Set these in `.dev.vars` (copy `.dev.vars.example`). The server reads them at startup.

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`: your local Supabase.
- `SEED_PASSWORD`: the password `pnpm db:seed-users` gave the seeded accounts.

Optional environment variables:

- `APP_URL`: the app's address. Default `http://localhost:3000`.
- `SEED_DEVELOPER_EMAIL`: the developer account. Default `developer@ghostshift.test`.

The server refuses to start if `SUPABASE_URL` or `APP_URL` is not on `127.0.0.1` or `localhost`. Passwords and tokens are never printed.

## Example

Ask the agent: "List the stores, then create an order with two physical products in the first store." It will call `list_stores`, use `list_sample_products` with that store's `id` to pick items, then `create_order`. The new order shows up under `/orders` in the app. Then: "Capture half of it because the first parcel shipped." The agent calls `capture_order`, and the order's timeline shows the capture with that reason.

## When something fails

- `HTTP 401` or `Sign-in to local Supabase failed`: check `SEED_PASSWORD`, and that `pnpm db:seed-users` ran.
- `HTTP 403`: the account is not a `platform_developer`.
- `HTTP 400` with `issues`: the order does not match the input rules. The issues say which field. A capture, refund or cancel without a `reason` fails here.
- `HTTP 404` on an order action: the order doesn't exist, or the account can't see it.
- `HTTP 409` on an order action: the order's status or amounts don't allow it, for example capturing a canceled order or refunding more than was captured. The message says which.
- Network errors: check `pnpm dev` is running on `APP_URL`.
