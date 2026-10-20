-- order_action() learns which agent run an action belongs to. The new last argument is
-- optional, so callers that don't send it keep working. The body is the one from
-- orders_capture_cancel_refund, with the run check and the event's agent_run_id added.

-- Postgres tells functions apart by their arguments, so a fifth argument makes a new function
-- next to the old one. Drop the old one, or a call with four arguments would be ambiguous.
drop function public.order_action(uuid, text, bigint, text);

-- Capture, cancel or refund one order, as the signed-in user, optionally inside one of their runs.
create function public.order_action(
  p_order_id uuid,
  p_action text,
  p_amount bigint,
  p_reason text,
  p_agent_run_id uuid default null
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

  -- The run must be the caller's own and still going. This function runs as the table owner, so
  -- row-level security doesn't apply here and the check is written out. "for share" makes a
  -- concurrent end of the run wait until this action has committed.
  if p_agent_run_id is not null then
    perform 1
    from public.agent_runs r
    where r.id = p_agent_run_id and r.agent_user_id = auth.uid() and r.ended_at is null
    for share;
    if not found then
      raise exception 'Agent run % is not an open run of yours', p_agent_run_id
        using errcode = 'invalid_parameter_value';
    end if;
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
  insert into public.order_events (order_id, action, actor_user_id, actor_name, metadata, agent_run_id)
  values (
    p_order_id,
    case p_action when 'capture' then 'captured' when 'refund' then 'refunded' else 'canceled' end::public.order_event_action,
    auth.uid(),
    coalesce((select u.email from auth.users u where u.id = auth.uid()), 'Unknown user'),
    v_metadata,
    p_agent_run_id
  );

  return v_order;
end;
$$;

-- Grants belong to the dropped function, so they go again on the new one. Supabase grants new
-- functions to anon too. Only signed-in users may call this one.
revoke execute on function public.order_action(uuid, text, bigint, text, uuid) from public, anon;
grant execute on function public.order_action(uuid, text, bigint, text, uuid) to authenticated;
