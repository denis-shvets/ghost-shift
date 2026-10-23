# Order disputes

A dispute is a customer's claim against an order. This first version only records the claim. It does not move money and does not change the order's status.

## The table

`order_disputes` (`src/features/disputes/db/schema.ts`), one row per dispute:

- `order_id`: the order it belongs to. Deleting the order deletes its disputes.
- `reason`: text, 1 to 500 characters after trimming. A check constraint enforces it.
- `status`: `open` or `closed`. New disputes start `open`.
- `opened_at`, `closed_at`: `closed_at` is set exactly when the status is `closed`. Another check constraint enforces that.

## Who may do what

Row-level security is in `supabase/migrations/20261023203832_orders_disputes.sql`:

- Reading and opening a dispute need `disputes.manage` at the order's store. The policies check it through the parent order, the same way order events do.
- There is no update or delete grant, so a dispute can't be changed or removed through the API. Closing disputes is not built yet.
- The grants are in the same migration. Local Supabase grants everything on new tables and hosted grants nothing, so the migration revokes first and then grants `select, insert` to `authenticated` only.

## The developer tool

`/developer/disputes` is for platform developers. It lists open disputes and opens a new one for any order they can see. The developer server functions in `src/features/disputes/server/functions.ts` check for the developer role first. The disputes list (`/disputes`, `fetchDisputesFn`) needs only a signed-in user, because row-level security limits it to the disputes of the user's stores. The database check still decides who may open a dispute.
