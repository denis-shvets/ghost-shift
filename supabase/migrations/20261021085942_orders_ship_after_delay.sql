-- Night Shift's orders ship some hours after they're placed, so the orders agent has capture work.
-- Shipping is warehouse work, not a judgment call, so the database does it with pg_cron (ADR 0016).

-- Ships orders that the Worker cron placed from the scheduled_checkouts queue and that are still
-- authorized, not shipped, have at least one physical line, and whose delay has passed. Seed orders
-- and the owner's own test orders never come from the queue, so they are left alone. Writes a
-- 'shipped' timeline event for each order. Returns how many it shipped.
-- The delay is 4 to 48 hours, read from the last byte of the order's random id, so it never changes.
-- shipped_at is when the delay ran out, not when this run noticed, so it's always after created_at.
-- Two runs at once can't double up: the second waits for the first's row locks, then skips orders
-- that have shipped_at by then.
create or replace function public.ship_orders()
returns integer
language sql
set search_path = ''
as $$
  with due as (
    select o.id, o.created_at + make_interval(hours => 4 + get_byte(uuid_send(o.id), 15) % 45) as ship_at
    from public.orders o
    where o.status = 'authorized'
      and o.shipped_at is null
      and exists (select 1 from public.scheduled_checkouts s where s.order_id = o.id)
      and exists (select 1 from public.order_lines l where l.order_id = o.id and l.type = 'physical')
  ), shipped as (
    update public.orders o
    set shipped_at = due.ship_at,
      -- Keep a tracking number that was given; otherwise make one from the id, like 1A2B3C4D5E6F.
      shipping_tracking = coalesce(o.shipping_tracking, upper(substr(replace(o.id::text, '-', ''), 1, 12)))
    from due
    where o.id = due.id and due.ship_at <= now() and o.shipped_at is null
    returning o.id, due.ship_at
  ), events as (
    -- occurred_at is when the delay ran out. No actor user: the system did it.
    insert into public.order_events (order_id, occurred_at, action, actor_name, metadata)
    select id, ship_at, 'shipped', 'System', '{}'::jsonb
    from shipped
    returning 1
  )
  select count(*)::integer from shipped;
$$;

-- Only the owner (postgres, which pg_cron runs as) may call it. See expire_orders.
revoke execute on function public.ship_orders() from public, anon, authenticated, service_role;

-- Scheduling the same name again updates the job, so this is safe to run twice.
select cron.schedule('ship-orders', '*/15 * * * *', 'select public.ship_orders()');
