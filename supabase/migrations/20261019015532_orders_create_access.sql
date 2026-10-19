-- Platform developers can create orders. Nobody else can, not even a merchant with
-- orders.edit, because the insert policies below ask for a permission only this role holds.

insert into public.permissions (name, description) values
  ('orders.create', 'Create orders');

insert into public.role_permissions (role, permission) values
  ('platform_developer', 'orders.create');

-- Grants: insert only. Updates and deletes stay closed, and anonymous visitors get nothing.
grant insert on table public.orders, public.order_lines to authenticated;

-- "with check" is the rule a new row must pass before it is saved.
-- Here the row's store must give the signed-in user orders.create.
create policy "developers can create orders" on public.orders
  for insert to authenticated with check (public.has_permission('orders.create', store_id));

-- A line needs orders.create for its order's store too. Reading the order isn't enough, or a merchant
-- with orders.read could add lines to their existing orders.
create policy "developers can create order lines" on public.order_lines
  for insert to authenticated with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.has_permission('orders.create', o.store_id)
    )
  );
