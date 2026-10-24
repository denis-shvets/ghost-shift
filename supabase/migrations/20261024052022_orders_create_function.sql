-- Create an order in one call, and close the direct insert path.
-- Before: a signed-in user with orders.create could insert orders, lines, addresses and events
-- through the Data API. Their policies checked who was writing, but not the amounts or the
-- expiry, and lines could be added after capture.
-- After: public.create_order() is the only way in. It computes the total and the expiry itself,
-- and writes the order, lines, addresses and first event in one transaction.

-- 1. The function. security definer: it runs as the table owner, so it does the checks itself.
-- The same checks the policies made, plus the money rules that the policies never checked.
create or replace function public.create_order(
  p_store_id uuid,
  p_reference text,
  p_payment_method text,
  p_shipping_carrier text,
  p_customer jsonb,
  p_billing_address jsonb,
  p_shipping_address jsonb,
  p_lines jsonb,
  p_created_at timestamptz
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_currency text;
  v_total bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  -- A store the user can't read is reported as missing, the same as one that doesn't exist.
  select s.currency into v_currency
  from public.stores s
  where s.id = p_store_id and public.has_permission('stores.read', s.id);
  if not found then
    raise exception 'Store not found' using errcode = 'no_data_found';
  end if;
  if not public.has_permission('orders.create', p_store_id) then
    raise exception 'You don''t have permission to create orders in this store'
      using errcode = 'insufficient_privilege';
  end if;

  -- The creation time may be up to 7 hours back (Night Shift catches up to 6) and 5 minutes ahead.
  if p_created_at < now() - interval '7 hours' or p_created_at > now() + interval '5 minutes' then
    raise exception 'The creation time is outside the allowed window'
      using errcode = 'check_violation';
  end if;

  -- The total is the sum of the lines, computed here and never taken from the caller.
  select coalesce(sum(l."unitPrice"::bigint * l.quantity), 0) into v_total
  from jsonb_to_recordset(p_lines) as l(quantity int, "unitPrice" int);

  -- Same rule as src/features/orders/model/payment-methods.ts: card and wallets run out after 7 days.
  insert into public.orders (
    reference, created_by, created_at, expires_at, store_id, currency,
    customer_first_name, customer_last_name, customer_email, customer_phone,
    payment_method, status, total_amount, captured_amount, refunded_amount, shipping_carrier
  )
  values (
    p_reference, auth.uid(), p_created_at,
    p_created_at + case when p_payment_method in ('card', 'amex', 'apple_pay', 'google_pay')
      then interval '7 days' else interval '28 days' end,
    p_store_id, v_currency,
    p_customer->>'firstName', p_customer->>'lastName', lower(p_customer->>'email'), p_customer->>'phone',
    p_payment_method::public.payment_method, 'authorized', v_total, 0, 0, p_shipping_carrier
  )
  returning * into v_order;

  insert into public.order_lines (order_id, position, type, sku, name, quantity, unit_price, tax_rate)
  select v_order.id, l."position", l.type::public.order_line_type, l.sku, l.name, l.quantity, l."unitPrice", l."taxRate"
  from rows from (
    jsonb_to_recordset(p_lines) as (type text, sku text, name text, quantity int, "unitPrice" int, "taxRate" int)
  ) with ordinality as l(type, sku, name, quantity, "unitPrice", "taxRate", "position");

  insert into public.order_addresses (order_id, kind, first_name, last_name, company, street_address,
    street_address2, postal_code, city, region, country, phone)
  values
    (v_order.id, 'billing', p_billing_address->>'firstName', p_billing_address->>'lastName',
      p_billing_address->>'company', p_billing_address->>'streetAddress', p_billing_address->>'streetAddress2',
      p_billing_address->>'postalCode', p_billing_address->>'city', p_billing_address->>'region',
      p_billing_address->>'country', p_billing_address->>'phone'),
    (v_order.id, 'shipping', p_shipping_address->>'firstName', p_shipping_address->>'lastName',
      p_shipping_address->>'company', p_shipping_address->>'streetAddress', p_shipping_address->>'streetAddress2',
      p_shipping_address->>'postalCode', p_shipping_address->>'city', p_shipping_address->>'region',
      p_shipping_address->>'country', p_shipping_address->>'phone');

  -- The provider authorizes, as in the seed. Not the email: merchants can read the timeline.
  insert into public.order_events (order_id, occurred_at, action, actor_user_id, actor_name, metadata)
  values (v_order.id, p_created_at, 'authorized', auth.uid(), 'Phantom Checkout',
    jsonb_build_object('amount', v_total));

  return v_order;
end;
$$;

-- Supabase grants new functions to anon too. Only signed-in users may call this one.
revoke execute on function public.create_order(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, timestamptz)
  from public, anon;
grant execute on function public.create_order(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, timestamptz)
  to authenticated;

-- 2. Close the direct path. Without insert, the policies never run: the insert simply fails.
-- The insert grants: created in 20261019015532 (orders, order_lines), 20261019201404 (timeline tables).
revoke insert on public.orders, public.order_lines, public.order_addresses, public.order_events
  from authenticated;

-- The policies that allowed direct inserts can go now. Their select policies stay.
drop policy "creators can create authorized orders" on public.orders;
drop policy "creators can create order lines" on public.order_lines;
drop policy "creators can create order addresses" on public.order_addresses;
drop policy "creators can create order events" on public.order_events;
