-- Approves many payouts in one call, instead of one call per payout from the app. Same rules as
-- public.approve_payout: only platform developers, and only pending payouts. If any id is refused,
-- the function raises before it changes a row, so the whole batch is undone.
create or replace function public.approve_payouts(p_settlement_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refused uuid;
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'platform_developer'
  ) then
    raise exception 'Only platform developers can approve payouts' using errcode = '42501';
  end if;

  -- Look for the first id that isn't pending (or doesn't exist) before changing anything.
  select ids.id into v_refused
  from (select distinct unnest(p_settlement_ids) as id) ids
  where not exists (
    select 1 from public.settlements s
    where s.id = ids.id and s.status = 'pending'
  )
  limit 1;
  if v_refused is not null then
    raise exception 'Payout % is not pending', v_refused using errcode = 'check_violation';
  end if;

  update public.settlements
  set status = 'paid', paid_at = now()
  where id = any(p_settlement_ids);
end;
$$;

revoke execute on function public.approve_payouts(uuid[]) from public, anon;
grant execute on function public.approve_payouts(uuid[]) to authenticated;
