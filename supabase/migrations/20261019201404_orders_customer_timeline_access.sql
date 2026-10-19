-- Who can read and add addresses and timeline events. Both follow the order they belong to:
-- if you can read the order, you can read its addresses and timeline. No new roles.

-- Local Supabase grants every privilege on new tables (TRUNCATE even skips row-level security),
-- hosted grants none. Revoke first so both end up the same.
revoke all on table public.order_addresses, public.order_events from anon, authenticated;

-- Grants: read and insert only. No update or delete, so the timeline can't be rewritten.
grant select, insert on table public.order_addresses, public.order_events to authenticated;

-- "using" decides which rows a select returns. The order's own policy already asks for
-- orders.read, so seeing the order is enough, the same as for order_lines.
create policy "members can read addresses of orders they can read" on public.order_addresses
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_addresses.order_id)
  );

create policy "members can read events of orders they can read" on public.order_events
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_events.order_id)
  );

-- "with check" is the rule a new row must pass. Like order lines, adding one needs
-- orders.create for the order's store, which only platform_developer holds today.
create policy "developers can create order addresses" on public.order_addresses
  for insert to authenticated with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.has_permission('orders.create', o.store_id)
    )
  );

-- An event must also name the person adding it, and can only be the authorization creating an
-- order writes, so nobody can make up a refund or put it under someone else's name.
-- Widen the action list when capture, refund and cancel are built.
create policy "developers can create order events" on public.order_events
  for insert to authenticated with check (
    actor_user_id = (select auth.uid())
    and action = 'authorized'
    and exists (
      select 1 from public.orders o
      where o.id = order_id and public.has_permission('orders.create', o.store_id)
    )
  );
