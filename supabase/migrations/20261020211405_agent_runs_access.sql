-- Who can start, end and read agent runs. A run belongs to the user who started it: only they
-- may end it, and only while it is still going. People with a global role (platform staff)
-- read every run. Merchants don't: one run can touch several companies, and its purpose and
-- summary are free text that could name another merchant's orders. They still see the run's id
-- on the events they can read.

-- Local Supabase grants every privilege on new tables, hosted grants none. Revoke first so both
-- end up the same.
revoke all on table public.agent_runs from anon, authenticated;

-- Column-level grants: a grant can name the columns it covers.
-- insert (purpose): the id, the start time and the agent come from the column defaults, so
-- nobody can backdate a run or start one in someone else's name.
-- update (ended_at, summary): ending a run is the only change; purpose, agent_user_id and
-- started_at can't be changed by anyone signed in. The trigger below sets the end time itself.
-- No delete: a run stays on the record. Deleting its user removes it (on delete cascade).
grant select on table public.agent_runs to authenticated;
grant insert (purpose) on table public.agent_runs to authenticated;
grant update (ended_at, summary) on table public.agent_runs to authenticated;

-- The default fills in auth.uid(); the check also refuses any other value.
create policy "users start their own runs" on public.agent_runs
  for insert to authenticated with check (agent_user_id = (select auth.uid()));

-- "using" picks the rows that may be changed: your own runs that haven't ended. Once ended_at is
-- set, the row no longer matches, so an ended run is frozen.
-- "with check" is the rule the changed row must pass: still yours.
create policy "users end their own open runs" on public.agent_runs
  for update to authenticated
  using (agent_user_id = (select auth.uid()) and ended_at is null)
  with check (agent_user_id = (select auth.uid()));

create policy "users read their own runs, platform staff read all" on public.agent_runs
  for select to authenticated using (
    agent_user_id = (select auth.uid())
    or exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()))
  );

-- Every update ends the run, at the database's own time. Whatever ended_at the caller sends is
-- replaced, so a run can't be ended in the past (before its own events) or in the future. A
-- "before update" trigger changes the row before it is written and before the policy checks it.
create function public.agent_runs_end_now()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ended_at := now();
  return new;
end;
$$;

create trigger agent_runs_end_now
  before update on public.agent_runs
  for each row execute function public.agent_runs_end_now();

-- Only the trigger calls this function. Supabase grants new functions to everyone, so take that back.
revoke execute on function public.agent_runs_end_now() from public, anon, authenticated, service_role;

-- Events get a run only through order_action(), which checks that the run is the caller's own
-- and still going. The insert policy for developers adding events directly (when they create an
-- order) now also requires an empty run, so nobody can link someone else's or an ended run.
-- "alter policy … with check" replaces the whole rule, so the old conditions are written again.
alter policy "developers can create order events" on public.order_events
  with check (
    actor_user_id = (select auth.uid())
    and action = 'authorized'
    and agent_run_id is null
    and exists (
      select 1 from public.orders o
      where o.id = order_id and public.has_permission('orders.create', o.store_id)
    )
  );
