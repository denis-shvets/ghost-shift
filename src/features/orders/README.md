# Orders

Orders placed through Phantom Checkout, with their lines, payment and shipping.

## What it does now

- Lists orders, newest first, with status, payment method and amounts (`/orders`).
- Shows one order with its customer, billing and shipping addresses, amounts, lines and a timeline of events (`/orders/<uuid>`). An id that isn't a uuid shows "Order not found".
- Authorizations expire on their own: every 15 minutes the database moves `authorized` orders past `expires_at` to `expired` and adds a timeline event with the reason. Part-captured orders keep their status, but the order page labels the uncaptured rest Released once it has expired. How it works: [the orders database guide, section 5](../../../docs/guides/orders-database.md#5-the-expiry-job-2026-10-20).
- Capture, refund and cancel on the order page, each with a required reason. Captures and refunds can be partial. The page shows only the forms the order's status allows; the database checks the permission (`orders.capture`, `orders.refund`, `orders.cancel`) and the rules, and writes a timeline event with the person's email and the reason. How it works: [the orders database guide, section 6](../../../docs/guides/orders-database.md#6-capture-cancel-and-refund-2026-10-20).
- The same actions are on the orders API (`POST /api/v1/order-actions`) and as MCP and WebMCP tools: `capture_order`, `refund_order`, `cancel_order`.
- On the API, each action can carry an `agentRunId` (the MCP and WebMCP tools leave it out: they can't start a run). `order_action()` checks the run is the caller's own and still going, and writes it on the event (`order_events.agent_run_id`). See [agent runs](../agent-runs/README.md).
- Platform developers can create test orders at `/developer/create-order`. Products come from the chosen store's own catalog of 50 products (25 physical, then 25 digital), priced in the store's currency. Anyone else is sent back to `/orders`.

## WebMCP (experimental)

On `/developer/create-order`, a page script registers two tools with `document.modelContext` (or `navigator.modelContext`): `list_stores` and `create_order`. They call the same server functions as the page, so the developer role and row-level security still apply. On an order page (`/orders/<uuid>`), it registers `capture_order`, `refund_order` and `cancel_order`, which call the same server function as the page's forms. The tools are removed when you leave the page. Code: [ui/web-mcp-tools.ts](ui/web-mcp-tools.ts).

- The API is experimental. It needs a Chrome origin trial, not a flag (see [the Chrome docs](https://developer.chrome.google.cn/docs/ai/webmcp/imperative-api?hl=en)). Without it, the script does nothing.
- To check: sign in as a platform developer, open the page, and in DevTools run `document.modelContext` in the console (or look at the registered tools in the WebMCP panel, if your build has one).

## Data

- Tables `orders` and `order_lines`, defined in [db/schema.ts](db/schema.ts).
- Ids are uuids. `reference` (`MG-1003`) is the number people use.
- Each order belongs to a store, and its currency must be the store's currency. The database enforces both.
- Amounts are integers in minor units (öre, cents).
- Lines are ordered by `position`, starting at 1.
- Each line has a `type` (physical, digital, shipping_fee, discount, surcharge), an optional `sku`, a `unit_price` including tax and a `tax_rate` in basis points (2500 = 25 %).
- `total_amount` and `total_tax_amount` on lines are generated columns: the database calculates them and nobody can write them.
- `shipping_carrier` and `shipping_tracking` are temporary, until a shipments table exists.
- Row-level security is on. Reading needs `orders.read` for the order's store. Nobody may update `orders` directly: capture, cancel and refund go through the database function `public.order_action()`, and a trigger allows only valid status changes.
- Demo rows live in [supabase/seed.sql](../../../supabase/seed.sql).

## Files

| File                               | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `db/schema.ts`                     | Tables, enums and RLS policies                           |
| `server/orders-repository.ts`      | Queries, run through `withUser` (signed-in)              |
| `server/orders-repository.test.ts` | Tests against the local database                         |
| `server/functions.ts`              | Server functions the routes call                         |
| `model/money.ts`                   | Formatting minor-unit amounts                            |
| `model/order-total.ts`             | Line and order totals for the create page                |
| `ui/order-list-page.tsx`           | The `/orders` table and pagination links                 |
| `ui/order-detail-page.tsx`         | One order: customer, addresses, amounts, lines, timeline |
| `ui/create-order-page.tsx`         | The create-order page for developers                     |
| `model/order-id-input.ts`          | Zod schema for the order id a caller sends               |
| `model/tax-rate.ts`                | Formatting basis points as a percentage                  |
| `model/order-event-details.ts`     | One readable line per timeline event                     |
| `model/payment-methods.ts`         | Payment methods and when each authorization expires      |
| `model/order-action-input.ts`      | Zod schema for capture, cancel and refund, and the tools |
| `model/order-actions.ts`           | Which action forms the order page shows                  |
