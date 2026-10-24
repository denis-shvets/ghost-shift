CREATE TYPE "public"."settlement_frequency" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TABLE "settlement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"order_event_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "settlement_items_order_event_unique" UNIQUE("order_event_id"),
	CONSTRAINT "settlement_items_amount_not_zero_check" CHECK ("settlement_items"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "settlement_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settlement_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"frequency" "settlement_frequency" NOT NULL,
	"payout_account_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	CONSTRAINT "settlement_schedules_store_unique" UNIQUE("store_id"),
	CONSTRAINT "settlement_schedules_period_check" CHECK ("settlement_schedules"."period_end" > "settlement_schedules"."period_start")
);
--> statement-breakpoint
ALTER TABLE "settlement_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"payout_account_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" "settlement_status" DEFAULT 'pending' NOT NULL,
	"gross_amount" bigint NOT NULL,
	"refunded_amount" bigint NOT NULL,
	"net_amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "settlements_store_period_end_unique" UNIQUE("store_id","period_end"),
	CONSTRAINT "settlements_currency_format_check" CHECK ("settlements"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "settlements_period_check" CHECK ("settlements"."period_end" > "settlements"."period_start"),
	CONSTRAINT "settlements_gross_amount_check" CHECK ("settlements"."gross_amount" >= 0),
	CONSTRAINT "settlements_refunded_amount_check" CHECK ("settlements"."refunded_amount" >= 0),
	CONSTRAINT "settlements_net_amount_check" CHECK ("settlements"."net_amount" = "settlements"."gross_amount" - "settlements"."refunded_amount")
);
--> statement-breakpoint
ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlement_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_order_event_fk" FOREIGN KEY ("order_event_id") REFERENCES "public"."order_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_schedules" ADD CONSTRAINT "settlement_schedules_store_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_schedules" ADD CONSTRAINT "settlement_schedules_payout_account_fk" FOREIGN KEY ("payout_account_id") REFERENCES "public"."payout_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_store_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payout_account_fk" FOREIGN KEY ("payout_account_id") REFERENCES "public"."payout_accounts"("id") ON DELETE no action ON UPDATE no action;

-- 1. Permission, given to the roles that already manage stores and payouts.
insert into public.permissions (name, description) values
  ('settlements.manage', 'View and change settlement schedules and payouts');

insert into public.role_permissions (role, permission) values
  ('platform_developer', 'settlements.manage'),
  ('merchant_admin', 'settlements.manage');

-- 2. Row access. Clients only read here. Schedules change through save_settlement_schedule (section 3).
create policy "members can read settlement schedules of their stores" on public.settlement_schedules
  for select to authenticated
  using (public.has_permission('settlements.manage', store_id));

create policy "members can read settlements of their stores" on public.settlements
  for select to authenticated
  using (public.has_permission('settlements.manage', store_id));

-- An item is visible to anyone who can read its order event, so a settled event never looks unsettled.
create policy "members can read settlement items of events they can read" on public.settlement_items
  for select to authenticated
  using (exists (select 1 from public.order_events e where e.id = order_event_id));

-- Settlements, items and schedules are written only by the functions below, never by a client.
revoke all on table public.settlement_schedules, public.settlements, public.settlement_items
  from anon, authenticated;

grant select on table public.settlement_schedules, public.settlements, public.settlement_items
  to authenticated;

-- 3. Saving a schedule. The only way to create or change one. Row-level security can't check a foreign key,
-- so this checks that the payout account belongs to the store's organization and currency.
-- A store that already has a schedule keeps its open period's start, so money captured in it carries over.
create or replace function public.save_settlement_schedule(
  p_store_id uuid, p_frequency public.settlement_frequency, p_payout_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_currency char(3);
  v_period_end timestamptz;
begin
  if not public.has_permission('settlements.manage', p_store_id) then
    raise exception 'You cannot change settlements for this store' using errcode = '42501';
  end if;

  select st.organization_id, st.currency into v_organization_id, v_currency
  from public.stores st
  where st.id = p_store_id;
  if not found then
    raise exception 'Store not found' using errcode = 'invalid_parameter_value';
  end if;

  if not exists (
    select 1 from public.payout_accounts pa
    where pa.id = p_payout_account_id
      and pa.organization_id = v_organization_id
      and pa.currency = v_currency
  ) then
    raise exception 'Pick a payout account of this store''s currency' using errcode = 'invalid_parameter_value';
  end if;

  -- The end is the next boundary after now: Monday 00:00 UTC for weekly, the 1st 00:00 UTC for monthly.
  v_period_end := case when p_frequency = 'weekly'
    then ((date_trunc('week', now() at time zone 'UTC') + interval '7 days') at time zone 'UTC')
    else ((date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC')
  end;

  insert into public.settlement_schedules (store_id, frequency, payout_account_id, period_start, period_end)
  values (p_store_id, p_frequency, p_payout_account_id, now(), v_period_end)
  on conflict (store_id) do update set
    frequency = excluded.frequency,
    payout_account_id = excluded.payout_account_id,
    period_end = excluded.period_end;
end;
$$;

revoke execute on function public.save_settlement_schedule(uuid, public.settlement_frequency, uuid) from public, anon;
grant execute on function public.save_settlement_schedule(uuid, public.settlement_frequency, uuid) to authenticated;

-- 4. The sweep. Closes the period of each picked schedule once it has ended, as of now(). It never closes an
-- open period early. Runs as the owner so it can write settlements; clients can't call it.
-- Returns how many periods it closed. A period with nothing captured or refunded, or whose net is negative,
-- records no settlement. Its events stay unsettled, so the next period picks them up: a debt rolls forward.
create or replace function public.run_settlements(p_schedule_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.settlement_schedules%rowtype;
  v_settlement_id uuid;
  v_items integer;
  v_closed integer := 0;
begin
  -- "for update" stops two sweeps from closing the same period at once.
  for v_schedule in
    select * from public.settlement_schedules
    where id = any (p_schedule_ids) and period_end <= now()
    order by period_end, id
    for update
  loop
    insert into public.settlements (
      store_id, payout_account_id, currency, period_start, period_end,
      gross_amount, refunded_amount, net_amount
    )
    select v_schedule.store_id, v_schedule.payout_account_id, st.currency,
      v_schedule.period_start, v_schedule.period_end, 0, 0, 0
    from public.stores st
    where st.id = v_schedule.store_id
    returning id into v_settlement_id;

    -- Captures are positive, refunds negative. Takes every unsettled event up to the period end, including
    -- ones from before the schedule started. The "not exists" stops an event from being paid twice.
    insert into public.settlement_items (settlement_id, order_event_id, amount)
    select v_settlement_id, e.id,
      case when e.action = 'captured' then 1 else -1 end
        * (e.metadata ->> 'amount')::bigint
    from public.order_events e
    join public.orders o on o.id = e.order_id
    where o.store_id = v_schedule.store_id
      and e.action in ('captured', 'refunded')
      and e.occurred_at < v_schedule.period_end
      and (e.metadata ->> 'amount')::bigint <> 0
      and not exists (
        select 1 from public.settlement_items i where i.order_event_id = e.id
      );

    -- Totals come from the items, so gross - refunded = net always holds.
    update public.settlements s
    set gross_amount = t.gross,
        refunded_amount = t.refunded,
        net_amount = t.gross - t.refunded
    from (
      select coalesce(sum(i.amount) filter (where i.amount > 0), 0) as gross,
        coalesce(-sum(i.amount) filter (where i.amount < 0), 0) as refunded
      from public.settlement_items i
      where i.settlement_id = v_settlement_id
    ) t
    where s.id = v_settlement_id;

    -- Nothing to pay, or in debt: drop the settlement. Its items go with it (on delete cascade), so the
    -- events are unsettled again and roll into the next period.
    select count(*) into v_items from public.settlement_items where settlement_id = v_settlement_id;
    if v_items = 0 or (select net_amount from public.settlements where id = v_settlement_id) < 0 then
      delete from public.settlements where id = v_settlement_id;
    end if;

    v_closed := v_closed + 1;

    -- Move the schedule on to its next period.
    update public.settlement_schedules
    set period_start = v_schedule.period_end,
        period_end = case v_schedule.frequency
          when 'weekly' then ((date_trunc('week', v_schedule.period_end at time zone 'UTC') + interval '7 days') at time zone 'UTC')
          else ((date_trunc('month', v_schedule.period_end at time zone 'UTC') + interval '1 month') at time zone 'UTC')
        end
    where id = v_schedule.id;
  end loop;

  return v_closed;
end;
$$;

revoke execute on function public.run_settlements(uuid[]) from public, anon, authenticated;

-- 5. Automatic closing. Every 15 minutes each period that has ended is closed, for every schedule, so a payout
-- appears at the period end without anyone pressing a button. A backlog is cleared in one run: the loop repeats
-- until nothing more is due. It runs without a user, so it doesn't need any role check.
create or replace function public.close_due_periods()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed integer;
  v_total integer := 0;
begin
  loop
    v_closed := public.run_settlements((
      select array_agg(id) from public.settlement_schedules where period_end <= now()
    ));
    exit when v_closed = 0;
    v_total := v_total + v_closed;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.close_due_periods() from public, anon, authenticated;

select cron.schedule('close-due-settlement-periods', '*/15 * * * *', 'select public.close_due_periods()');

-- 6. Approving a payout moves it from pending to paid. Only platform developers may approve, and only
-- a pending payout can be approved, so a paid one can't be paid twice.
create or replace function public.approve_payout(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'platform_developer'
  ) then
    raise exception 'Only platform developers can approve payouts' using errcode = '42501';
  end if;

  update public.settlements
  set status = 'paid', paid_at = now()
  where id = p_settlement_id and status = 'pending';
  if not found then
    raise exception 'Payout % is not pending', p_settlement_id using errcode = 'check_violation';
  end if;
end;
$$;

revoke execute on function public.approve_payout(uuid) from public, anon;
grant execute on function public.approve_payout(uuid) to authenticated;
