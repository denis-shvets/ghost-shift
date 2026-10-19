-- Orders whose authorization has run out move from authorized to expired, every 15 minutes.
-- The database does it itself with pg_cron, so it runs even when no app or agent is up (ADR 0016).

-- Generated from schema.ts: indexes only open authorizations, so each run finds the due
-- ones without reading every order.
CREATE INDEX "orders_authorized_expires_at_idx" ON "orders" USING btree ("expires_at") WHERE "orders"."status" = 'authorized';

-- pg_cron is a Postgres add-on that Supabase ships: it runs SQL on a timer.
create extension if not exists pg_cron with schema pg_catalog;

-- The status changes an order may make. A check constraint only sees the new row, so this is a
-- trigger, which sees the old and new row. It applies to everyone, even the table owner.
-- Add pairs here (create or replace) when capture, cancel and refund are built.
create or replace function public.orders_status_transition_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    and (old.status, new.status) not in (('authorized'::public.order_status, 'expired'::public.order_status))
  then
    raise exception 'Order % can''t change from % to %', old.id, old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger orders_status_transition_check
  before update of status on public.orders
  for each row execute function public.orders_status_transition_check();

-- Expires every open authorization that has run out, and writes its timeline event in the same
-- statement, so an order can't be expired without one. Returns how many orders it expired.
-- Two runs at once can't double up: the second waits for the first's row locks, then skips
-- orders that are no longer authorized. Part-captured orders are left alone: money was captured.
create or replace function public.expire_orders()
returns integer
language sql
set search_path = ''
as $$
  with expired as (
    update public.orders set status = 'expired'
    where status = 'authorized' and expires_at <= now()
    returning id, created_at, expires_at, uncaptured_amount
  ), events as (
    -- occurred_at is when it ran out, not when this run noticed. No actor user: the system did it.
    insert into public.order_events (order_id, occurred_at, action, actor_name, metadata)
    select id, expires_at, 'expired', 'System', jsonb_build_object(
      'releasedAmount', uncaptured_amount,
      -- Whole days, rounded: a plain extract(day …) would turn 6 days 23 hours into 6.
      'reason', format('Authorization expired after %s days', round(extract(epoch from expires_at - created_at) / 86400))
    )
    from expired
    returning 1
  )
  select count(*)::integer from events;
$$;

-- New functions in public can be called by everyone, and Supabase grants them to anon,
-- authenticated and service_role too. Only the owner (postgres, which pg_cron runs as) may call these.
revoke execute on function public.expire_orders() from public, anon, authenticated, service_role;
revoke execute on function public.orders_status_transition_check() from public, anon, authenticated, service_role;

-- Scheduling the same name again updates the job, so this is safe to run twice.
select cron.schedule('expire-orders', '*/15 * * * *', 'select public.expire_orders()');
