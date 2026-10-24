# 0019. Settlements are built in Postgres, and a cron job creates the payouts

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Captured money has to be paid out to a merchant's bank account on a schedule: weekly or monthly, per store. Refunds after a payout reduce the next one. A merchant must see what was paid and when, and a developer must approve each payout. Settlements are a money-moving record, so each captured or refunded event must be paid out exactly once.

## Decision

Settlements are rows in Postgres: one schedule per store, one settlement per store and period, and one item per captured or refunded order event. `public.run_settlements(schedule_ids)` builds them. A pg_cron job closes every period that has ended, every 15 minutes, so payouts appear without anyone starting them. A developer then approves each pending payout, which moves it to paid. Running it again creates nothing new for a period already closed.

- A period is `[period_start, period_end)` in UTC. Its end moves by one week or one month. The sweep never closes a period before its end.
- Each order event belongs to the one settlement whose period contains its `occurred_at`, or to an earlier one still open. A unique index on the event id keeps it to one.
- A refund is a negative item. A refund on an order that is already paid out is netted into the next settlement.
- A period with a negative net records no settlement. Its events stay unsettled and roll into the next period, so the debt is carried forward and the dashboard shows the store in debt.
- Schedules are written only by `public.save_settlement_schedule`, which checks the permission, the store and the payout account. Row-level security can't check a foreign key, so clients can't write the table directly.
- Approval is manual for now: a developer marks each payout paid. Paying the money out is not connected yet.

Rejected:

- **Totals only, stored on the order:** an order can't be split across periods, and the timeline gives the exact time of each capture.
- **A worker that sends payouts:** no payout service is connected yet. Payout accounts are simulated and only their last four digits are stored.

## Consequences

- The first settlement of a new schedule includes captures made before the schedule was saved, so no captured money is left out.
- A period with nothing captured or refunded records no settlement, so the approval queue only holds payouts that have money in them.
- `failed` status is not built yet.

## Links

- [0016](0016-scheduled-jobs-pg-cron.md) for scheduled jobs.
- [docs/guides/settlements.md](../guides/settlements.md) for how to run and read settlements.
