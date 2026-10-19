# Local developer MCP server

A small local tool that lets a Claude agent create test orders. It runs on your machine, talks to your local app, and signs in as the seeded `platform_developer` account. It never touches the hosted project.

## What it offers

| Tool                   | What it does                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `list_stores`          | Lists the stores you can create orders in, with their currency. Calls `GET /api/developer/stores`. |
| `list_sample_products` | Lists sample products from a seed (`seed`, default 1; `count` 1 to 50, default 10). No network.    |
| `create_order`         | Creates a test order. Calls `POST /api/developer/orders` and returns `{ id, reference }`.          |

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

Ask the agent: "List the stores, then create an order with two physical products in the first store." It will call `list_stores`, use `list_sample_products` to pick items, then `create_order`. The new order shows up under `/orders` in the app.

## When something fails

- `HTTP 401` or `Sign-in to local Supabase failed`: check `SEED_PASSWORD`, and that `pnpm db:seed-users` ran.
- `HTTP 403`: the account is not a `platform_developer`.
- `HTTP 400` with `issues`: the order does not match the input rules. The issues say which field.
- Network errors: check `pnpm dev` is running on `APP_URL`.
