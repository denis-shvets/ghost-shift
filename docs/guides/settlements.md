# Settlements

Settlements pay captured money out to a store's payout account, once per period. Read [ADR 0019](../adr/0019-settlements-in-postgres.md) for why they are built this way.

## Set up a schedule (merchant)

1. Add a payout account under the store's settings. Its currency must match the store.
2. Open **Settlements**, choose the store, a weekly or monthly frequency, and the payout account. Save.

Only merchant admins can set a schedule. Other people see the store's payouts, but not the form.

Periods end on fixed days: weekly periods end on Monday 00:00 UTC, monthly periods end on the 1st at 00:00 UTC. The first period runs from when you save to the next such day, and it also pays out anything captured before you saved. Saving a new schedule for a store that already has one keeps the open period's start, so money captured in it carries over, and only the end moves to the next day for the new frequency. The merchant is asked to confirm first. Payouts are never made early: a period is only paid once it has ended.

## Pay out (developer)

Payouts are created automatically. A job runs every 15 minutes and creates a pending payout for each period that has ended, so no one has to start it. Open **Developer tools → Approve payouts** to see the pending payouts. Approving one moves it from pending to paid. Only platform developers can approve, and a paid payout can't be approved again.

## Read a settlement

A period marked "Partial period" is neither exactly 7 days nor one calendar month. It is either the first period of a new schedule, or a period whose schedule was changed while it was open.

- **Captured** is the sum of captures in the period. **Refunded** is the sum of refunds. **Net** is captured minus refunded.
- A period with nothing captured or refunded creates no payout.
- A refund on an order that was already paid out is counted in the next period. If a period's refunds are larger than its captures, no payout is created for it. Its captures and refunds roll into the next period, and the dashboard shows the store as in debt until they net out.

## Tables

- `settlement_schedules`: one row per store with its frequency, payout account and current period. Written only by `public.save_settlement_schedule`.
- `settlements`: one row per store and period, with the totals.
- `settlement_items`: one row per captured or refunded order event. A unique index on the event stops it being paid twice.

The sweep is `public.run_settlements(p_schedule_ids uuid[])`. It closes periods as of `now()`, and it is run every 15 minutes by `public.close_due_periods()`. Both are in `supabase/migrations/20261024024859_settlements.sql`. To check them by hand against the local database, run `pnpm db:reset`, then `pnpm vitest run src/features/settlements`.
