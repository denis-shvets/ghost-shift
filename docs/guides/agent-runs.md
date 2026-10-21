# Agent runs

An **agent run** is one execution of an agent: the 02:00 job that captures shipped orders, for example. This guide explains how runs are stored and checked, step by step. Read it once top to bottom, then try the queries in section 9 in Supabase Studio.

## 1. The big picture

Before this change, the audit log said who did something and why, but not as part of which job. To answer "what did last night's run do?" you had to guess from times and names.

Now:

1. The agent starts a run: `POST /api/v1/agent-runs` with a purpose. The database adds a row to `agent_runs` and returns its id.
2. The agent sends that id as `agentRunId` with every capture, cancel or refund.
3. `order_action()` checks the run and writes its id on the timeline event (`order_events.agent_run_id`).
4. The agent ends the run: `PATCH /api/v1/agent-runs/<id>` with an optional summary.
5. The audit log shows a Run column next to each event.

```
agent_runs                        order_events
┌────────────────────────┐        ┌──────────────────────────────┐
│ id            (pk)     │◄───────│ agent_run_id  (nullable fk)  │
│ agent_user_id → user   │   1:N  │ order_id, action, reason …   │
│ started_at, ended_at   │        └──────────────────────────────┘
│ purpose, summary       │
└────────────────────────┘
```

## 2. Words you'll meet

| Word                   | Meaning here                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **One-to-many**        | One run has many events; each event has at most one run. The "many" side (events) holds the link.                        |
| **Foreign key (fk)**   | A column that must point to an existing row in another table. Postgres refuses a link to a run that doesn't exist.       |
| **Nullable**           | The column may be empty (`null`). Events made by people outside a run have no run.                                       |
| **Column-level grant** | A grant that names columns: "you may insert `purpose`", not "you may insert into the table".                             |
| **Security definer**   | A function that runs with its owner's rights instead of the caller's. Row-level security doesn't apply inside it.        |
| **Function signature** | A function's name plus its argument types. Postgres tells functions apart by the whole signature, not by the name alone. |

## 3. The table (migration `agent_runs_table`)

Schema: `src/features/agent-runs/db/schema.ts`. Each column:

- `id`: a random uuid, made by the database.
- `agent_user_id`: who ran it. The default is `auth.uid()`, the signed-in user from the token, so the app never sends it. If that user is deleted, their runs are deleted too (`on delete cascade`).
- `started_at`: defaults to `now()`.
- `ended_at`: empty while the run is going.
- `purpose`: required, 1 to 200 characters after trimming spaces (`agent_runs_purpose_length_check`).
- `summary`: optional, up to 2,000 characters (`agent_runs_summary_length_check`).
- `agent_runs_ended_after_started_check`: a run can't end before it started.

Row-level security is switched on in the same migration (`enableRLS`). Until the policies in section 5 exist, nobody signed in can read or write a row.

## 4. Linking events to runs

The same migration adds `order_events.agent_run_id`:

1. **Nullable**, because most events have no run: a merchant capturing by hand, the expiry job, an order being created.
2. **Foreign key `order_events_agent_run_fk`**, so an event can only point to a run that exists.
3. **`on delete set null`**: if a run is ever deleted (only when its user is deleted), its events stay and lose the link. The timeline is append-only, so we never delete events because of a run. Compare `actor_user_id`, which works the same way.
4. **Partial index `order_events_agent_run_idx`**, with `where agent_run_id is not null`. An index is like a book's index: it lets Postgres jump to "the events of run X" without reading every event. "Partial" means only rows with a run go in, so it stays small while most events have none. Postgres also uses it when a run is deleted, to find the events to set to null.

## 5. Who can do what (migration `agent_runs_access`)

Remember from [the auth guide](auth-and-policies.md): a **grant** says which commands a role may run on a table, and a **policy** says which rows. Both must say yes.

**Grants, column by column:**

```sql
grant select on table public.agent_runs to authenticated;
grant insert (purpose) on table public.agent_runs to authenticated;
grant update (ended_at, summary) on table public.agent_runs to authenticated;
```

- `insert (purpose)`: an insert may name only `purpose`. The id, `started_at` and `agent_user_id` come from their defaults. Trying to send `started_at` (backdating a run) or someone else's `agent_user_id` fails with "permission denied", before any policy is even asked.
- `update (ended_at, summary)`: ending a run is the only change. Nobody signed in can rewrite a run's purpose or start time. The end time itself comes from a trigger (below), not from the caller.
- No `delete`: runs stay on the record.

One side effect: Drizzle's `insert` lists every column and sends `default` for the ones you leave out. Postgres counts that as writing those columns, so the column grant refuses it. `startAgentRun` therefore writes the insert as plain SQL: `insert into public.agent_runs (purpose) values (…)`.

**Policies:**

- Insert: `agent_user_id = auth.uid()`. The default already fills this in; the policy makes sure it stays that way.
- Update: `using (agent_user_id = auth.uid() and ended_at is null)`. `using` picks which rows may be changed: your own runs that are still going. `with check (agent_user_id = auth.uid())` is the rule the changed row must pass: it stays yours.
- Select: your own runs, plus everything for anyone with a global role (platform developers and operators).

**The end time comes from the database.** Signed-in users can reach the table directly through Supabase's REST API, not only through our endpoint. With only the grant and the policy, an agent could send any `ended_at`, for example a time before its own events, and make the record lie. So a trigger sets it:

```sql
create trigger agent_runs_end_now
  before update on public.agent_runs
  for each row execute function public.agent_runs_end_now();  -- new.ended_at := now();
```

1. A **trigger** is a function the database runs on its own when a row changes. `before update` means it runs before the row is written, and before the policy checks it.
2. It replaces whatever `ended_at` the caller sent with `now()`, the time of the transaction.
3. So every update ends the run, once: after it, `ended_at` is set, the `using` rule no longer matches, and the run is frozen. That includes the summary, which can't be rewritten later.
4. The trigger also runs for the table owner. The seed script (section 8) therefore inserts its sample run with fixed times instead of updating it.

**Events can only get a run through `order_action()`.** `order_events` already had an insert policy for developers who add the first event when they create an order. It now also requires `agent_run_id is null`. Without that, a developer could insert an event pointing at another agent's run, or at an ended one, and skip the run check in section 6. `alter policy … with check (…)` replaces the whole rule, so the migration writes the old conditions again with the new one added.
**What merchants see.** Merchants can read the events of their orders, including `agent_run_id`, but not the run itself. One agent can work for several companies in a single run, and the purpose and summary are free text that could mention another merchant's orders. So the audit log shows a merchant `Run 5a3b1e00` (the first 8 characters of the id) and shows platform staff and the agent itself the purpose.

## 6. Why the run check lives in `order_action()` (migration `orders_action_agent_run`)

Capture, cancel and refund only happen through `public.order_action()`. It is `security definer`: it runs as the table owner, because signed-in users may not update orders or write those events themselves. Inside it, row-level security doesn't apply. So the function has to check the run itself:

```sql
perform 1
from public.agent_runs r
where r.id = p_agent_run_id and r.agent_user_id = auth.uid() and r.ended_at is null
for share;
```

- The run must exist, belong to the caller and still be going. Otherwise the function raises `invalid_parameter_value`, which the API answers with `400`.
- `for share` locks the run row until the action commits. If the agent ends the run at the same moment, the end waits for the action, so the event lands before the end time. Together with the insert policy in section 5, this is the only way an event gets a run.

A check in the app alone would not be enough: the function is also reachable through Supabase's own API, and the database must refuse a bad run whichever way the call comes in.

## 7. Why the function had to be dropped and granted again

The function gained a fifth argument, `p_agent_run_id uuid default null`. Postgres tells functions apart by their argument types, so `order_action(uuid, text, bigint, text, uuid)` is a **different function** from `order_action(uuid, text, bigint, text)`. `create or replace` would have created a second one next to the old one, and a call with four arguments would then match both, which Postgres refuses as ambiguous.

So the migration:

1. Drops the old four-argument function.
2. Creates the new one. Its body is the old one, unchanged, plus the run check and `agent_run_id` on the event.
3. Grants it again. Grants belong to one exact function, so they went away with the old one. Supabase grants new functions to `anon` by default, so the migration revokes that and grants `execute` to `authenticated` only, as before.

The `default null` keeps every existing caller working: they don't send the argument, and the event's `agent_run_id` stays empty.

## 8. Sample data

`pnpm db:seed-users` creates the local accounts. It now also creates one ended sample run for the seeded agent ("Sample: capture shipped orders at Satin Sparrow") and links it to the three latest captures at that store. The run has a fixed id: running the script again deletes it (its events lose the link) and makes it again. `supabase/seed.sql` can't do this, because it runs before any users exist and a run must point to a user.

After `pnpm db:reset` and `pnpm db:seed-users`, sign in as the agent or the developer and open `/audit-log`: three captures show the sample purpose in the Run column. As `merchant-pocket@ghostshift.test` you see the same events with only the short run id.

## 9. Try it yourself (Supabase Studio, SQL editor)

What did one run do?

```sql
select e.occurred_at, e.action, o.reference, e.metadata->>'reason' as reason
from public.order_events e
join public.orders o on o.id = e.order_id
where e.agent_run_id = '5a3b1e00-0000-4000-8000-000000000001'
order by e.occurred_at;
```

All runs, newest first, with how many events each made:

```sql
select r.started_at, r.ended_at, r.purpose, count(e.id) as events
from public.agent_runs r
left join public.order_events e on e.agent_run_id = r.id
group by r.id
order by r.started_at desc;
```

`left join` keeps runs with no events (a run that found nothing to do still shows, with 0).

## 10. Tests

- `src/features/agent-runs/db/schema.test.ts`: the grants and policies. An agent starts its own run, can't send another user's id or a start time, can't change the purpose, and can't end someone else's run or a run that has ended. An `ended_at` sent in the past or the future is replaced by the database's time. A developer can't add an event with a run directly. Merchants and strangers see no runs.
- `src/features/agent-runs/server/agent-runs-repository.test.ts`: start and end, and the `not_found` / `already_ended` answers.
- `src/features/orders/server/orders-repository.test.ts`: an action inside a run links the event; another user's run or an ended run gives `400`.
- `src/features/activity/server/activity-repository.test.ts`: platform staff see the purpose, a merchant sees only the run id.

## Links

- [Postgres: Privileges (column grants)](https://www.postgresql.org/docs/current/ddl-priv.html)
- [Postgres: Row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Postgres: Partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Postgres: Function overloading](https://www.postgresql.org/docs/current/xfunc-overload.html)
