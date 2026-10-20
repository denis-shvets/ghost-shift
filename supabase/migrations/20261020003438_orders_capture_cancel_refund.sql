-- Capture, cancel and refund, each with a required reason.
-- 1. Three new permissions, given to the roles that may already edit orders.
-- 2. The status trigger from expire_orders learns the new moves and the money rules.
-- 3. One function, public.order_action(), is the only way to do these actions. It checks the
--    permission, changes the amounts and writes the timeline event in one transaction.

-- 1. Permissions. Roles without them (first-line agents, platform operators, dispute handlers)
-- can still read orders, but can't move money.
insert into public.permissions (name, description) values
  ('orders.capture', 'Capture authorized money'),
  ('orders.cancel', 'Cancel what is left of an authorization'),
  ('orders.refund', 'Refund captured money');

insert into public.role_permissions (role, permission)
select role, permission
from (values ('platform_developer'), ('merchant_admin'), ('merchant_order_manager'), ('agent_second_line')) as r (role)
cross join (values ('orders.capture'), ('orders.cancel'), ('orders.refund')) as p (permission);

-- 2. The rules for changing an order, in one place. A trigger sees the row before (old) and
-- after (new) the update, and runs for everyone, even the table owner and pg_cron.
-- The check constraints on orders still keep captured <= total and refunded <= captured.
create or replace function public.orders_status_transition_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Money only moves forward: nothing can take a capture or refund off the record.
  if new.captured_amount < old.captured_amount or new.refunded_amount < old.refunded_amount then
    raise exception 'Order % can''t lower its captured or refunded amount', old.id
      using errcode = 'check_violation';
  end if;

  -- Capturing needs an open authorization that hasn't run out.
  if new.captured_amount > old.captured_amount then
    if old.status not in ('authorized', 'part_captured') then
      raise exception 'Order % can''t be captured: it is %', old.id, old.status
        using errcode = 'check_violation';
    end if;
    if now() >= old.expires_at then
      raise exception 'Order % can''t be captured: the authorization expired', old.id
        using errcode = 'check_violation';
    end if;
  end if;

  -- The status moves an order may make. Staying on the same status is always allowed.
  if new.status is distinct from old.status and not (
    (old.status = 'authorized' and new.status in ('part_captured', 'captured', 'canceled'))
    -- The expiry job: only once the authorization has run out.
    or (old.status = 'authorized' and new.status = 'expired' and now() >= old.expires_at)
    or (old.status = 'part_captured' and new.status in ('captured', 'canceled'))
    or (old.status = 'captured' and new.status = 'refunded')
  ) then
    raise exception 'Order % can''t change from % to %', old.id, old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- When the status or money changes, the status must match the amounts.
  if (new.status, new.captured_amount, new.refunded_amount)
      is distinct from (old.status, old.captured_amount, old.refunded_amount)
    and (
      (new.status = 'authorized' and new.captured_amount <> 0)
      or (new.status = 'captured' and new.captured_amount <> new.total_amount)
      or (new.status = 'part_captured' and new.captured_amount not between 1 and new.total_amount - 1)
      or (new.status = 'refunded' and new.refunded_amount <> new.captured_amount)
    )
  then
    raise exception 'Order % can''t be % with % captured of % and % refunded',
      old.id, new.status, new.captured_amount, new.total_amount, new.refunded_amount
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Fire on every update, not just of status: a second partial capture changes only the amount.
drop trigger orders_status_transition_check on public.orders;
create trigger orders_status_transition_check
  before update on public.orders
  for each row execute function public.orders_status_transition_check();

-- 3. Capture, cancel or refund one order, as the signed-in user.
-- security definer: runs as the table owner, because signed-in users may not update orders or
-- add these events themselves. That makes this function the only way in, so it checks access
-- itself. "for update" locks the order until the transaction ends, so two captures at the same
-- moment queue up instead of both reading the old amount.
create or replace function public.order_action(
  p_order_id uuid,
  p_action text,
  p_amount bigint,
  p_reason text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_reason text := btrim(p_reason);
  v_metadata jsonb;
begin
  if p_action is null or p_action not in ('capture', 'cancel', 'refund') then
    raise exception 'Unknown order action %', p_action using errcode = 'invalid_parameter_value';
  end if;
  if v_reason is null or v_reason = '' or length(v_reason) > 500 then
    raise exception 'A reason of 1 to 500 characters is required'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_action <> 'cancel' and (p_amount is null or p_amount <= 0) then
    raise exception 'The amount must be more than 0' using errcode = 'invalid_parameter_value';
  end if;

  -- An order the user can't read is reported as missing, the same as one that doesn't exist.
  select * into v_order
  from public.orders o
  where o.id = p_order_id and public.has_permission('orders.read', o.store_id)
  for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;

  if not public.has_permission('orders.' || p_action, v_order.store_id) then
    raise exception 'You don''t have permission to % this order', p_action
      using errcode = 'insufficient_privilege';
  end if;

  -- The trigger allows staying on the same status, so it can't stop a second cancel by itself.
  if p_action = 'cancel' and v_order.status not in ('authorized', 'part_captured') then
    raise exception 'Order % can''t be canceled: it is %', p_order_id, v_order.status
      using errcode = 'check_violation';
  end if;

  -- Readable answers for the common mistakes. The check constraints would refuse these anyway.
  if p_action = 'capture' and p_amount > v_order.uncaptured_amount then
    raise exception 'The amount is more than the uncaptured amount' using errcode = 'check_violation';
  end if;
  if p_action = 'refund' and p_amount > v_order.captured_amount - v_order.refunded_amount then
    raise exception 'The amount is more than the captured amount not yet refunded'
      using errcode = 'check_violation';
  end if;

  -- The trigger above decides whether the move is allowed.
  if p_action = 'capture' then
    update public.orders o
    set captured_amount = o.captured_amount + p_amount,
      status = case
        when o.captured_amount + p_amount = o.total_amount then 'captured'
        else 'part_captured'
      end::public.order_status
    where o.id = p_order_id
    returning * into v_order;
    v_metadata := jsonb_build_object('amount', p_amount, 'reason', v_reason);
  elsif p_action = 'refund' then
    -- The status follows the authorization. Only a fully captured order becomes "refunded".
    update public.orders o
    set refunded_amount = o.refunded_amount + p_amount,
      status = case
        when o.status = 'captured' and o.refunded_amount + p_amount = o.captured_amount then 'refunded'
        else o.status
      end::public.order_status
    where o.id = p_order_id
    returning * into v_order;
    v_metadata := jsonb_build_object('amount', p_amount, 'reason', v_reason);
  else
    -- What is released is what was still uncaptured before the cancel.
    v_metadata := jsonb_build_object('releasedAmount', v_order.uncaptured_amount, 'reason', v_reason);
    update public.orders o
    set status = 'canceled'
    where o.id = p_order_id
    returning * into v_order;
  end if;

  -- The event names the person: their email, as the owner decided for the timeline.
  insert into public.order_events (order_id, action, actor_user_id, actor_name, metadata)
  values (
    p_order_id,
    case p_action when 'capture' then 'captured' when 'refund' then 'refunded' else 'canceled' end::public.order_event_action,
    auth.uid(),
    coalesce((select u.email from auth.users u where u.id = auth.uid()), 'Unknown user'),
    v_metadata
  );

  return v_order;
end;
$$;

-- Supabase grants new functions to anon too. Only signed-in users may call this one.
revoke execute on function public.order_action(uuid, text, bigint, text) from public, anon;
grant execute on function public.order_action(uuid, text, bigint, text) to authenticated;
