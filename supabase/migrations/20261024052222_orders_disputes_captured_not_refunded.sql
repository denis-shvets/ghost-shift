-- A dispute is allowed while the order still holds captured money (captured_amount > refunded_amount).
-- The status isn't checked, so a canceled or expired order with money left can be disputed too.
drop policy "members can open disputes on captured orders in their stores" on public.order_disputes;

create policy "members can open disputes on orders with captured money left" on public.order_disputes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.captured_amount > o.refunded_amount
        and public.has_permission('disputes.manage', o.store_id)
    )
  );
