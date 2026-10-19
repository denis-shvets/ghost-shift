# How the Orders pages read from the database

A walkthrough of the commit `feat(orders): read orders from Supabase with Drizzle`, written for someone new to databases. Read it top to bottom once, then use the "Try it yourself" section with Supabase Studio open.

## 1. The big picture

Before this change, the Orders pages showed data typed into `src/mocks/data.ts`. Nothing could change it except editing code. Agents need to change orders (capture, refund, cancel), and those changes must survive a page reload and be seen by everyone. That needs a **database**: a program that stores data on disk and lets many users read and change it safely at the same time.

What happens now when you open order MG-1003, at `/orders/29fb84e7-03da-44f2-9389-dbbe9e12d3f3`:

```
Browser
  │  asks for /orders/29fb84e7-…
  ▼
Route file            src/routes/orders/$orderId.tsx
  │  its loader calls fetchOrder("29fb84e7-…")
  ▼
Server function       src/features/orders/server/functions.ts
  │  runs on the server only; opens a database connection
  ▼
Repository            src/features/orders/server/orders-repository.ts
  │  builds the SQL queries with Drizzle
  ▼
withUser(user)       src/shared/db/client.ts
  │  tells the database "treat these queries as this signed-in user"
  ▼
Postgres (Supabase)   tables orders and order_lines
     checks row-level security, returns the rows
```

The answer travels back up the same way, and the page renders it.

## 2. Words you'll meet

| Word                         | Meaning here                                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Postgres**                 | The database program. Supabase runs it for us.                                                                                                                                         |
| **Table**                    | Like a spreadsheet sheet: `orders` is one table, `order_lines` another.                                                                                                                |
| **Row**                      | One record, like one order.                                                                                                                                                            |
| **Column**                   | One field of every row, like `status` or `total_amount`. Each column has a type (text, integer, timestamp).                                                                            |
| **Primary key**              | The column that uniquely identifies a row. For orders it's `id`, a uuid.                                                                                                               |
| **Foreign key**              | A column that points to a row in another table. `order_lines.order_id` points to `orders.id`, so a line always belongs to an existing order.                                           |
| **UUID**                     | A random id like `29fb84e7-03da-44f2-9389-dbbe9e12d3f3`. The database generates it, it's unique without any coordination, and it doesn't reveal how many orders exist.                 |
| **Check constraint**         | A rule a value must pass before the database stores it, for example "exactly 3 capital letters".                                                                                       |
| **Generated column**         | A column the database calculates from other columns in the same row, like `total_amount = unit_price * quantity`. Nobody can write to it, so it can never be wrong.                    |
| **Basis points**             | Hundredths of a percent, stored as a whole number. 2500 basis points = 25 %, 2550 = 25.5 %.                                                                                            |
| **Enum**                     | A column type that only allows a fixed list of values. `order_status` only allows `authorized`, `captured` and so on, so a typo can't get into the data.                               |
| **SQL**                      | The language databases understand: `select * from orders where reference = 'MG-1003'`.                                                                                                 |
| **ORM**                      | A library that lets you write queries in TypeScript instead of SQL strings, with type checking. We use **Drizzle**.                                                                    |
| **Migration**                | A SQL file that changes the database structure (create a table, add a column). Migrations run in order, so every database (yours, CI's, the live one) ends up with the same structure. |
| **Seed**                     | Demo rows loaded into a fresh local database, so you always start from the same data.                                                                                                  |
| **Role**                     | Who the database thinks is asking. Supabase has `anon` (not signed in) and `authenticated` (signed in), plus admin roles.                                                              |
| **Row-level security (RLS)** | Rules stored in the database that decide which rows each role may see or change. Even if app code has a bug, the database refuses what the rules don't allow.                          |
| **Policy**                   | One RLS rule, for example "signed-in users may read orders".                                                                                                                           |
| **Grant**                    | Permission for a role to use a table at all, for example "anon may select from orders". Postgres checks the grant first, then the RLS policies decide which rows. Both must allow it.  |
| **Transaction**              | A group of queries that either all succeed or all fail together.                                                                                                                       |
| **Connection**               | An open line between the app and the database. Queries travel over it.                                                                                                                 |

## 3. What changed, file by file

### Supabase, running locally

**Why:** you need a real database on your machine to develop against, and it must be identical for you, the QA tester and CI.

- `supabase/config.toml` was created by `supabase init`. It describes the local stack: Postgres, Studio (the web UI), Mailpit (catches emails) and the rest. Docker runs each one as a container.
- I changed one thing in it: the **ports**. A port is the "door number" a program listens on. Supabase's defaults are 54320 to 54329, but Windows on your machine reserves 54286 to 54385 for Hyper-V, so the database couldn't open its door. They're now 64320 to 64329. The database is on 64322, Studio on 64323.
- `supabase/.gitignore` was also created by `supabase init`. It keeps Supabase's temporary files out of git.

### The schema: what the tables look like

**File:** `src/features/orders/db/schema.ts`

**Why:** the schema is the single description of the tables. Drizzle reads it to generate migrations and to type-check every query.

What it defines:

- Table **`stores`** (in `src/features/stores/db/schema.ts`): one row per store, with name, market (country), currency and status (`live` or `test`).
- Two **enums**: `order_status` (authorized, captured, part_captured, refunded, part_refunded, canceled, expired) and `payment_method` (card, invoice, wallet, bank_transfer).
- Table **`orders`**: one row per order, with reference, dates, store, shopper details, payment method, status, amounts and shipping.
- Table **`order_lines`**: one row per item in an order. `order_id` is a foreign key to `orders.id`, and `on delete cascade` means deleting an order also deletes its lines. `position` is 1 for the first item, 2 for the second. A database keeps rows in no guaranteed order, so without it the items could come back shuffled. Each order can only have one position 1, one position 2 and so on.

Each order line also has:

| Column             | What it holds                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `type`             | What the line is: `physical`, `digital`, `shipping_fee`, `discount` or `surcharge`. An enum, because it's a short list we control. |
| `sku`              | The merchant's stock-keeping unit, like `CND-SET-03`. Empty for lines that aren't products, such as shipping.                      |
| `quantity`         | How many. Must be more than 0.                                                                                                     |
| `unit_price`       | Price of one unit **including tax**, in minor units. Only discounts may be negative.                                               |
| `tax_rate`         | The tax rate in basis points, between 0 and 10000 (0 % to 100 %).                                                                  |
| `total_amount`     | **Generated:** `unit_price * quantity`.                                                                                            |
| `total_tax_amount` | **Generated:** the tax inside `total_amount`, rounded to the nearest öre or cent.                                                  |

**Why store a total at all, if it's just price × quantity?** You never type it: the database calculates it. Storing it means reports and sums don't repeat the math, and because it's a generated column, nobody can save a total that disagrees with the price and quantity. Tax is the same idea. EUR 80.00 including 25.5 % VAT holds 80 × 25.5 / 125.5 = EUR 16.25 of tax, and the database rounds it once, the same way every time.

**Why prices include tax:** that's what shoppers see and pay in Europe, and payment providers usually send it that way. The tax is worked out backwards from the price.

Choices worth knowing:

- **Ids are uuids, and `reference` is for humans.** Every `id` is a uuid the database generates. People see and search by `reference` (`MG-1003`). The seed data uses fixed uuids so links and tests stay the same after every reset.
- **An order must use its store's currency.** The foreign key on `orders` points at the store **and** its currency together, `(store_id, currency)` → `stores(id, currency)`. An order in the Swedish store with currency EUR is refused. That's why `stores` has a unique rule on `(id, currency)`: a foreign key can only point at columns that are unique together.
- **Currency and country codes are text with check constraints, not enums.** Postgres lets you add values to an enum but not easily remove or rename them, and there are about 180 currencies and 250 countries in the ISO standards. So `currency` must be exactly 3 capital letters (`SEK`) and `shopper_country` and `market` exactly 2 (`SE`).
- **Shipping is temporary.** `shipping_carrier` and `shipping_tracking` will move to a `shipments` table when shipping is built, because one order can ship in several parcels.

- **Money is stored as whole numbers in minor units.** SEK 1,290.00 is stored as `129000` öre. Computers can't store most decimals exactly (0.1 + 0.2 isn't exactly 0.3), so payment systems count the smallest unit as an integer. The currency is a column on the order.
- **Lines are a separate table, not a list inside the order.** An order can have any number of lines, and a separate table lets the database check each one and lets us query lines on their own later (for example "best-selling items").

**Every rule has a name** following `<table>_<what it covers>_<kind>`, with the kind `_fk` (foreign key), `_check` or `_unique`. The name is what appears in the error when the rule refuses a change. For example, `orders_store_currency_fk` tells you straight away it's the store-and-currency link on `orders` ([ADR 0006](../adr/0006-drizzle.md)).

**RLS policies** sit at the bottom of each table, next to the checks. Reading is for signed-in users who hold the `orders.read` permission for the order's store: "members can read orders in their stores" calls `has_permission('orders.read', store_id)`. Only platform developers may insert orders (`orders.create`, see below). Update and delete aren't allowed for anyone yet, and the migrations revoke those privileges outright, so even a buggy page can't change existing orders. When more writes arrive, write policies will say exactly who may capture or refund. See [Sign-in and policies](auth-and-policies.md).

### The migration: turning the schema into real tables

**Files:** `supabase/migrations/20261018012528_orders_and_stores.sql`, plus `supabase/migrations/meta/` (Drizzle's bookkeeping)

**Why:** the schema file is TypeScript, but the database only understands SQL. `pnpm db:generate` compares `schema.ts` with the last known state and writes the SQL needed to get there. Open the `.sql` file: you'll see `CREATE TABLE`, `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY`, matching the schema line by line.

The file name starts with a timestamp so migrations always run in the order they were made. The Supabase CLI applies everything in `supabase/migrations/` on `pnpm db:start` and `pnpm db:reset`, and will apply the same files to the hosted project.

**Rule:** never edit a migration that has been applied somewhere. Change `schema.ts` and generate a new one.

**Config:** `drizzle.config.ts` tells Drizzle Kit where the schemas are (`src/features/*/db/schema.ts`), to write migrations into `supabase/migrations/` in Supabase's naming style, and that Supabase manages the roles (`anon`, `authenticated`), so it shouldn't try to create them.

### Grants: letting the roles in at all

**File:** `supabase/migrations/20261018022342_grant_read_access.sql`

**Why:** Postgres checks two things before a role can read a row. First the **grant**: may this role use the table at all? Then the **RLS policies**: which rows may it see? Local Supabase grants the API roles access to new tables automatically, but newer hosted projects don't. On the first deploy that made the live site fail with "permission denied", even though the policies allowed reading.

This hand-written migration first granted `select` on `stores`, `orders` and `order_lines` to `anon` and `authenticated`, so every database behaved the same. A later migration took `anon` off those tables and gave `authenticated` read access only. Later, `orders_create_access` added an insert grant on `orders` and `order_lines` for `authenticated` only. Update and delete grants still don't exist, so those are refused before RLS even looks. Drizzle can't generate grants, so every new table needs a migration like this, made with `pnpm db:generate --custom --name <name>` ([ADR 0006](../adr/0006-drizzle.md)).

### Creating orders: what gets inserted

**File:** `supabase/migrations/20261019015532_orders_create_access.sql`

**Why:** an insert is the first write into a table. Three things must line up: the grant (may `authenticated` insert?), the `with check` policy (is this row allowed?) and the table's own rules (is the data valid?). Here is the step-by-step:

1. The app sends one row for `orders`: `reference`, `store_id`, `currency`, shopper name, email and country, payment method, `status`, `total_amount`, `shipping_carrier`. Captured and refunded amounts are left out, so they take their defaults of 0.
2. Postgres checks the grant. `authenticated` has `insert` on `orders`, but no update or delete.
3. Postgres runs the `with check` policy on the row. `has_permission('orders.create', store_id)` must be true, which is only the case for `platform_developer`.
4. The database checks the row's own rules. The currency must match the store's currency (the foreign key `orders_store_currency_fk`), and the country code must be two capital letters.
5. For each line, the app inserts a row into `order_lines`: `order_id`, `position` (1, 2, 3 and so on), `type`, `sku`, `name`, `quantity`, `unit_price` and `tax_rate`. The line policy then checks that the user can read the order.

The app never inserts `total_amount` or `total_tax_amount` on `order_lines`. They are **generated columns**: Postgres computes them from `unit_price`, `quantity` and `tax_rate` on every save, so they can't disagree with the line. Writing a value to them is an error. The order's own `total_amount` is still sent by the app, and no rule yet checks it against the sum of its lines.

### The seed: demo data

**File:** `supabase/seed.sql`

**Why:** every fresh local database, and every QA round, should start from the same known data. It's the same four orders the mock pages showed, converted to minor units. `pnpm db:reset` wipes the local database, re-runs all migrations and loads this file again.

### Connecting from the app

**File:** `src/shared/db/client.ts`

**Why:** every feature needs the same two things, so they live in `shared/`.

- `createDb(url)` opens a connection using **postgres.js** (the driver that actually speaks to Postgres) and wraps it with Drizzle. Two settings matter:
  - `max: 1`: Cloudflare Workers can't reuse a connection between requests, so each request opens its own and closes it when done.
  - `prepare: false`: the hosted Supabase connection will go through a "pooler" that shares database connections between many clients, and it doesn't support prepared statements. Turning them off now means local and live behave the same.
- `withUser(db, user, run)` does the same, but runs `set local role authenticated` and tells Postgres who the signed-in user is. The user's claims travel as a setting for that transaction only, so RLS can see them. Order pages use this.
- `withRole(db, role, run)` starts a **transaction**, runs `set local role anon` inside it, then runs your queries. Only the anonymous-access tests use it.
- Both start a **transaction**, which is why `local` matters: the role and the claims last only until the transaction ends, so they can't leak into the next request. `local` means the role only lasts until the transaction ends, so it can't leak into the next request. This is what makes RLS apply: the app connects as the `postgres` admin user, which ignores RLS, so every query from a page **must** go through `withRole`. Forgetting it would silently skip the rules, which is why the ADR and the feature README repeat it.

### The queries

**File:** `src/features/orders/server/orders-repository.ts`

**Why:** keeping queries in plain functions that take a database as an argument makes them easy to test without a browser or the Workers runtime.

- `listOrders(db, user, { limit, cursor })` selects only the columns the list page needs, newest first, one page at a time (see "Pages and indexes" below).
- `getOrder(db, id)` first checks that `id` looks like a uuid (`src/shared/ids/is-uuid.ts`). A mistyped link then shows "Order not found" instead of a database error. It then reads the order joined with its store's name, and the lines ordered by `position`, inside the same transaction. It returns `null` if the order doesn't exist.

Both run as the signed-in user. The server function checks the sign-in cookie first and sends anyone else to the login page. The return types come from the queries themselves, so if a column changes, TypeScript points at every page that used it.

### Pages and indexes

**Files:** `src/features/orders/model/order-list-input.ts`, `supabase/migrations/20261018215118_orders_list_index.sql`, `src/features/orders/db/schema.ts`

**Why:** the list used to load every order at once. The page now asks for 50 at a time, and the database finds each page without sorting the whole table.

- **Index.** An index is a sorted copy of some columns, kept by the database, so it can jump straight to the rows it needs. Without one, Postgres reads every row and sorts them on each request. `orders_created_at_id_idx` stores `created_at` and `id`, both newest first. The migration is one line: `create index … on orders (created_at desc, id desc)`. Drizzle writes it because the index is declared in `schema.ts`. The `id` is there to break ties, as explained next.
- **Cursor.** A cursor is the `id` of one order: the last order on the page for "Next page", or the first for "Previous page". The database looks up that order's `created_at` in the same query and compares against it. This is "keyset" paging. An offset (`skip 50`) gets slower on later pages, and it can skip or repeat orders when new ones arrive.
- **Why the id.** Two orders can share a `created_at`. Comparing on `created_at` alone could put one of them on both pages or on neither. The pair `(created_at, id)` is always unique, so every order appears exactly once.
- **Going back.** "Previous page" reads the orders newer than the cursor, nearest first, then flips them back to newest first. Without a cursor there is nothing to go back from, so the first page is shown.
- **Checking.** The list asks for one extra row in the direction it is reading. If it comes back, there is another page that way and its link is set. Going forward from a cursor, a previous page always exists. A malformed cursor fails in the validator (`order-list-input.ts`) before any query runs.
- **Deleted orders.** If the order behind a cursor is deleted, the page comes back empty. This is fine for now, because orders aren't deleted yet.
- **What the index does not do.** Row-level security still runs the `has_permission` check for each row it reads. An index only reduces how many rows reach that check. Measuring it is a separate follow-up.

### Server functions: the bridge between page and database

**File:** `src/features/orders/server/functions.ts`

**Why:** the database address and password must never reach the browser. A TanStack Start **server function** looks like a normal function to the page, but its body only runs on the server. The browser just sends a small request and gets the result back.

- `fetchOrders` and `fetchOrder` read `DATABASE_URL` from the Worker's environment, call the repository, and always close the connection in `finally`, even when a query fails.
- **Input is checked with [Zod](https://zod.dev/).** A server function is a public HTTP endpoint, so anyone can call it directly with any input. A TypeScript type like `(id: string)` disappears when the code runs and checks nothing. `.validator(orderIdInput)` uses a Zod schema (`src/features/orders/model/order-id-input.ts`) that really rejects anything that isn't a string of 1 to 100 characters. Whether it's a valid uuid is still decided by `getOrder`, so a bad link shows "Order not found" rather than an error.
- **Settings are checked with Zod too.** `src/shared/env/server-env.ts` checks that `DATABASE_URL` exists and is a `postgres://` or `postgresql://` URL. If it's missing, the page fails right away with "DATABASE_URL is required. Locally, copy .dev.vars.example to .dev.vars." instead of a confusing connection error.

Zod only guards data coming **in** from outside. Data coming back from the database is already typed by Drizzle, and calls between our own functions are typed by TypeScript.

**Where `DATABASE_URL` comes from:**

- Locally: `.dev.vars`, which you copy from `.dev.vars.example`. It's in `.gitignore`. The local value is Supabase's standard local password, which only works on your machine.
- Live: a Cloudflare secret, set with `wrangler secret put`, in the next step. Never in the repo.

**Types:** `worker-configuration.d.ts` is generated by `pnpm cf:types` from `wrangler.jsonc` and `.dev.vars`, so TypeScript knows `env.DATABASE_URL` exists. `src/cloudflare-workers.d.ts` declares the `cloudflare:workers` module by hand. The full Cloudflare types file is 600 KB, and we only need one export from it.

### The pages

**Files:** `src/routes/orders/index.tsx`, `src/routes/orders/$orderId.tsx`

**Why:** routes stay thin ([ADR 0012](../adr/0012-feature-structure.md)). Each one has a `loader` that calls a server function before the page renders, and then shows the result. If `fetchOrder` returns `null`, the loader throws `notFound()`, which shows "Order not found." with a 404 status.

Routes import straight from the file that defines what they need, for example `~/features/orders/server/functions`. The project doesn't use barrel files (`index.ts` files that only re-export), so every import shows exactly where the code lives ([ADR 0012](../adr/0012-feature-structure.md)).

### Formatting money

**File:** `src/features/orders/model/money.ts`

Turns `129000` + `SEK` into `SEK 1,290.00` by dividing by 100 and letting the browser's `Intl.NumberFormat` add the symbol and separators.

### Tests

**Files:** `src/features/orders/model/money.test.ts`, `src/features/orders/server/orders-repository.test.ts`, `vitest.config.ts`

**Why:** tests sit next to the code they check ([ADR 0012](../adr/0012-feature-structure.md)).

- `money.test.ts` checks the formatting, including negative amounts. `Intl` puts a no-break space between `SEK` and the number, which looks like a normal space but isn't, so the test spells it as ` `.
- `orders-repository.test.ts` runs the real queries against the local database with seed data, through `withUser`, as a merchant. It also proves one company can't read another company's orders. `schema.test.ts` proves an anonymous visitor can't read orders, order lines or stores, and that each role sees only what it's allowed to. It checks the order of results, the lines of one order, and that an unknown id returns `null`.
- `vitest.config.ts` is separate from `vite.config.ts` so tests run in plain Node, without the Cloudflare runtime.

### CI

**File:** `.github/workflows/ci.yml`

After lint, format, types and build, CI starts **only the database container** (the `-x` list excludes Studio, Mailpit and the rest, which tests don't need) and runs `pnpm test`. It's last because it's the slowest step, so quick mistakes fail first.

### Scripts and settings

- `package.json` scripts: `test`, `test:watch`, `db:start`, `db:stop`, `db:reset`, `db:generate`, `cf:types`.
- New packages, all pinned exactly: `drizzle-orm` (queries), `postgres` (driver), `zod` (input checks), `drizzle-kit` (migrations), `supabase` (CLI), `vitest` (tests).
- `.gitignore` adds `.dev.vars`. `.oxfmtrc.json` stops the formatter from touching generated files. `tsconfig.json` includes the new config and type files.
- ADRs 0005, 0006, 0009, 0010 and 0012 now describe the real commands, the migrations folder and `withRole`.

## 4. What's deliberately not done yet

- **Reads follow roles, but nothing changes orders yet.** Each company sees its own orders, and agents see their stores. Write rules come with the write features. See [Sign-in and access](auth-and-policies.md).
- **Only inserts, and only for developers.** Platform developers can create orders. Capture, refund and cancel are still disabled buttons.
- The dashboard and other pages still use `src/mocks/data.ts`.

## 5. Try it yourself

With `pnpm db:start` and `pnpm dev` running:

1. Open Studio at <http://127.0.0.1:64323>, then **Table Editor → orders**. These are the rows the page shows.
2. Change `shopper_name` on order `MG-1003` in Studio and reload <http://localhost:3000/orders>. The page shows your change.
3. In Studio, open **SQL Editor** and run:
   ```sql
   select reference, status, total_amount / 100.0 as total, currency from orders order by created_at desc;
   ```
4. See the rules at work. Run this in the SQL Editor:
   ```sql
   set role anon;
   select reference from orders;
   ```
   It fails with `permission denied for table orders`. Anonymous visitors have no access at all now. Then try a write as a signed-in user:
   ```sql
   set role authenticated;
   update orders set status = 'canceled' where reference = 'MG-1001';
   ```
   It fails with `permission denied` too, because writes are revoked. Run `reset role;` afterwards.
5. Try to break the rules. Each of these fails, and the error names the rule:
   ```sql
   update orders set status = 'lost' where reference = 'MG-1001';         -- not in the enum
   update orders set shopper_country = 'se' where reference = 'MG-1001';  -- check constraint: 2 capital letters
   update orders set currency = 'EUR' where reference = 'MG-1001';        -- foreign key: the Swedish store uses SEK
   update order_lines set total_amount = 1 where sku = 'LAN-BRS-01';       -- generated column: can't be written
   update order_lines set quantity = 0 where sku = 'LAN-BRS-01';           -- check constraint: quantity must be > 0
   ```
6. Look at the index. Run this in the SQL Editor:
   ```sql
   explain select reference from orders order by created_at desc, id desc limit 51;
   ```
   Look for `orders_created_at_id_idx` in the plan. On a table this small Postgres may still choose a plain scan, because it's faster than the index here. That's fine: the index is for when the table grows.
7. Put everything back with `pnpm db:reset`.

## 6. Where to read more

- [Supabase: Postgres basics](https://supabase.com/docs/guides/database/overview)
- [Supabase: Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Drizzle: Schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Drizzle: Migrations](https://orm.drizzle.team/docs/migrations)
- [TanStack Start: Server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
