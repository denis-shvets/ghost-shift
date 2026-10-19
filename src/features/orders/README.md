# Orders

Orders placed through Phantom Checkout, with their lines, payment and shipping.

## What it does now

- Lists orders, newest first (`/orders`).
- Shows one order with its store, lines and amounts (`/orders/<uuid>`). An id that isn't a uuid shows "Order not found".
- Capture, refund and cancel are visible but disabled.
- Platform developers can create test orders at `/developer/create-order`. Products are generated from a seed, and the total uses the store's currency. Anyone else is sent back to `/orders`.

## Data

- Tables `orders` and `order_lines`, defined in [db/schema.ts](db/schema.ts).
- Ids are uuids. `reference` (`MG-1003`) is the number people use.
- Each order belongs to a store, and its currency must be the store's currency. The database enforces both.
- Amounts are integers in minor units (öre, cents).
- Lines are ordered by `position`, starting at 1.
- Each line has a `type` (physical, digital, shipping_fee, discount, surcharge), an optional `sku`, a `unit_price` including tax and a `tax_rate` in basis points (2500 = 25 %).
- `total_amount` and `total_tax_amount` on lines are generated columns: the database calculates them and nobody can write them.
- `shipping_carrier` and `shipping_tracking` are temporary, until a shipments table exists.
- Row-level security is on. For now anyone can read, because the demo has no sign-in yet. Writes will get their own policies.
- Demo rows live in [supabase/seed.sql](../../../supabase/seed.sql).

## Files

| File                               | Purpose                                     |
| ---------------------------------- | ------------------------------------------- |
| `db/schema.ts`                     | Tables, enums and RLS policies              |
| `server/orders-repository.ts`      | Queries, run through `withUser` (signed-in) |
| `server/orders-repository.test.ts` | Tests against the local database            |
| `server/functions.ts`              | Server functions the routes call            |
| `model/money.ts`                   | Formatting minor-unit amounts               |
| `model/order-total.ts`             | Line and order totals for the create page   |
| `model/order-id-input.ts`          | Zod schema for the order id a caller sends  |
| `model/tax-rate.ts`                | Formatting basis points as a percentage     |
