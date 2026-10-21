-- Night Shift access (docs/guides/night-shift.md): the checkout customer role, who may extend which
-- orders, and who may use the scheduled_checkouts queue.

-- 1. The checkout customer role.
-- Night Shift customers queue orders as one checkout account, which gets this store role on each
-- store that is open for shopping. The Worker cron places each order as that account, so the
-- database refuses orders in any other store, both when queuing and when placing.
--
-- No orders.read: a customer can't see other people's orders. Its own orders are visible through
-- the select policy below (created_by = its own id). stores.read lets the API find the store.
-- No capture, cancel, refund or edit: a customer never moves money or changes an order.

insert into public.roles (name, scope, description) values
  ('checkout_customer', 'store', 'Places orders as simulated customers in assigned stores');

insert into public.role_permissions (role, permission) values
  ('checkout_customer', 'orders.create'),
  ('checkout_customer', 'stores.read');

-- 2. Orders: what a new order may look like, and only its creator may add lines, addresses and events.
-- Before this, only platform developers held orders.create, so the insert policy asked for nothing
-- else. The checkout customer holds it now, and the orders table can be reached through Supabase's
-- Data API too, not only through createOrder. So the database itself refuses a new order that
-- someone could use to fake money moving, backdate, or pin on someone else.
-- Anyone with orders.create in a store could also add lines, addresses and events to any order in
-- that store, including other people's. Now the creator must be the signed-in user too.

-- Drop and recreate: a policy's rule can't be changed in place, and the name no longer fits.
drop policy "developers can create orders" on public.orders;
create policy "creators can create authorized orders" on public.orders
  for insert to authenticated with check (
    -- Your own order: created_by is what the select and child-row policies trust.
    created_by = (select auth.uid())
    and public.has_permission('orders.create', store_id)
    -- A new order starts as an authorization. Capture and refund go through order_action().
    and status = 'authorized'
    and captured_amount = 0
    and refunded_amount = 0
    -- No backdating beyond what the Night Shift cron needs: it places an order up to 6 hours after
    -- its planned time (LATE_LIMIT). 5 minutes ahead allows for the Worker's clock.
    and created_at between now() - interval '7 hours' and now() + interval '5 minutes'
    -- Only platform staff (anyone with a global role) may create an order that already shipped.
    and (
      shipped_at is null
      or exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()))
    )
  );

-- A checkout customer sees only the orders it created. This also lets its child-row inserts below
-- find the order: their `exists` checks read orders, and row-level security hides rows you can't read.
create policy "customers can read orders they created" on public.orders
  for select to authenticated using (created_by = (select auth.uid()));

-- Drop and recreate: a policy's rule can't be changed in place.
drop policy "developers can create order lines" on public.order_lines;
create policy "creators can create order lines" on public.order_lines
  for insert to authenticated with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.created_by = (select auth.uid())
        and public.has_permission('orders.create', o.store_id)
    )
  );

drop policy "developers can create order addresses" on public.order_addresses;
create policy "creators can create order addresses" on public.order_addresses
  for insert to authenticated with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.created_by = (select auth.uid())
        and public.has_permission('orders.create', o.store_id)
    )
  );

drop policy "developers can create order events" on public.order_events;
create policy "creators can create order events" on public.order_events
  for insert to authenticated with check (
    actor_user_id = (select auth.uid())
    and action = 'authorized'
    -- Kept from agent_runs_access: only order_action() links a run to an event.
    and agent_run_id is null
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.created_by = (select auth.uid())
        and public.has_permission('orders.create', o.store_id)
    )
  );

-- 3. The scheduled_checkouts queue.
-- Local Supabase grants every privilege on new tables, hosted grants none. Revoke first so both
-- end up the same.
revoke all on table public.scheduled_checkouts from anon, authenticated;

-- Column-level grants: id, created_by and status come from the defaults, so nobody can queue in
-- someone else's name or insert a row that looks already placed. No update and no delete: only the
-- Worker cron, connected as the table owner, moves a row along. The owner can remove rows with SQL.
grant select on table public.scheduled_checkouts to authenticated;
grant insert (store_id, persona, plan_id, due_at, payload) on table public.scheduled_checkouts
  to authenticated;

-- Queue only for yourself, only in stores where you may create orders, and only in the future.
-- The order gets due_at as its created_at, so a time in the past would backdate it.
create policy "creators queue their own future checkouts" on public.scheduled_checkouts
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.has_permission('orders.create', store_id)
    and due_at > now()
  );

-- Like agent runs: your own rows, and platform staff (anyone with a global role) read all. Merchants
-- read none: the queue shows orders that haven't happened yet.
create policy "creators read their own checkouts, platform staff read all" on public.scheduled_checkouts
  for select to authenticated using (
    created_by = (select auth.uid())
    or exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()))
  );
