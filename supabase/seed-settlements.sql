-- Settlements for the developer and merchant pages: two paid, two pending, and two periods to run.
-- Monthly periods start on 1 July 2026, so the seeded captures on Moss & Mirror (July to September) and
-- Velour Vault (August and September) fall in them. The real sweep closes the periods, so the figures match
-- what a run would produce.
-- Moss & Mirror: July and August are closed and paid. September has ended and is left to run.
-- Velour Vault: August and September are closed and pending payout.

insert into settlement_schedules (store_id, frequency, payout_account_id, period_start, period_end) values
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b04', 'monthly', 'c3a5e9f4-6d7f-4e0a-8a32-4b8d9e0f1c04',
    '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03', 'monthly', 'c3a5e9f4-6d7f-4e0a-8a32-4b8d9e0f1c04',
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z');

-- Captures inside each period, so the payouts have amounts. They are added as order events, the same as
-- a capture on the timeline; each one points at one of the store's seeded orders.
with targets as (
  select o.id, o.store_id, row_number() over (partition by o.store_id order by o.created_at) as rn
  from orders o
  where o.store_id in ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03', 'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b04')
),
plan (store_id, rn, occurred_at, amount) as (values
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b04'::uuid, 1, '2026-07-12T12:00:00Z'::timestamptz, 150000::bigint),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b04'::uuid, 2, '2026-08-12T12:00:00Z'::timestamptz, 98000::bigint),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b04'::uuid, 3, '2026-09-12T12:00:00Z'::timestamptz, 120000::bigint),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b04'::uuid, 4, '2026-09-20T12:00:00Z'::timestamptz, 80000::bigint),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03'::uuid, 1, '2026-08-10T12:00:00Z'::timestamptz, 150000::bigint),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03'::uuid, 2, '2026-09-10T12:00:00Z'::timestamptz, 98000::bigint)
)
insert into order_events (order_id, occurred_at, action, actor_name, metadata)
select t.id, p.occurred_at, 'captured', 'Seed', jsonb_build_object('amount', p.amount)
from plan p
join targets t on t.store_id = p.store_id and t.rn = p.rn;

-- Seeding runs without a user. Each run closes one period per schedule that has ended. Moss & Mirror needs
-- two runs (July, August); Velour Vault needs two (August, September).
select public.run_settlements((
  select array_agg(id) from settlement_schedules where store_id = 'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b04'
));
select public.run_settlements((
  select array_agg(id) from settlement_schedules where store_id = 'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b04'
));
select public.run_settlements((
  select array_agg(id) from settlement_schedules where store_id = 'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03'
));
select public.run_settlements((
  select array_agg(id) from settlement_schedules where store_id = 'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03'
));

-- July and August for Moss & Mirror are paid.
update settlements set status = 'paid'
where store_id = 'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b04' and period_end <= '2026-09-01T00:00:00Z';
