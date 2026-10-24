# Night Shift: simulated customers

Night Shift fills the stores with orders the way real customers would: a few at a time, at the hours people actually shop, from the same returning customers. Seven customer personas shop on a plan. On your machine, whenever you like, a script plans the next days: code picks when each customer shops, and Claude decides what they buy, in one run per 150 visits. You read the plan and upload it to a queue in the database. A cron in the Worker places each order when its time comes, also while your computer is off ([ADR 0017](../adr/0017-local-agents-hosted-app.md)). The orders then show up on the Orders page and become work for the backoffice agents.

## 1. The big picture

```
On your machine, now and then                       In the Worker, every 30 minutes
─────────────────────────────                       ──────────────────────────────
pnpm night-shift:plan                               cron: releaseDueCheckouts()
  code: visit times from the personas'                claim the due rows (pending → placing)
        schedules, a dice roll each                   createOrder as the user who queued them,
  one claude -p (Haiku): the baskets                  dated at the planned time
  code: checks every order                            row → placed, failed or skipped
  writes .night-shift/plan-<date>.json                        ▲
        │ you read it                                         │
pnpm night-shift:upload <file> ──► POST /api/v1/scheduled-checkouts ──► scheduled_checkouts table
                                   as checkout@ghostshift.test
```

- **The planner** is `scripts/night-shift.ts`. Code decides when each customer shops. Claude only makes each visit's choices (store, products, payment, addresses), on Haiku at low effort, with no tools at all, up to 150 visits per run. Code builds the orders from those choices.
- **The planning rules** are in [`docs/agents/night-shift.md`](../agents/night-shift.md). Claude gets them in its prompt.
- **The personas** are in [`docs/agents/customers/`](../agents/customers/): who they are, which stores, when they shop, how often, what they buy and how they pay. Each is a `.json` with the data and a `.md` with the habits in plain words (section 3); no code change needed.
- **The queue** is the `scheduled_checkouts` table (section 4).
- **The cron** is the `scheduled` handler in `src/server.ts`, run by Cloudflare every 30 minutes (section 6).

## 2. What makes it look human

1. **Rhythm.** Each persona shops at its own hours in its own time zone: Lena after work in Berlin, Mikko late at night in Helsinki, Sara in her lunch break in Stockholm.
2. **Irregular gaps.** The planner picks random minutes inside those hours, not a fixed minute every hour (section 3).
3. **Chance from code.** A language model is bad at being random on its own: asked to "sometimes" do something, it tends to do it every time or never. So code draws the times and a `variety` number from 0 to 99 for each visit, and Claude follows the persona's habits for that number.
4. **Variety.** `variety` picks between habits: PayPal or card, one item or two, home or gift address.
5. **Returning customers.** Each persona always uses the same name, email and home address, so the merchant sees the same customer come back.
6. **Real times.** Each order's creation time is its planned time, not the moment the cron happened to run, so orders don't arrive in clumps every 30 minutes.

## 3. The persona files

Each persona is a pair of files with the same name in `docs/agents/customers/`:

- **`<name>.json`**, read by code: when the customer shops, and the fixed facts every order of theirs reuses.
- **`<name>.md`**, read by Claude: who they are, and their habits in plain words.

If one of the pair is missing, the planner stops and names it.

### a. The `.json` file

```json
{
  "$schema": "./persona.schema.json",
  "timeZone": "Europe/Berlin",
  "ordersPerWeek": 2,
  "windows": ["Mon-Fri 19:00-23:00", "Sat 10:00-14:00"],
  "customer": { "firstName": "Lena", "lastName": "Vogt", "email": "lena.vogt@example.com" },
  "stores": {
    "de": {
      "id": "b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b18",
      "name": "Satin Sparrow (EUR)",
      "carrier": "DHL",
      "shippingFee": { "name": "Shipping, DHL", "unitPrice": 490, "taxRate": 0 }
    }
  },
  "addresses": {
    "home": {
      "firstName": "Lena",
      "lastName": "Vogt",
      "streetAddress": "Lindenweg 4",
      "postalCode": "10115",
      "city": "Berlin",
      "country": "DE"
    }
  }
}
```

- `timeZone`: an IANA name. Windows are in this time zone, including summer time.
- `ordersPerWeek`: how many orders to expect on average, up to 400. `0.5` means one every two weeks.
- `windows`: when the customer may shop. Days are `Mon` to `Sun`, alone (`Sat`) or as a range (`Mon-Fri`, `Sat-Sun`, `Mon-Sun`). Times are `HH:MM-HH:MM`, the end not included. An end before the start runs past midnight: `Mon-Sun 22:00-03:00` covers Monday 22:00 to Tuesday 02:59.
- `customer`: name, email and optional phone, the same on every order, so the merchant sees a returning customer.
- `stores` and `addresses`: each under a short lower-case key, such as `de`, `home` or `office`. Each store has its own carrier and shipping fee (in the store's currency, minor units), because a customer who shops in two countries pays a different fee in each (see Aino).

**The JSON Schema.** `"$schema": "./persona.schema.json"` points your editor at `docs/agents/customers/persona.schema.json`. VS Code and WebStorm then suggest the keys as you type, show what each one means, and underline mistakes: a misspelled key, a window like `Monday 19:00-23:00`, a missing field. The schema is written from the same Zod schema the planner checks with, so the two always agree. After changing that Zod schema (`personaInput` in `scripts/night-shift.ts`), run `pnpm night-shift:schema` and then `pnpm format`. A test fails while the file is out of date.

The planner checks every `.json` with Zod too, and stops with the file name and the problem if one is wrong. Unknown keys are errors, so a typo never goes unnoticed.

### b. The `.md` file

A heading, a sentence or two about the person, and their habits under **Basket** and **Payment and address**. The habits say in words what the customer buys and how they pay, using `variety` and the keys from the `.json`: "`variety` under 30 ships to `work`". Claude gets this file as it is, plus a line listing the open store keys and the address keys.

**Products by pick.** Claude never sees the products. Each store sells from the same catalog in [`store-catalogs.ts`](../../src/features/orders/model/store-catalogs.ts): 15 physical and 15 digital items, sorted by price. Claude gives a type and a `pick` from 0 to 14, the position within that type, and code takes that item. The habits name pick ranges: "One physical product, pick 3–9". Number ranges work in every store, whatever its currency, and the prompt stays short. Every store a persona shops in needs a catalog; a test checks it.

**Why the keys.** Claude answers each visit with its choices only: a store key, each product as a type, a pick and a quantity, a payment method, and the billing and shipping address keys. Code then builds the whole order from the `.json` and the store's catalog: the customer, the addresses, every line's name, price and tax rate, the carrier, and the shipping fee when the basket has a physical product. A visit's answer is about 50 tokens instead of about 300, so one Claude run handles up to 150 visits, and a price or an address can never come out wrong.

### c. How the visits are drawn

Count only the minutes inside the windows ("active time"). Visits fall at random moments of active time, `ordersPerWeek` of them per week on average. In statistics this is a Poisson process: the gap until the next visit is random (exponential), so some visits come close together and some far apart, and every active minute is equally likely. The planner walks forward through the calendar, minute by minute in the persona's time zone, until it has passed that much active time. That minute is a visit. It repeats until the end of the plan.

With the schedules as written:

| Customer | Store                                                               | Windows (local time)                 | Orders a week |
| -------- | ------------------------------------------------------------------- | ------------------------------------ | ------------- |
| Persona  | Stores                                                              | Windows                              | Orders a week |
| -------- | ------------------------------------------------------------------- | ------------------------------------ | ------------- |
| Lena     | Satin Sparrow, Gingham Galaxy, Cobalt Closet                        | weekdays 19–23, Saturday 10–14       | 2             |
| Jonas    | Satin Sparrow, Linen Lantern, Thimble & Thyme                       | weekends 9–18                        | 1             |
| Mikko    | Plaid Parade, Wool Whisper, Zipper Zenith                           | every night 22–03                    | 3             |
| Sara     | Velour Vault, Moss & Mirror, Denim Dune, Rayon Rhapsody             | weekdays 12–13, Sunday 18–22         | 2             |
| Aino     | Hemline Helsinki, Plaid Parade; Velour Vault (Sweden, sometimes)    | weekdays 07:00–08:30, Saturday 20–23 | 0.5           |
| Elin     | Rayon Rhapsody, Button Bazaar, Moss & Mirror                        | every night 20–08                    | 28            |
| Felix    | Thimble & Thyme, Cobalt Closet                                      | every day 08–20                      | 28            |

Elin and Felix are the shopaholics: between them every hour of the day has orders, about 4 a day each. That's about 65 orders a week, roughly 9 a day. A 7-day plan fits in one Claude run (up to 150 visits each). To get more orders, raise their `ordersPerWeek`.

## 4. The queue (database changes)

Three migrations, all from 2026-10-21. This builds on [Sign-in and access](auth-and-policies.md).

- `20261021085934_night_shift_schema`: the `scheduled_checkouts` table with its payload checks (section c) and `orders.created_by`.
- `20261021085941_night_shift_access`: the `checkout_customer` role, the stricter orders insert policy (section e), the `created_by` policies, and who may use the queue.

### a. The checkout account and its role

1. **A role, `checkout_customer`, with scope `store`.** A store role only works on the stores it is assigned to (the `store_assignments` table), never everywhere.
2. **Two permissions for it:**
   - `orders.create`: the insert policies on `orders`, `order_lines`, `order_addresses` and `order_events` all ask `has_permission('orders.create', store_id)`. The queue's insert policy asks the same, so whoever may create orders in a store may also queue orders for it.
   - `stores.read`: before inserting, the code looks up the store to take its currency. A store the user can't read counts as "not found".
3. **No `orders.read`.** A customer must not read other people's orders. Saving an order uses `insert ... returning id, reference`, and Postgres only returns rows the user may also **read**. So a select policy lets the customer read the orders it created (`created_by = auth.uid()`), and nothing else. That is enough for `returning`, and for the child-row inserts, which look up their order. See [orders database, section 6d](orders-database.md#6d-who-placed-an-order-created_by-2026-10-21).
4. **No other permissions.** It can't capture, cancel, refund or edit.
5. **The seed assigns it to the live stores only.** `pnpm db:seed-users` creates `checkout@ghostshift.test` with `checkout_customer` on Velour Vault, Plaid Parade and Satin Sparrow. Silk Pine Oslo is a `test` store, so it isn't assigned there, and the database refuses an order for it, both when it is queued and when it is placed.

To open another store for Night Shift, add a `checkout_customer` assignment for it in `scripts/seed-users.ts` (and in the hosted project, section 7b step 5), and add it to a persona's `stores` in its `.json`, with a key, its name, carrier and shipping fee.

### b. The table, column by column

| Column        | What it holds                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`          | The row's own id, filled in by the database.                                                                     |
| `created_by`  | Who queued it. Filled in from the caller's token (`default auth.uid()`). The cron places the order as this user. |
| `store_id`    | The order's store, copied from the order so the policies can check it.                                           |
| `persona`     | The persona file it was planned for, e.g. `jonas-weber`. Only for reading the queue.                             |
| `plan_id`     | One upload. A whole plan can be found, or removed, by this id.                                                   |
| `due_at`      | When the customer shops. The order gets this as its `created_at`.                                                |
| `payload`     | The order itself, as JSON, in the same shape the orders API takes. A check guards it (section c).                |
| `status`      | `pending`, `placing`, `placed`, `failed` or `skipped` (section d).                                               |
| `order_id`    | The order that was placed. Set only when `placed`; a check constraint keeps the two together.                    |
| `error`       | Why a row `failed` or was `skipped`.                                                                             |
| `released_at` | When the cron finished with the row.                                                                             |

- `payload` is `jsonb`: Postgres stores the JSON in a parsed form. The order is only turned into real rows (`orders`, `order_lines`, …) when it is placed, by the same code as any other order.
- An index on `(status, due_at)` lets the cron find the pending, due rows without reading the whole table.
- `created_by` cascades on delete: if the account is deleted, its queued rows go too.

### c. Who may do what

```sql
revoke all on table public.scheduled_checkouts from anon, authenticated;
grant select on table public.scheduled_checkouts to authenticated;
grant insert (store_id, persona, plan_id, due_at, payload) on table public.scheduled_checkouts
  to authenticated;
```

Step by step:

1. **Revoke first.** Local Supabase grants every privilege on new tables, the hosted one grants none. Revoking first makes both the same.
2. **Insert only the planned columns.** A grant can name columns. `id`, `created_by` and `status` aren't in the list, so they always come from their defaults: nobody can queue in someone else's name or insert a row that looks already placed.
3. **No update, no delete.** Only the cron changes rows. It connects as the table owner, which grants don't limit. You can remove rows with SQL in Studio.
4. **The insert policy** asks three things of every new row: `created_by = auth.uid()` (your own), `has_permission('orders.create', store_id)` (a store you may order in) and `due_at > now()` (in the future). The last one matters because the order gets `due_at` as its creation time: without it, someone could queue a row in the past and so backdate an order.
5. **The select policy** shows you your own rows, and platform staff (anyone with a global role) all rows. Merchants see none: the queue shows orders that haven't happened yet.
6. **A check constraint on `payload`.** The API checks every order with Zod before it queues it, but the table can also be reached through Supabase's Data API (`/rest/v1/scheduled_checkouts`), which skips that check. So the database holds the rule the cron relies on:

   ```sql
   check (payload ->> 'storeId' is not distinct from store_id::text)
   ```

   - `->>` reads one field of the JSON as text. The first check says the order goes to the same store as the row's `store_id`, the column the insert policy checked. Without it, a row could pass the policy for one store and place its order in another.
   - `is not distinct from` instead of `=`: a payload with no `storeId` gives `null`, and `null = 'x'` is not false but unknown. A check only refuses a row when it is false, so `=` would let that row in.
   - A refused row fails with error `23514` (`check_violation`).

### d. How the cron places orders, safely

Every 30 minutes, `releaseDueCheckouts()` in `src/features/scheduled-checkouts/server/scheduled-checkouts-repository.ts` runs:

Before it claims anything, it recovers rows a lost run left behind (step 0 below).

```sql
update public.scheduled_checkouts
set status = 'placing', claimed_at = now()
where id = (
  select id from public.scheduled_checkouts
  where status = 'pending' and due_at <= now()
  order by due_at
  limit 1
  for update skip locked
)
returning id, created_by, due_at, payload;
```

It runs this up to 10 times, one row each time, and stops early when no row is due. Step by step:

0. **Recover stuck rows.** A row still `placing` 30 minutes after `claimed_at` (or with no `claimed_at`) lost its run before the final write. It becomes `failed` with the reason "Stuck in placing…", not placed again: its order may already exist, so check the orders list before re-queuing it. It runs first in each Worker cron run, not as a separate pg_cron job, because that cron already runs every 30 minutes and holds the database connection, so no second schedule is needed.
1. **Claim one row.** The inner `select` finds the oldest row that is pending and due. `for update` locks it, and the outer `update` marks it `placing` in the same statement. Once a row is `placing`, no later run picks it up. One row at a time, not 10 at once: if something breaks while placing (a lost connection, say), only the row in hand is stuck in `placing`; the others are still `pending` for the next run.
2. **`skip locked`.** If two runs overlap, the second passes over a row the first has locked instead of waiting for it. So each row is claimed by exactly one run.
3. **Too late.** A row more than 6 hours past its `due_at` becomes `skipped`, without an order. That only happens when the cron was down; it keeps a restart from placing a burst of old orders.
4. **Place.** For each other row, the cron calls `createOrder`, the same function as the orders API, as the row's `created_by` user, with the creation time set to `due_at`. Row-level security checks again that this user may order in the store. On success the row becomes `placed` with its `order_id`.
5. **Fail alone.** If `createOrder` refuses one order (say the store's assignment was removed), that row becomes `failed` with the reason, and the cron goes on with the next. Only a refused create marks a row `failed`: if the final `placed` write fails after the order was made, the row stays `placing` and step 0 deals with it later.
6. **Never twice.** The row is marked `placing` before the order is created. If the Worker crashes in between, the row stays `placing` until step 0 fails it; no run places it again.

Status only moves forward: `pending → placing → placed`, `failed` or `skipped`. Nothing ever sets a row back to `pending`.

### e. What a new order may look like

Superseded: since `20261024052022_orders_create_function`, nobody inserts orders directly. `createOrder` calls `public.create_order()`, which checks these rules itself (see [orders-database.md](orders-database.md) section 6e).

Until Night Shift, only platform developers held `orders.create`, so the insert policy on `orders` asked for nothing else. The checkout customer holds it now, and the `orders` table can be reached through the Data API too, not only through `createOrder`. So `20261021085941_night_shift_access` replaces the policy with a stricter one:

```sql
create policy "creators can create authorized orders" on public.orders
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.has_permission('orders.create', store_id)
    and status = 'authorized'
    and captured_amount = 0
    and refunded_amount = 0
    and created_at between now() - interval '7 hours' and now() + interval '5 minutes'
  );
```

Line by line, a new order must:

1. **Be your own.** `created_by` is what the "read orders you created" policy and the child-row policies trust, so nobody may put an order in someone else's name.
2. **Be in a store where you have `orders.create`.** As before.
3. **Start as an authorization, with nothing captured or refunded.** Money only moves through `order_action()` (capture, cancel, refund), which checks its own permissions and writes the timeline. Without this, someone could insert an order that looks already paid.
4. **Not be backdated.** At most 7 hours in the past: the cron places an order up to 6 hours after its planned time, and gives it that time. 5 minutes ahead allows for the Worker's clock being slightly ahead of the database's.

A policy can't be changed in place, so the migration drops the old one and creates this one. It's tested in `src/features/orders/db/schema.test.ts` ("a checkout customer can't create ...").

The creation time is up to 30 minutes in the past (the cron runs every 30 minutes), or up to 6 hours after the cron was down, never in the future, so authorization expiry works as for any order. The `createdAt` option on `createOrder` is for server code only: no API input carries it.

## 5. Run it locally

1. `pnpm db:start`. Apply new migrations with `pnpm exec supabase migration up` (or start fresh with `pnpm db:reset`), then `pnpm db:seed-users` (needs `SEED_PASSWORD` in `.dev.vars`).
2. `pnpm dev`, and keep it running.
3. Plan the next days:

   ```bash
   pnpm night-shift:plan --days 7
   ```

   `--days` is 1 to 28 (default 7). It refuses to start while `.night-shift/` holds a plan that isn't uploaded yet: the new plan would overwrite it (same start date) or overlap it (the queue doesn't know its times yet). Upload or delete that file first. It prints how many visits it plans, how long each Claude run took (a retry is a second run) and for whom, then writes `.night-shift/plan-<date>.json` (git-ignored):

   ```
   Planning 9 visits from 2026-10-21T11:00:00.000Z to 2026-10-28T11:00:00.000Z.
   Claude run took 41.3 s.
   Planning took 41.3 s in all.
   lena-vogt: 2
   ...
   Wrote .night-shift/plan-2026-10-21.json. Read it, then: pnpm night-shift:upload .night-shift/plan-2026-10-21.json
   ```

   - **Open stores.** The planner asks the app which stores the checkout account may order in (`GET /api/v1/scheduled-checkouts` answers `storeIds`). Each persona keeps only those stores, and Claude is told them. A persona with none left is skipped, with a line like `Skipped jonas-weber: none of its stores is open to the checkout account here.` So a store that is missing from a database, or no longer assigned, costs its customers their visits, not the whole upload.
   - **Where a plan starts.** The same answer has the latest `due_at` you still have pending (`lastDueAt`). A plan starts at that time or one hour from now, whichever is later. So running it twice never doubles the order rate, and you have an hour to read the plan before its first order.
   - **The Claude run** is `claude -p --model haiku --effort low --tools "" --strict-mcp-config --output-format json --json-schema <schema>`, with the prompt on stdin. No built-in tools and no MCP servers: it can't read files (so never `.hosted.vars`) or reach the app. `--json-schema` makes the answer fit the order shape.
   - **The checks.** Code checks every answer, whatever Claude says: a store key and address keys the persona has, a pick from 0 to 14 for its type, each product once, quantities from 1 to 10, a known payment method, and exactly one answer per visit. Then it builds the order (section 3) and checks it with the same Zod schema as the orders API. Visits that fail go to Claude once more, alone. Visits that fail again are left out and printed.

4. **Read the plan.** It's plain JSON: each checkout has `dueAt`, `persona` and the `order`. Edit or delete entries if you like.
5. Upload it:

   ```bash
   pnpm night-shift:upload .night-shift/plan-2026-10-21.json
   ```

   It signs in as `checkout@ghostshift.test` and sends the plan to `POST /api/v1/scheduled-checkouts`. Checkouts whose time has passed while you read are left out and counted, because the database refuses them; a plan with nothing left in the future isn't sent at all.

   After the upload the file is renamed to `plan-<date>.uploaded.json`, and the upload refuses any file named like that, so the same plan isn't queued twice by accident (every order would be placed twice). Different plans may stack: two plans for the same days both go in, and those days get more orders.

6. **Place the due orders.** `pnpm dev` doesn't run crons by itself. Trigger the cron by hand:

   ```bash
   curl http://localhost:3000/cdn-cgi/handler/scheduled
   ```

   The dev server prints `Scheduled checkouts: {"placed":1,"failed":0,"skipped":0}`. To see an order right away, set one checkout's time in the past in Studio's SQL Editor first:

   ```sql
   update scheduled_checkouts set due_at = now() - interval '5 minutes'
   where id = (select id from scheduled_checkouts where status = 'pending' order by due_at limit 1);
   ```

   Then open `/orders`: the customer is that persona, the time is the planned time, and the timeline starts with "Authorized" by Phantom Checkout.

To see the queue: `select persona, status, due_at, error from scheduled_checkouts order by due_at;` in Studio. To drop a plan you uploaded: `delete from scheduled_checkouts where plan_id = '<id>' and status = 'pending';`.

## 6. The cron in the Worker

- `wrangler.jsonc` points `main` at `src/server.ts` and sets `"triggers": { "crons": ["*/30 * * * *"] }`.
- `src/server.ts` exports TanStack Start's `fetch` handler and a `scheduled` handler. The `scheduled` handler opens a database connection, runs `releaseDueCheckouts()` and logs the counts. They show up in the Cloudflare dashboard under the Worker's logs.
- Free plan limits (checked 2026-10-21): 5 cron triggers per account (this is 1) and 10 ms of CPU per run. Waiting for the database doesn't count as CPU time. A run places at most 10 orders, far more than Night Shift has due at once.
- An order can appear in the list up to 30 minutes after its time, below orders placed after it. Nobody watching a demo notices.

## 7. Run it against the live app

`pnpm night-shift:plan:hosted` and `pnpm night-shift:upload:hosted <file>` plan against and upload to <https://ghost-shift.denis-shvets.workers.dev>. The live Worker's cron places the orders. Only the planner signs in, with a password from `.hosted.vars`, a git-ignored file. Claude never sees it.

### a. What keeps it from going wrong

- **Two separate modes.** Hosted runs only with `--hosted`: the `*:hosted` pnpm scripts. They read `.hosted.vars`, never `.dev.vars`. A local run can't reach the live site, and a hosted run can't reach a local one.
- **An allowlist.** Hosted mode accepts only `https://` URLs without a port whose host is exactly `ghost-shift.denis-shvets.workers.dev` (written in the code) or `<project-ref>.supabase.co`. Anything else, including `http://` and look-alikes such as `ghost-shift.denis-shvets.workers.dev.example.com`, is refused before a password is sent.
- **Own accounts and passwords.** Hosted uses `HOSTED_CHECKOUT_PASSWORD`, never `SEED_PASSWORD`. The account can only do what its store roles allow, and the cron places orders as it.

### b. Owner steps, once

You do these, not an agent. They change the live database and create real accounts.

1. **Push the new migration.** Deploy first, which is step 7 below, then come back here and push, because the live Worker still writes to a column this migration drops, until it is redeployed. Preview first, then push:

   ```bash
   pnpm exec supabase db push --dry-run
   ```

   ```bash
   pnpm exec supabase db push
   ```

   The dry run should list `20261021085934_night_shift_schema`, `20261021085941_night_shift_access`, `20261021085942_orders_ship_after_delay`, `20261022173735_orders_drop_shipped_tracking`.

2. **Check that the store ids match.** The personas name their stores by id, from `src/shared/seed/seed-ids.json`. In the Supabase dashboard, open **SQL Editor** and run:

   ```sql
   select id, name, status
   from public.stores
   where id in (
     'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03',  -- Velour Vault
     'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b10',  -- Plaid Parade
     'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b07',  -- Silk Pine Oslo
     'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b18'   -- Satin Sparrow
   )
   order by name;
   ```

   Expect 4 rows: Norway `test`, the other three `live`.
   - **Only Satin Sparrow is missing:** the hosted project was set up before that store. Add its company and the store with the seed's ids, so Lena, Jonas and the orders agent have their store:

     ```sql
     insert into public.organizations (id, name)
     values ('a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a04', 'Pocket Atelier')
     on conflict do nothing;

     insert into public.stores (id, organization_id, name, market, currency, status)
     values ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b18', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a04',
       'Satin Sparrow', 'DE', 'EUR', 'live')
     on conflict do nothing;
     ```

     Step by step: a store belongs to a company (`organization_id`), so the company comes first. The ids are the seed's (`supabase/seed.sql`), the ones the personas and the agent's setup name. `on conflict do nothing` skips a row that already exists, so it's safe to run twice. Run the check above again: 4 rows.

   - **A Northstar Threads store is missing:** the hosted stores have other ids than the seed. Stop and sort that out first. The planner would skip the personas of a missing store (section 5), so nothing breaks, but those customers would never shop.

3. **Check that the scheduled jobs are running:**

   ```sql
   select jobname, schedule from cron.job order by jobname;
   ```

   Expect `expire-orders`, `*/15 * * * *`.

4. **Create the two accounts.** In the dashboard, **Authentication → Users → Add user → Create new user**, twice:
   - `checkout@ghostshift.test`, a new strong password from your password manager, **Auto Confirm User** ticked.
   - the hosted orders agent, for example `yourname+agent.orders@gmail.com` ([ADR 0007](../adr/0007-agent-identities.md)), another new strong password, **Auto Confirm User** ticked.

   Don't reuse `SEED_PASSWORD` or any other password.

5. **Give them their store roles.** In plain terms: a row in `store_assignments` says "this user has this role at this store". The database checks these rows on every request, so they decide what each account may do. In the SQL Editor, replace `<agent email>` and run:

   ```sql
   -- The checkout account may queue and create orders in the three live stores.
   insert into public.store_assignments (user_id, store_id, role)
   select u.id, s.id, 'checkout_customer'
   from auth.users u
   join public.stores s on s.id in (
     'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03',
     'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b10',
     'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b18'
   )
   where u.email = 'checkout@ghostshift.test'
   on conflict do nothing;

   -- The orders agent works at Satin Sparrow only.
   insert into public.store_assignments (user_id, store_id, role)
   select u.id, s.id, r.role
   from auth.users u
   join public.stores s on s.id = 'b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b18'
   cross join (values ('agent_first_line'), ('agent_second_line')) as r(role)
   where u.email = '<agent email>'
   on conflict do nothing;
   ```

   Step by step:
   1. `auth.users` is Supabase's list of accounts. It holds the new users' ids.
   2. The `select` builds one row per user, store and role, and `insert` saves those rows.
   3. `join public.stores` only finds stores that exist, so a mistyped id adds nothing instead of a broken row.
   4. `on conflict do nothing` makes it safe to run twice: a row that is already there is skipped.
   5. The SQL Editor runs as the database owner, which skips row-level security. That's why it may write these rows; the accounts themselves can't.

   Check the result:

   ```sql
   select u.email, s.name, a.role
   from public.store_assignments a
   join auth.users u on u.id = a.user_id
   join public.stores s on s.id = a.store_id
   where u.email in ('checkout@ghostshift.test', '<agent email>')
   order by 1, 2, 3;
   ```

   Expect 5 rows: the checkout account with `checkout_customer` at Plaid Parade, Velour Vault and Satin Sparrow, and the agent with `agent_first_line` and `agent_second_line` at Satin Sparrow.

6. **Fill in `.hosted.vars`.** Copy `.hosted.vars.example` to `.hosted.vars` in the repo root; the copy is git-ignored. Set `SUPABASE_URL` (`https://<project-ref>.supabase.co`) and `SUPABASE_PUBLISHABLE_KEY` from the dashboard (**Project Settings → API Keys**), the checkout password, and the agent's email and password.

7. **Deploy**, so the live Worker has the queue API and the cron:

   ```bash
   pnpm run deploy
   ```

   In the Cloudflare dashboard, the `ghost-shift` Worker's settings should list the cron trigger `*/30 * * * *`.

8. **Plan and upload the first week:**

   ```bash
   pnpm night-shift:plan:hosted --days 7
   ```

   Read the file it names, then:

   ```bash
   pnpm night-shift:upload:hosted .night-shift/plan-<date>.json
   ```

   After the first checkout's time, the order appears on the live site's `/orders` page, and the Worker's logs show `Scheduled checkouts: {"placed":1,...}`.

### c. Every week or so

Run steps 8 again before the queue runs out. `select max(due_at) from scheduled_checkouts where status = 'pending';` in the SQL Editor shows how far it reaches. The planner starts after it by itself.

## 8. Limits and next steps

- The plan is fixed when it's made. If a store closes or a product changes later, the affected rows fail when they come due, with the reason in `error`.
- When the queue runs empty, orders stop until you plan again.
- One `variety` number drives every choice in a visit, so some choices go together (for example, Jonas's gifts tend to be smaller baskets).
- There is no page for the queue yet. Use Studio or the SQL Editor.

## 9. Tests

- `scripts/night-shift.test.ts`: every persona pair reads; `persona.schema.json` matches the Zod schema; a half pair, misspelled keys and address fields, bad keys, bad store ids, no stores, bad addresses, bad windows, rates and time zones are refused; windows follow local time across the end of summer time and past midnight; a year of draws always falls inside the windows and comes close to `ordersPerWeek` (fixed seed); gaps are irregular; a plan's visits fall inside the windows, in time order, the same for the same seed; Claude runs on Haiku at low effort with no tools or MCP servers and the answer schema; an order is built from the choices with the persona's customer, addresses, carrier and the catalog's SKUs, names and prices, plus the shipping fee only for physical products; unknown store and address keys (also prototype names such as `constructor`), a pick past the list, a type other than physical or digital, a product listed twice, a quantity of 0, unknown payment methods, missing and doubled visits are refused; the prompt holds the `.md` and lists the keys, but no products; every persona's stores have a catalog; Claude gets at most 150 visits per run; only the failed visits are asked again, once; personas keep only the open stores, and one with none left is skipped; an uploaded plan file gets its `.uploaded.json` name; `claude.exe` is found on Windows, also behind an npm shim; a Claude run gets its prompt on stdin and is killed when it runs too long.
- `src/features/scheduled-checkouts/db/schema.test.ts`: the checkout account can queue in its store, as itself and pending; a store it may not order in, a time in the past, another user's id and a status are refused; merchants read nothing and platform staff read all; nobody signed in can update or delete; anonymous visitors get nothing.
- `src/features/scheduled-checkouts/server/scheduled-checkouts-repository.test.ts`: a plan is queued with the right rows, or not at all; the open stores are exactly those the user may create orders in; a due checkout is placed as its creator at the planned time, with its first event at the same time; a future one waits; one 7 hours late is skipped; a refused order fails without stopping the next; two overlapping runs place each checkout once; one run places at most 10, oldest first.
- `src/routes/api/v1/scheduled-checkouts.test.ts`: the API queues a plan and answers the latest pending time and the open stores, and refuses a time in the past and an empty plan.
- `src/features/orders/server/orders-repository.test.ts`: a creation time given by server code dates the order, its expiry and its first event.
- `scripts/mcp-developer.test.ts`: the hosted allowlist accepts exactly the live app and a `<project-ref>.supabase.co` host over https, and refuses `http://`, ports, look-alike hosts, other hosts and local URLs.
