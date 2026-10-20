# The orders API for agents

Agents (and scripts) can read and change orders over HTTP. They send a bearer token, the same kind a signed-in browser holds. This guide covers the endpoints, a `curl` example, how to get a token, and why the app does not check roles itself.

## 1. The big picture

The orders API lives under `/api/v1/`. Any signed-in user, human or agent, can call it.

The app does not check roles. The database does: row-level security decides which orders a user can read, and `public.order_action()` decides which money actions they may take.

The routes share one helper, `handleApiRequest` in `src/features/orders/server/api-request.ts`. It reads the token, opens one database connection as the user, and turns failures into JSON.

## 2. Words you'll meet

- **Bearer token**: a long text string a script sends in the `Authorization` header to prove who it is. It is the sign-in session's `access_token`.
- **Row-level security (RLS)**: database rules that hide rows a user may not see. A hidden order looks the same as a missing one.
- **`order_action()`**: the database function that captures, cancels or refunds an order and writes the timeline event in one step.

## 3. The endpoints

| Method | Path                     | What it does                                                                                                                                                                                                                                      | Success | Refusals                                                                                                                                              |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/orders`         | Lists orders you can see, newest first. Query: `limit` (1 to 100, default 50), `cursor`, `direction` (`next` or `prev`), `q`, `status`, `storeId`, `paymentMethod`, `shipped` (see below). Each order includes `shippingCarrier` and `shippedAt`. | 200     | 400 bad query, 401 no token                                                                                                                           |
| GET    | `/api/v1/orders/:id`     | Reads one order with its lines, addresses and timeline.                                                                                                                                                                                           | 200     | 400 id longer than 100 characters, 401 no token, 404 not found, not a uuid, or not visible to you                                                     |
| POST   | `/api/v1/orders`         | Creates an order. Body: store, customer, addresses, payment method, carrier and lines (see `createOrderInput`).                                                                                                                                   | 201     | 400 bad body, 401 no token, 403 your role may not create orders in this store, 404 store not found or not visible to you                              |
| POST   | `/api/v1/order-actions`  | Captures, cancels or refunds one order. Body: `action`, `orderId`, `reason`, `amount` for capture and refund, and optionally `agentRunId`.                                                                                                        | 200     | 400 bad body or invalid amount, 401 no token, 403 your role may not do this, 404 not visible to you, 409 the order's status or amounts don't allow it |
| POST   | `/api/v1/agent-runs`     | Starts an agent run for you. Body: `purpose` (1 to 200 characters). Answers `{ id, startedAt }`.                                                                                                                                                  | 201     | 400 bad body, 401 no token                                                                                                                            |
| PATCH  | `/api/v1/agent-runs/:id` | Ends one of your runs. Body: `{}` or `{ "summary": "..." }` (up to 2,000 characters).                                                                                                                                                             | 200     | 400 bad id or body, 401 no token, 404 not your run or not found, 409 already ended                                                                    |
| GET    | `/api/v1/stores`         | Lists the stores you can see, with their currency.                                                                                                                                                                                                | 200     | 401 no token                                                                                                                                          |

Search and filters on the list, all optional:

- `q`: an exact order reference (for example `MG-1003`), or an exact customer email. Both ignore case. A blank or space-only value counts as not sent.
- `status`: one of `authorized`, `captured`, `part_captured`, `expired`, `canceled`, `refunded`.
- `storeId`: a store id (uuid). You only get orders from stores you can see.
- `paymentMethod`: one of the payment method codes, for example `card` or `paypal`.
- `shipped`: `true` for orders handed to the carrier (`shippedAt` is set), `false` for orders not shipped yet. The orders agent asks for `status=authorized&shipped=true` ([orders agent guide](orders-agent.md)).

Filters combine with "and", and they keep working with `cursor` and `direction`. An unknown value is a 400.

An agent working through a job starts a run first and sends its id as `agentRunId` with each action, so the audit log can show which run made each change. A run that isn't yours or has ended is refused with `400`. How runs work: [the agent runs guide](agent-runs.md).

Amounts are in minor units (cents). `amount: 500` means 5.00 in the order's currency. Every money change needs a `reason`.

The last page comes with `nextCursor: null`: stop there. An account that can see no orders gets one empty page. Creation is decided by the database, like capture and refund.

## 4. A `curl` example

Set the token and the app's address first:

```bash
export API_TOKEN="<paste the access token here>"
export APP_URL="http://localhost:3000"
```

List the newest five orders:

```bash
curl -s "$APP_URL/api/v1/orders?limit=5" \
  -H "Authorization: Bearer $API_TOKEN"
```

Capture 5.00 on one order:

```bash
curl -s -X POST "$APP_URL/api/v1/order-actions" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"capture","orderId":"<order id from the list>","amount":500,"reason":"Shipped"}'
```

The same capture inside an agent run. Start the run; the reply has its `id`:

```bash
curl -s -X POST "$APP_URL/api/v1/agent-runs" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"purpose":"Capture shipped orders"}'
```

Act with the run's id:

```bash
curl -s -X POST "$APP_URL/api/v1/order-actions" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"capture","orderId":"<order id>","amount":500,"reason":"Shipped","agentRunId":"<run id>"}'
```

End the run:

```bash
curl -s -X PATCH "$APP_URL/api/v1/agent-runs/<run id>" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"summary":"Captured 1 order"}'
```

## 5. How to get a token

The token comes from signing in to Supabase with an email and password; the `access_token` in the reply is the bearer token. The token carries that person's rights: sign in as the seeded agent (`SEED_AGENT_EMAIL` in `.dev.vars`) to act as an agent, or as the seeded developer (`SEED_DEVELOPER_EMAIL`, which `scripts/mcp-developer.ts` uses) to create test orders. Both use `SEED_PASSWORD`. The token expires, so sign in again when calls start answering 401.

Sign-in is yours to run. Keep the password and token out of the chat and out of files you commit.

## 6. Why there is no role check in the app

A role check written in the app can drift from the database rules, and then one of them is wrong. So the app passes the user's token to the database, and the database answers. The rules and the function are described in [Writes through a function](auth-and-policies.md#writes-through-a-function-capture-cancel-and-refund).

So a first-line agent who calls `POST /api/v1/order-actions` gets `403`, because `order_action()` refuses that role. The route itself doesn't know about roles at all.

Creating orders is checked in two places. Before inserting, `createOrder` asks the database `has_permission('orders.create', store)`, the same function the insert policy uses. A "no" answers `403`. The policy still guards the insert on its own. The app does not map Postgres `42501` itself, because that code also means a missing `grant`, which is our bug and must show as a logged 500, not a 403. The `/developer/create-order` page still checks the `platform_developer` role, but only to decide who sees that developer page. The database decides who may create.

## 7. Limits

Each signed-in user may make 60 requests a minute to `/api/v1`. Above that, the API answers `429` with `Retry-After: 60`. The counter is kept by Cloudflare's Rate Limiting binding (`API_LIMITER` in `wrangler.jsonc`), so it is approximate across locations. Use it to stop loops, not as an exact quota.

## 8. Tests

- Route tests sit next to each file in `src/routes/api/v1/`. They check 401, 400, 403, 404, 409 and 201, and that a user with no global roles isn't refused by the app.
- The database test in `src/features/orders/server/orders-repository.test.ts` checks that the second-line agent can capture and the first-line agent gets `403`. It also checks each refused user gets the exact error: 403 for a store they can see, 404 for one they can't.

Run them with `pnpm db:start`, `pnpm db:reset` and `pnpm test`.
