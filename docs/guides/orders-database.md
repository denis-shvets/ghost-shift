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
- Two **enums**: `order_status` (authorized, captured, part_captured, expired, canceled, refunded) and `payment_method` (amazon_pay, amex, apple_pay, bank_transfer, card, google_pay, paypal). Section 4 explains how these changed.
- Table **`orders`**: one row per order, with reference, dates, store, customer details, payment method, status, amounts and shipping.
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
- **Currency and country codes are text with check constraints, not enums.** Postgres lets you add values to an enum but not easily remove or rename them, and there are about 180 currencies and 250 countries in the ISO standards. So `currency` must be exactly 3 capital letters (`SEK`) and `market` and `order_addresses.country` exactly 2 (`SE`).
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

1. The app sends one row for `orders`: `reference`, `store_id`, `currency`, customer first name, last name, email and phone, payment method, `status`, `total_amount`, `shipping_carrier`. Captured and refunded amounts are left out, so they take their defaults of 0. Addresses and timeline events go into their own tables (section 4).
2. Postgres checks the grant. `authenticated` has `insert` on `orders`, but no update or delete.
3. Postgres runs the `with check` policy on the row. `has_permission('orders.create', store_id)` must be true, which is only the case for `platform_developer`.
4. The database checks the row's own rules. The currency must match the store's currency (the foreign key `orders_store_currency_fk`), and the country code must be two capital letters.
5. For each line, the app inserts a row into `order_lines`: `order_id`, `position` (1, 2, 3 and so on), `type`, `sku`, `name`, `quantity`, `unit_price` and `tax_rate`. The line policy then looks up the line's order and checks `has_permission('orders.create', ...)` for that order's store, so someone who can only read orders can't add lines to them.

The app never inserts `total_amount` or `total_tax_amount` on `order_lines`. They are **generated columns**: Postgres computes them from `unit_price`, `quantity` and `tax_rate` on every save, so they can't disagree with the line. Writing a value to them is an error. The order's own `total_amount` is still sent by the app. The database only checks that it isn't negative (see below); no rule yet checks it against the sum of its lines.

### The seed: demo data

**Files:** `supabase/seed.sql` (organizations and stores) and `supabase/seed-orders.sql` (orders, lines, addresses and timelines)

**Why:** every fresh local database, and every QA round, should start from the same known data. `pnpm db:reset` wipes the local database, re-runs all migrations and loads both files again, in the order `supabase/config.toml` lists them.

`seed-orders.sql` is generated, not written by hand: `pnpm db:generate-seed` runs `scripts/generate-seed-orders.ts`, which builds fixed demo orders plus random ones with Faker. Faker always starts from the same seed number, so the output is the same on every run. Addresses use the store's own country (Swedish streets for the Swedish store, and so on). A test fails if the file and the generator disagree, so after changing the script, run `pnpm db:generate-seed` and commit the new file.

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

### Why amounts are `bigint` now

**File:** `supabase/migrations/20261019160725_orders_amounts_bigint.sql`

**Why:** a plain `integer` in Postgres holds numbers up to 2,147,483,647 (about 2.1 billion). A line's total is `unit_price * quantity`, and with the limits now allowed (quantity up to 10,000, price up to 10,000,000 minor units) one line can reach 100 billion. An order with several such lines can go higher still. With `integer`, the insert fails and the request returns a 500 error.

`bigint` holds numbers up to about 9.2 quintillion, far above any order. The migration does four things:

1. Changes `orders.total_amount`, `captured_amount` and `refunded_amount` to `bigint`.
2. Changes `order_lines.total_amount` and `total_tax_amount` to `bigint`. Postgres can't change a generated column's formula in place, so the migration drops and re-adds both. They're recalculated from the rows, so no data is lost.

   Each table gets a single `ALTER TABLE` statement that lists all its changes. Changing a column's type makes Postgres copy the whole table, and it locks the table while it does that. One statement per table means one copy and one lock, not one per column.

3. Adds `::bigint` to the formulas. Without it, `unit_price * quantity` is still calculated as an `integer` first and overflows before the result is stored.
4. Leaves `unit_price` and `quantity` as `integer`. Their own values already fit, and the Zod limits keep them within range.

In `schema.ts`, Drizzle reads these as JavaScript numbers (`mode: "number"`). That's safe up to about 9 quadrillion, far above any order.

### Why an order total can't be negative

**File:** `supabase/migrations/20261019173355_orders_total_not_negative.sql`

**Why:** discount lines have negative prices. Without a rule, an order with only a discount line (say -50.00) would be saved as an authorized order with a total of -50.00. Later capture and refund code would then have to cope with a payment that owes the shopper money.

The fix has two layers, step by step:

1. `createOrderInput` (Zod) adds up the lines with `orderTotal` and rejects the request when the sum is below zero. The caller gets a clear 400 error: "The order total cannot be negative".
2. The migration adds a **check constraint** `orders_total_amount_not_negative_check`: `total_amount >= 0`. This is the safety net. If some other code path ever sends a negative total, Postgres refuses the row, whatever the app thought.

A total of exactly zero is still allowed, for example a product fully covered by a discount.

## 4. The customer, address and timeline change (2026-10-19)

This section explains the changes in commit `feat(orders): add customer, addresses, timeline and real payment methods`. The three migrations are `20261019201345_orders_customer_timeline.sql`, `20261019201403_orders_drop_shopper.sql` and `20261019201404_orders_customer_timeline_access.sql`. Each part below gives the what, the why and the steps.

### a. Customer columns

**What:** the four `shopper_*` columns on `orders` are now `customer_first_name`, `customer_last_name`, `customer_email` and `customer_phone`. The name and email columns are required.

**Why the rename:** "shopper" was a word from the mock pages. "Customer" is the word merchants use, and it names the role the person plays in the order. The phone number is new and optional.

**Why the name is split:** a first name and a last name are easier to sort, search and print than one text field. The shipping address (section b) can still show a different recipient, so the customer is the person who bought, not always the person who receives.

### b. `order_addresses`: one row per kind

**What:** a new table holds the billing address and the shipping address. Each order has one row of each kind.

```sql
CREATE TYPE "public"."address_kind" AS ENUM('billing', 'shipping');
CREATE TABLE "order_addresses" (
	"order_id" uuid NOT NULL,
	"kind" "address_kind" NOT NULL,
	...
	CONSTRAINT "order_addresses_pk" PRIMARY KEY("order_id","kind"),
	CONSTRAINT "order_addresses_country_format_check" CHECK ("order_addresses"."country" ~ '^[A-Z]{2}$')
);
```

**The composite primary key:** `(order_id, kind)` is the key. A primary key is the column (or pair) that identifies a row. Here the pair must be unique, so one order can have only one `billing` row and one `shipping` row. A third address is refused by the database. The key also makes "the billing address of order X" a single, fast lookup.

**Why two rows, not two columns on `orders`:** the create form has a "same as billing" checkbox. When it is ticked, both rows are still stored, with the same values. The app does this, so later code never has to ask "is there a shipping address, or should I use billing?". A separate table is also easy to restrict later. A policy on `order_addresses` alone can hide addresses from a support role, without touching the order's own columns.

**Steps the app follows when an order is created:**

1. Insert the row for `orders`.
2. Insert one row with `kind = 'billing'`.
3. Insert one row with `kind = 'shipping'`, copied from billing if the checkbox is ticked.

Note: the database does not force every order to have both rows. Nothing stops an order with no address rows at all. This is why orders from before this change show no addresses (see section j).

### c. Changing an enum

**What:** Postgres enums are fixed lists, like `order_status`. You can add a value to an enum, but Postgres cannot remove one. To drop `part_refunded` and `invoice` or `wallet`, the migration rebuilds each enum.

**The steps, using the real SQL from `20261019201345_orders_customer_timeline.sql`:**

1. **Turn the column into plain text.** Postgres won't drop a type that a column still uses, and it can't easily rewrite the column in place. Text can hold anything for now.
   ```sql
   ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;
   ```
2. **Map the old values.** Rows still holding a value that is going away must move to a value that stays. Only `part_refunded` goes, so the migration works out the right status from the amounts:
   ```sql
   UPDATE "orders" SET "status" = CASE WHEN "captured_amount" = "total_amount" THEN 'captured' ELSE 'part_captured' END WHERE "status" = 'part_refunded';
   ```
3. **Drop the old type and create the new one.** Now no column uses it, so the drop works.
   ```sql
   DROP TYPE "public"."order_status";
   CREATE TYPE "public"."order_status" AS ENUM('authorized', 'captured', 'part_captured', 'expired', 'canceled', 'refunded');
   ```
4. **Cast back to the enum.** `USING` says how to turn each text value into the new type. If any row still held a value outside the new list, this step would fail. That is a safety net: the migration cannot quietly keep a bad value.
   ```sql
   ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";
   ```

`payment_method` follows the same four steps. The mapping is `invoice` → `bank_transfer` and `wallet` → `paypal`, and the new list is `amazon_pay`, `amex`, `apple_pay`, `bank_transfer`, `card`, `google_pay`, `paypal`.

**Why the status is not `part_refunded` any more:** an order can be partly captured and partly refunded at the same time. One status cannot say both, so the status follows only the authorization, and refunds are read from `refunded_amount` (section i).

### d. Moving data inside a migration

**What:** the shopper data moves into the customer columns, then the old columns are removed. It happens in two migrations, in this order:

1. `20261019201345`: add the new columns, copy the data, then make the new columns required.
2. `20261019201403`: drop the `shopper_*` columns.

**The steps in migration 1:**

1. Add the columns **without** `NOT NULL`, so existing rows are allowed to have no value yet.
   ```sql
   ALTER TABLE "orders"
     ADD COLUMN "customer_first_name" text,
     ADD COLUMN "customer_last_name" text,
     ADD COLUMN "customer_email" text,
     ADD COLUMN "customer_phone" text;
   ```
2. Backfill: copy the data with `UPDATE`. `btrim` removes spaces at the start and end of the name first. `split_part(text, ' ', 1)` takes the first word. The last name is everything after the first space:
   ```sql
   UPDATE "orders" SET
     "customer_first_name" = coalesce(nullif(split_part(btrim("shopper_name"), ' ', 1), ''), '-'),
     "customer_last_name" = coalesce(nullif(substr(btrim("shopper_name"), length(split_part(btrim("shopper_name"), ' ', 1)) + 2), ''), '-'),
     "customer_email" = "shopper_email";
   ```
   For "Anna Karin Berg", the first name is `Anna` and the last name is `Karin Berg`. Without `btrim`, " Erik Holm" (with a leading space) would give an empty first name, because the first "word" is the empty text before the space. `nullif(x, '')` turns an empty result into `NULL`, and `coalesce(x, '-')` turns `NULL` into `-`. So a one-word name gets `-` as its last name, an empty name gets `-` for both, and the app's rule that names are never empty still holds for old rows.
3. Make the columns required, once every row has a value:
   ```sql
   ALTER TABLE "orders"
     ALTER COLUMN "customer_first_name" SET NOT NULL,
     ALTER COLUMN "customer_last_name" SET NOT NULL,
     ALTER COLUMN "customer_email" SET NOT NULL;
   ```
4. Copy the shopper's country into `order_addresses`, one billing and one shipping row per order. Old orders never had a street, postal code or city, so those get `-`:
   ```sql
   INSERT INTO "order_addresses" ("order_id", "kind", "first_name", "last_name", "street_address", "postal_code", "city", "country")
   SELECT "orders"."id", "kinds"."kind", "customer_first_name", "customer_last_name", '-', '-', '-', "shopper_country"
   FROM "orders" CROSS JOIN (VALUES ('billing'::"address_kind"), ('shipping'::"address_kind")) AS "kinds" ("kind");
   ```
   `CROSS JOIN` pairs every order with both rows of the little `VALUES` list, so each order gets two addresses. This must run in migration 1: migration 2 drops `shopper_country`, and after that the country is gone for good.
5. Start every old order's timeline with its authorization, the same row `createOrder` writes for a new order:
   ```sql
   INSERT INTO "order_events" ("order_id", "occurred_at", "action", "actor_name", "metadata")
   SELECT "id", "created_at", 'authorized', 'Phantom Checkout', jsonb_build_object('amount', "total_amount") FROM "orders";
   ```
   `INSERT ... SELECT` adds one row per order the `SELECT` returns. The event is dated when the order was created, and `jsonb_build_object` builds the metadata `{"amount": <total>}`. `actor_user_id` is left empty, because the provider did it, not a person. Without this step, old orders would show an empty timeline. Later captures or refunds of old orders aren't recorded anywhere, so they can't be rebuilt; only the authorization is certain.

**Why the order matters:**

- Making the columns `NOT NULL` before the backfill would fail on every existing row, because they are still empty.
- Dropping the `shopper_*` columns before the backfill would lose the data for good.
- Dropping them in a **second** migration means old code, which still reads `shopper_*`, keeps working until the app is switched over. The data is safe as long as both sets of columns exist.

The same pattern is used for `expires_at`. Adding it with a default fills existing rows with "now plus 28 days", so the migration then sets each row from its real creation date: 7 days for card and wallet payments, 28 for the rest (section f).

```sql
"expires_at" = least(
  "created_at" + CASE WHEN "payment_method" IN ('card', 'amex', 'apple_pay', 'google_pay') THEN interval '7 days' ELSE interval '28 days' END,
  CASE WHEN "status" = 'expired' THEN now() ELSE 'infinity'::timestamptz END
),
```

`least` picks the earlier of two times. For an order that has already expired, the second value is `now()`, so its expiry can never land in the future. For any other order the second value is `infinity`, so the first one always wins.

### e. Generated columns: `uncaptured_amount`

**What:** `uncaptured_amount` is the part of the authorization still left to capture:

```sql
ALTER TABLE "orders" ADD COLUMN "uncaptured_amount" bigint GENERATED ALWAYS AS (total_amount - captured_amount) STORED NOT NULL;
```

**Why nobody can write it:** `GENERATED ALWAYS` means Postgres computes the value on every save. Writing to it is an error:

```sql
update orders set uncaptured_amount = 5 where reference = 'MG-1001';
-- ERROR: column "uncaptured_amount" can only be updated to DEFAULT
```

**Why this is useful:** a stored column can drift. If capture code forgot to update a separate `uncaptured_amount`, reports would be wrong and nobody would notice. A generated column can never disagree with `total_amount` and `captured_amount`, because it is always recalculated from them. The same idea is used for the line totals (section 3).

`STORED` means the value is saved on disk, so queries can read it without doing the sum each time. This matters for the dashboard totals in section 4k.

### f. `expires_at` and the check constraints

**What:** `expires_at` is when the authorization runs out: 7 days after the order is created for card, Amex, Apple Pay and Google Pay, 28 days for the others. The rule lives in `src/features/orders/model/payment-methods.ts`. `createOrder` and the seed both use it, and the migration backfill repeats it in SQL. The column's default (28 days) is only a fallback for rows that don't send a value. Three checks guard the amounts and dates:

| Constraint                           | Rule                                       | Example that is rejected                                                                                      |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `orders_captured_amount_range_check` | `captured_amount` between 0 and `total`    | An order with total 1,000.00 (`100000`) and `captured_amount = 120000`. More is captured than was authorized. |
| `orders_refunded_amount_range_check` | `refunded_amount` between 0 and `captured` | Captured 600.00 (`60000`) and `refunded_amount = 70000`. More is refunded than was captured.                  |
| `orders_expires_after_created_check` | `expires_at > created_at`                  | `expires_at` set to one day before `created_at`. An authorization cannot expire before it exists.             |

Try them in Studio on a local order, with `update orders set captured_amount = 120000 where reference = 'MG-1001';` (adjust the amounts to that order's total). Each error names the rule, so you can see which one refused it.

**Why checks and not app code:** the app checks these too, but the database is the last place a bad value can be stopped. Any other program writing to the table is also covered.

### g. `order_events`: an append-only timeline

**What:** `order_events` is one row per thing that happened to an order: authorized, captured, refunded, canceled or expired. The timeline shows them in order.

**Append-only:** the table is only written to by adding rows. The migration `20261019201404_orders_customer_timeline_access.sql` does it in two steps:

```sql
revoke all on table public.order_addresses, public.order_events from anon, authenticated;
grant select, insert on table public.order_addresses, public.order_events to authenticated;
```

1. `revoke all` takes away every privilege first. Local Supabase hands out every privilege on a new table automatically, while hosted Supabase hands out none. Without this line, the two databases would behave differently.
2. `grant select, insert` then gives back only reading and adding rows.

The `revoke` matters most for `TRUNCATE` (empty the whole table). Row-level security doesn't apply to it, so the missing grant is the only thing that stops it. `schema.test.ts` checks update, delete and truncate.

There is no `update` or `delete` grant. Postgres refuses the change before RLS even looks, with `permission denied for table order_events`. So a mistake in the app cannot rewrite history.

**`actor_name` is a snapshot:** the row stores the name of the person who acted, as it was then. Other users cannot read `auth.users`, so the name cannot be looked up later. If the user is deleted, `actor_user_id` becomes `NULL` (`on delete set null`), but the name stays in the timeline. Because merchants can read the timeline, never put an email address here. The authorization written when a developer creates a test order says `Phantom Checkout`, the provider that authorized it, like the seed.

**`metadata` is jsonb:** `jsonb` is a column type that stores a JSON document. Each action needs different details, so one flexible column holds them. The shape for each action is defined in `src/features/orders/model/order-event.ts`:

| Action       | `metadata` shape                                                          |
| ------------ | ------------------------------------------------------------------------- |
| `authorized` | `{ amount }`                                                              |
| `captured`   | `{ amount, lines? }`, where `lines` is a list of `{ position, quantity }` |
| `refunded`   | `{ amount, reason?, lines? }`                                             |
| `canceled`   | `{ releasedAmount }`, the part of the authorization let go                |
| `expired`    | `{ releasedAmount, reason }`, the part of the authorization that ran out  |

**Why the database checks only that it's an object:**

```sql
CONSTRAINT "order_events_metadata_object_check" CHECK (jsonb_typeof("order_events"."metadata") = 'object')
```

The check stops arrays, numbers and text from being saved as metadata. Checking each shape in SQL would mean a long `CASE` for every action, and it would have to change with every new field. The shapes are checked by TypeScript in the app. Tests should cover them too, so a wrong shape is caught before it is saved. The trade-off: the database trusts the app for the exact fields.

### h. Row-level security for the new tables

**What:** `order_addresses` and `order_events` have no store of their own. Each row belongs to an order, so the policies ask about the order.

**Reading:** the policy says "if you can read the order, you can read its addresses and timeline":

```sql
create policy "members can read events of orders they can read" on public.order_events
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_events.order_id)
  );
```

The `exists` check reads `orders` as the signed-in user. The `orders` table has its own policy (`orders.read` for the store), so that policy applies inside this check. No new permission is needed. This is what "through the parent order" means.

**Writing:** `with check` is the rule a new row must pass. Adding a row needs `orders.create` for the order's store:

```sql
create policy "developers can create order events" on public.order_events
  for insert to authenticated with check (
    actor_user_id = (select auth.uid())
    and action = 'authorized'
    and exists (
      select 1 from public.orders o
      where o.id = order_id and public.has_permission('orders.create', o.store_id)
    )
  );
```

Today only `platform_developer` holds `orders.create`, so only developers can add addresses and events. The events policy has two more rules, read step by step:

1. `actor_user_id = (select auth.uid())`: the row must name the person adding it. `auth.uid()` is the signed-in user's id from the login token. Without this, a developer could write an event under a merchant's name.
2. `action = 'authorized'`: creating an order is the only thing that writes events today, and it only writes the authorization. So nobody can add a made-up refund to a real order. When capture, refund and cancel are built, this list grows with them.

`(select auth.uid())` instead of plain `auth.uid()` makes Postgres work out the id once per statement, not once per row. `schema.test.ts` tries both forbidden inserts. There are no update or delete policies, and no update or delete grants (see g).

### i. Status vs refunds

**What:** the status describes the authorization. The money moves are in three numbers: `total_amount`, `captured_amount` and `refunded_amount`.

**Example:** an order for 1,000.00, with 600.00 captured and 200.00 refunded:

| Field               | Value           | Meaning                               |
| ------------------- | --------------- | ------------------------------------- |
| `total_amount`      | 1,000.00        | the amount authorized                 |
| `captured_amount`   | 600.00          | taken from the customer               |
| `uncaptured_amount` | 400.00          | still can be captured (generated)     |
| `refunded_amount`   | 200.00          | given back from the 600.00 captured   |
| `status`            | `part_captured` | part of the authorization is captured |

The order is **partly captured** (the status) and **partly refunded** (the 200.00). Both are true at once, which is why `part_refunded` was removed.

For a `canceled` or `expired` order, `uncaptured_amount` is no longer something that can be captured: it is the part that was let go. The order page labels it **Released** for those two statuses, matching the `releasedAmount` in the timeline.

### j. Before pushing to the hosted database

**What to check first:** the migrations change existing rows on the live database. The owner should look at what is there before running `pnpm exec supabase db push`:

```sql
select status, payment_method, count(*) from orders group by 1, 2;
```

**What to look for:**

- Rows with `payment_method = 'invoice'` become `bank_transfer`. Rows with `wallet` become `paypal`. These are the only payment methods that change.
- Rows with `status = 'part_refunded'` become `captured` or `part_captured`, depending on whether everything was captured.
- Orders created before this change get a billing and a shipping address with their old country and `-` for street, postal code and city, and one "Authorized" timeline row dated when they were created (section d). Nothing else is guessed.

Run the push only when the counts match what you expect. The owner runs the push, not an agent.

### k. Questions for later

These are not decided yet. Each one is a question to answer before the feature that needs it.

#### Permissions

- **No new roles were added.** Addresses and events reuse `orders.read` and `orders.create` through the parent order.
- **Later:** `orders.capture`, `orders.refund` and `orders.cancel` will be new permissions. Each will need an insert policy on `order_events`, so only the right people can add those events.
- **Possibly:** `orders.read_customer`, to hide addresses and contact details from `agent_first_line`. That needs a policy on `order_addresses` only, which is the reason addresses are their own table.

#### Dashboard metrics

Always show each number per currency. Summing SEK and EUR together is wrong.

- Authorized, captured and refunded volume.
- Counts by status, and by payment method.
- Average order value.
- Capture rate, refund rate and expiry rate.
- Uncaptured exposure: the sum of `uncaptured_amount` for orders expiring in the next N days.
- Median time to capture, from `order_events` (the time between the `authorized` and `captured` rows).
- Orders per day.
- Top SKUs, by store and country.

#### Open points

- **GDPR erasure and retention:** customer names, emails and addresses are personal data. We need rules for deleting them on request and for how long to keep them.
- **An index for search by reference or email.** `reference` is unique, so it has an index already. Searching by `customer_email` does not.
- **The status and the amounts are not matched by the database.** For example, nothing stops `status = 'captured'` with `captured_amount = 0`. Only the range checks in section f apply.
- **Idempotency keys for API-created orders.** A retried request could create the same order twice. A key sent with each request would let the database refuse the duplicate.

## 5. The expiry job (2026-10-20)

An authorization only lasts so long: 7 days for card, Amex, Apple Pay and Google Pay, and 28 days for the rest (`expires_at`, section 4f). Before this change, nothing ever set `status = 'expired'`, so the pages guessed it from the date. Now the database does it itself, every 15 minutes. Everything is in one migration: `supabase/migrations/20261020001345_expire_orders.sql`. Why the database runs it, and not a Worker or an agent, is in [ADR 0016](../adr/0016-scheduled-jobs-pg-cron.md).

### a. Which orders expire

Only orders with `status = 'authorized'` (nothing captured) whose `expires_at` has passed.

- **Part captured** orders are left alone. Money was taken, so calling them "expired" would hide that. The rest of the authorization just can't be captured any more: the order page labels it Released instead of Uncaptured once `expires_at` has passed (section g). Capture has to check `expires_at` when it's built.
- **Captured, canceled, refunded, expired** orders are already done with their authorization.

### b. The index

```sql
create index orders_authorized_expires_at_idx on orders (expires_at) where status = 'authorized';
```

This is a **partial index**: it only holds the rows that match its `where`. The job asks for exactly those rows (`status = 'authorized' and expires_at <= now()`), so Postgres reads the index from the oldest expiry up to now and stops. Without it, every run would read every order, and most orders are long since captured or expired. Drizzle writes this line, because the index is declared in `schema.ts`; the rest of the migration is hand-written below it.

### c. pg_cron: a timer inside the database

```sql
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('expire-orders', '*/15 * * * *', 'select public.expire_orders()');
```

1. An **extension** is an add-on that ships with Postgres. `create extension` switches it on. Supabase includes `pg_cron` on the free plan.
2. `cron.schedule` saves a job: a name, a schedule and the SQL to run. `*/15 * * * *` is cron's way of writing "every 15 minutes". The five fields are minute, hour, day of month, month and day of week, and `*/15` means "every 15th minute".
3. The job runs as `postgres`, the owner of the tables.
4. If the same name is scheduled again, the job is updated instead of being added twice.

You can see the job with `select * from cron.job;` and its past runs with `select * from cron.job_run_details order by start_time desc;`.

### d. The function: one statement, two writes

```sql
with expired as (
  update public.orders set status = 'expired'
  where status = 'authorized' and expires_at <= now()
  returning id, created_at, expires_at, uncaptured_amount
), events as (
  insert into public.order_events (order_id, occurred_at, action, actor_name, metadata)
  select id, expires_at, 'expired', 'System', jsonb_build_object(
    'releasedAmount', uncaptured_amount,
    'reason', format('Authorization expired after %s days', round(extract(epoch from expires_at - created_at) / 86400))
  )
  from expired
  returning 1
)
select count(*)::integer from events;
```

Read it step by step:

1. `with expired as (update … returning …)` changes the status, and `returning` hands the changed rows to the next step, like a temporary table named `expired`. This is called a CTE (common table expression).
2. `events as (insert … select … from expired)` writes one timeline row for each of those orders.
3. The last `select` counts them, so a manual run tells you how many orders expired.

**Why one statement:** Postgres runs a statement completely or not at all. An order can't end up `expired` with no timeline row, even if something fails halfway.

**Why it can't double up:** an `update` locks the rows it changes. If two runs overlap, the second one waits for those locks, then checks `status = 'authorized'` again. The orders are `expired` by then, so it skips them.

**The timeline row:**

| Column          | Value                        | Why                                                                     |
| --------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `occurred_at`   | `expires_at`                 | When it actually ran out, not when the job noticed                      |
| `actor_user_id` | `null`                       | No person did it                                                        |
| `actor_name`    | `System`                     | The same name the seed uses for expiries                                |
| `metadata`      | `{ releasedAmount, reason }` | The amount let go, and for example "Authorization expired after 7 days" |

`expires_at - created_at` subtracts two timestamps, which gives an interval such as `7 days`. `extract(epoch from …)` turns it into seconds, and dividing by 86 400 (seconds in a day) and rounding gives whole days. Rounding matters: a plain `extract(day from …)` would cut 6 days 23 hours down to 6. So the 7/28-day rule isn't written out a second time. The seed (`scripts/generate-seed-orders.ts`) writes the same reason for its expired orders.

### e. Who may run it

```sql
revoke execute on function public.expire_orders() from public, anon, authenticated, service_role;
```

A new function in `public` can be called by everyone, and Supabase also grants it to `anon`, `authenticated` and `service_role` (the admin key). Without this line, any signed-in user could expire orders early through the API. Now only the owner can call it, and that includes pg_cron. Row-level security doesn't apply to the owner, so `orders` needs no update policy. Signed-in users still can't update orders at all.

### f. A trigger guards the status

A `check` constraint only sees the row as it will be saved. It can't ask "what was the status before?". A **trigger** can: it's a function Postgres runs automatically on every update, and it gets both the old row (`old`) and the new one (`new`).

```sql
if new.status is distinct from old.status
  and (old.status, new.status) not in (('authorized', 'expired'))
then
  raise exception … using errcode = 'check_violation';
end if;
```

Today one change is allowed: `authorized → expired`. Any other change is refused with the same error a check constraint gives. So an expired order can't come back, and a captured order can't be expired. Unlike row-level security, the trigger also applies to the owner. Capture, cancel and refund added their moves to this function: see section 6c.

### g. The pages

The pages now show `status` as the database stores it. The old helper that guessed "expired" from the date (`model/display-status.ts`) is gone. Between two runs (at most 15 minutes), an order can still show Authorized just after its expiry time. The timeline shows "Released SEK 230.00 – Authorization expired after 7 days".

One case still reads the date: a part-captured order past `expires_at` stays `part_captured` (section a), but the order page labels its uncaptured amount **Released**, because that money can't be captured any more.

### h. Tests

`src/features/orders/db/schema.test.ts`, block "expiring authorizations". Each test adds its own orders inside a transaction and rolls it back, so the seed isn't changed. The tests check:

- An expired order gets exactly one event, even after two runs.
- Open and part-captured orders are left alone.
- A developer can't call the function.
- The trigger refuses wrong status changes.
- The schedule exists.

## 6. Capture, cancel and refund (2026-10-20)

Migration: `supabase/migrations/20261020003438_orders_capture_cancel_refund.sql`. It lands after the expiry migration (section 5) and builds on its trigger.

Three actions move money on an order. Each one needs a reason, and every reason ends up on the timeline:

- **Capture:** take money from the authorization, all at once or in parts.
- **Cancel:** let go of what is left of the authorization. Money already captured stays captured.
- **Refund:** give captured money back, all at once or in parts.

### a. Where the amounts live

`orders` already had `captured_amount`, `refunded_amount` and the computed `uncaptured_amount` (section 4e), plus two check constraints:

- `orders_captured_amount_range_check`: captured is between 0 and the total.
- `orders_refunded_amount_range_check`: refunded is between 0 and what was captured.

These two already enforce "never capture more than was authorized, never refund more than was captured". So the running totals stay on `orders`, and each single capture or refund is one `order_events` row with its amount and reason.

The other option was a `captures` table and a `refunds` table, with one row per capture or refund. It was not chosen:

- A check constraint sees one row only. "The rows for this order add up to no more than the total" would need yet another trigger.
- The timeline already keeps one row per action, so the history exists.
- The risk with totals is that they disagree with the events. That can't happen here, because one function changes both in the same transaction, and nothing else may (section d).

A separate table becomes worth it when a capture needs its own data, for example a settlement id or the lines it covered.

### b. Three new permissions

```sql
insert into public.permissions (name, description) values
  ('orders.capture', …), ('orders.cancel', …), ('orders.refund', …);
```

These are given to the four roles that already had `orders.edit`: `platform_developer`, `merchant_admin`, `merchant_order_manager` and `agent_second_line`. First-line agents, platform operators and dispute handlers can still read orders, but they can't move money. The insert uses a `cross join`, which pairs every role with every permission, so the 12 rows aren't typed out one by one. See [Sign-in and access](auth-and-policies.md) for the full table.

### c. The trigger now knows every move

The trigger from section 5f is replaced (`create or replace function`) with the full rules. It also fires on every update now, not just when `status` changes, because a second partial capture changes only `captured_amount`:

```sql
drop trigger orders_status_transition_check on public.orders;
create trigger orders_status_transition_check
  before update on public.orders
  for each row execute function public.orders_status_transition_check();
```

The status moves it allows:

| From            | To                          | Only when                               |
| --------------- | --------------------------- | --------------------------------------- |
| `authorized`    | `part_captured`, `captured` | the authorization hasn't run out        |
| `authorized`    | `canceled`                  | always                                  |
| `authorized`    | `expired`                   | the authorization has run out (the job) |
| `part_captured` | `captured`                  | the authorization hasn't run out        |
| `part_captured` | `canceled`                  | always                                  |
| `captured`      | `refunded`                  | everything captured has been refunded   |

And the money rules, in the same function:

1. `captured_amount` and `refunded_amount` never go down.
2. `captured_amount` grows only while the order is `authorized` or `part_captured`, and before `expires_at`.
3. When status or money changes, the status must match the amounts: `authorized` means nothing is captured (the app always changes the status with a capture; the rule stops any other writer, like a script or a manual fix), `captured` means everything is captured, `part_captured` means some but not all, and `refunded` means all captured money went back.

A refund on a `part_captured`, `canceled` or `expired` order keeps its status. The status follows the authorization (section 4i), and the order page adds "(partially refunded)" or "(refunded)".

The trigger runs for everyone, including the owner and pg_cron. So the expiry job and these actions share one set of rules, kept in one place.

### d. One function does each action

```sql
create or replace function public.order_action(p_order_id uuid, p_action text, p_amount bigint, p_reason text)
returns public.orders
language plpgsql
security definer
set search_path = ''
```

Signed-in users still have no `update` grant on `orders`, and the event insert policy still allows only `authorized` events. So how can a merchant capture? Through this function, which is the only way in. Step by step:

1. **`security definer`** means the function runs with its owner's rights (`postgres`), not the caller's. That is how it can update `orders` and add events when the caller can't. Because row-level security doesn't apply to the owner, the function checks access itself. `set search_path = ''` makes every name inside it fully written out (`public.orders`), so nobody can slip in a look-alike table.
2. **Checks the input.** The reason is trimmed and must be 1 to 500 characters. Capture and refund need an amount above 0. Otherwise it raises `invalid_parameter_value` (code `22023`).
3. **Finds and locks the order.**
   ```sql
   select * into v_order from public.orders o
   where o.id = p_order_id and public.has_permission('orders.read', o.store_id)
   for update;
   ```
   `for update` locks this one row until the transaction ends. If two people capture at the same moment, the second waits, then reads the amount the first one left. Without the lock, both could read "200.00 left" and both capture 150.00. An order the caller can't read gets "Order not found" (`no_data_found`, code `P0002`), the same as one that doesn't exist, so the answer doesn't reveal other companies' orders.
4. **Checks the permission** with `has_permission('orders.' || p_action, store_id)`. Without it the caller gets `insufficient_privilege` (code `42501`).
5. **Refuses a cancel on an order that is no longer open** (`authorized` or `part_captured`), with `check_violation`. The trigger can't do this: staying on the same status is always allowed there, so `canceled` to `canceled` would pass, and a double-click, a second tab or an agent retrying `cancel_order` would write a second "Released …" event. With the `for update` lock, a second cancel at the same moment waits for the first, then sees `canceled` and is refused.
6. **Gives readable errors** for the common mistakes: an amount larger than what is left to capture or refund. The check constraints would refuse these anyway, but with a less readable message.
7. **Updates the order.** For example, a capture:
   ```sql
   update public.orders o
   set captured_amount = o.captured_amount + p_amount,
     status = case when o.captured_amount + p_amount = o.total_amount then 'captured' else 'part_captured' end
   where o.id = p_order_id
   returning * into v_order;
   ```
   The trigger (section c) and the check constraints run on this update. If any rule fails, everything is undone.
8. **Writes the timeline event**: `actor_user_id` is `auth.uid()` (the signed-in person), `actor_name` is their email, read from `auth.users`, and `metadata` is `{ amount, reason }` or, for a cancel, `{ releasedAmount, reason }`.
9. **Returns the updated order.**

Steps 7 and 8 run in one transaction. An order can't change without its timeline row, and a timeline row can't exist without the change.

```sql
revoke execute on function public.order_action(uuid, text, bigint, text) from public, anon;
grant execute on function public.order_action(uuid, text, bigint, text) to authenticated;
```

Anonymous visitors can't call it. Signed-in users can, and the function decides the rest. That also holds for someone who calls Supabase's REST API directly with their own token.

### e. From the error to the caller

`applyOrderAction` in `server/orders-repository.ts` calls the function inside `withUser` and turns the Postgres error codes into HTTP statuses:

| Code    | Name                      | HTTP | Example                                       |
| ------- | ------------------------- | ---- | --------------------------------------------- |
| `22023` | `invalid_parameter_value` | 400  | Blank reason                                  |
| `42501` | `insufficient_privilege`  | 403  | A dispute handler tries to capture            |
| `P0002` | `no_data_found`           | 404  | Another company's order                       |
| `23514` | `check_violation`         | 409  | Capturing a canceled order, or too much money |

The order page shows the message under the form. The orders API (`/api/v1/`) answers `{ "error": "…" }` with the status. The MCP tools pass the message on to the agent.

Any other error (a timeout, a deadlock) is logged on the server. The page and WebMCP only get "Something went wrong", and the orders API (`/api/v1/`) answers "Internal error". The raw error's message holds the SQL and its parameters, so it must not reach the browser.

### f. Tests

`src/features/orders/db/schema.test.ts`, block "capture, cancel and refund":

- Part capture, then the rest, then two refunds, with one event each, carrying the email and the reason.
- A cancel records what it released, and captured money can still be refunded after it.
- A second cancel is refused, so the timeline gets one cancel event.
- Too large amounts, blank reasons, captures after expiry and wrong moves are refused.
- A dispute handler gets 403, another company gets "not found", anonymous visitors can't call it, and a direct `update` is refused.
- Two captures at the same moment that don't both fit: only one goes through.
- The trigger refuses wrong moves even for the owner, including captured money on an order that stays `authorized`, and still allows updates that don't touch status or money.

## 6b. The activity log (2026-10-20)

The `/audit-log` page used to be a mock. Now it reads every row in `order_events` that the signed-in person may see, across all stores, newest first. No new table or column was needed: each order's timeline already holds this data.

### a. How the query reads events across orders

The query lives in `src/features/activity/server/activity-repository.ts`. In plain words:

1. Start from `order_events`, one row per thing that happened to an order.
2. Join `orders` on the order id, so each event knows its reference, currency and store.
3. Left join `stores` on the store id, so each event knows the store name. It is a left join so that only the `orders` policy decides visibility: a store the viewer can't read leaves the name empty instead of hiding the event.
4. Filter, only if the caller asked: `action = 'refunded'`, and/or `orders.store_id = …`.
5. Sort by `occurred_at` and `id`, newest first.
6. Take one row more than the page size, so the page knows whether another page exists.

The join to `orders` is an inner join. An event whose order the viewer can't read is dropped with it, so an event never appears without its order.

### b. Why only the events the viewer may read come back

The query never checks the viewer's company. Row-level security does that. The query runs inside `withUser`, which signs the connection in as the viewer. The policy "members can read events of orders they can read" on `order_events` says an event is visible only if its `orders` row is visible, and `orders` already has its own store-by-store policy. So a Moonlight Goods merchant never sees Nordic Bikes' events, and a user with no access gets an empty list. If a later filter forgets a check, the database still hides the rows.

Every table in a query applies its own policy. An inner join to `stores` would also require `stores.read`, so a user who could read orders but not stores would see an empty log. The left join avoids that: a store you can't read only leaves the store name empty.

### c. How keyset paging works here

Page numbers break when new events arrive between two clicks: a row moves to the next page and shows twice, or never. Keyset paging avoids this. The cursor is the id of the last event on the page, and the next page is "the events older than that one".

Many events share one `occurred_at` (the seed writes them in bursts), so the sort key is the pair `(occurred_at, id)`. The database compares pairs, so ties are broken by `id` and nothing is skipped.

- **Next page:** rows whose pair is less than the cursor event's pair, newest first.
- **Previous page:** rows whose pair is greater, sorted oldest first so the nearest come first, then flipped back to newest first.

The cursor's pair is read by a sub-select in the same query (the `anchor`), so there is no second round trip. The cursor event is also read under RLS. If the viewer can't see it, for example because its order was deleted, the anchor is empty and the page would come back empty with no links. So an empty page with a cursor falls back to the first page (`listActivityOrFirstPage`), the same way the orders list does.

### d. The missing index (a shortcut)

The sort wants an index on `order_events (occurred_at, id)`, and there isn't one yet. Each page sorts every event the viewer can see. That is fine while the log is small. When it gets slow, add the index in a new migration; never edit an applied one. The code carries a `shortcut:` comment for this, so `/ponytail-debt` lists it.

The existing index `order_events_order_occurred_at_idx` covers one order's timeline, not the whole log, so this query can't use it.

### e. Filters for later

`action` and `storeId` are optional. The audit log keeps them in the URL (for example `/audit-log?action=refunded`), so they survive paging and a filtered link can be shared. The refunds page will link to it with them. Zod checks both in `src/features/activity/model/activity-list-input.ts`, so a bad value never reaches the database.

## 7. What's deliberately not done yet

- **Reads follow roles, and nobody updates orders directly.** Each company sees its own orders, and agents see their stores. Only the expiry job (section 5) and `public.order_action()` (section 6) change orders. See [Sign-in and access](auth-and-policies.md).
- **Only developers create orders.** Other edits, such as the shipping address or tracking number, have no write path yet.
- **Whole amounts only.** Captures and refunds don't record which lines they covered (`metadata.lines` stays empty for new events).
- The dashboard and other pages still use `src/mocks/data.ts`.

## 8. Try it yourself

With `pnpm db:start` and `pnpm dev` running:

1. Open Studio at <http://127.0.0.1:64323>, then **Table Editor → orders**. These are the rows the page shows.
2. Change `customer_first_name` on order `MG-1003` in Studio and reload <http://localhost:3000/orders>. The page shows your change.
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
   update order_addresses set country = 'se' where order_id = (select id from orders where reference = 'MG-1001') and kind = 'billing';  -- check constraint: 2 capital letters
   update orders set currency = 'EUR' where reference = 'MG-1001';        -- foreign key: the Swedish store uses SEK
   update order_lines set total_amount = 1 where sku = 'LAN-BRS-01';       -- generated column: can't be written
   update order_lines set quantity = 0 where sku = 'LAN-BRS-01';           -- check constraint: quantity must be > 0
   ```
6. Look at the index. Run this in the SQL Editor:
   ```sql
   explain select reference from orders order by created_at desc, id desc limit 51;
   ```
   Look for `orders_created_at_id_idx` in the plan. On a table this small Postgres may still choose a plain scan, because it's faster than the index here. That's fine: the index is for when the table grows.
7. Run the expiry job by hand instead of waiting 15 minutes:

   ```sql
   select public.expire_orders();
   ```

   It returns how many orders it expired. Run it again and it returns 0. The local database runs the job every 15 minutes too, so the first manual run may already return 0. Find expired orders with `select reference from orders o join order_events e on e.order_id = o.id where e.action = 'expired' and e.metadata ? 'reason';` and open one in the app: the timeline ends with "Authorization expired after 7 days" (or 28).

   Because the job runs locally, seed orders change over time: the fixed orders MG-1001 and NB-2001 are seeded as Authorized, but expire on 2026-10-24 and 2026-10-23. After those dates they show as Expired within 15 minutes of `pnpm db:reset`.

8. Capture as a merchant, the way the app does it. `set_config` plays the signed-in user (merchant A from the test accounts, after `pnpm test` has run once):

   ```sql
   begin;
   set local role authenticated;
   select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', true);
   select status, captured_amount from public.order_action(
     (select id from orders where reference = 'MG-1001'), 'capture', 1000, 'First parcel shipped');
   select action, actor_name, metadata from order_events
     where order_id = (select id from orders where reference = 'MG-1001') order by occurred_at;
   rollback;
   ```

   Try it again with `''` as the reason, or `99999999` as the amount, and read the errors. `rollback` undoes it all.

9. Put everything back with `pnpm db:reset`.

## 9. Where to read more

- [Supabase: Postgres basics](https://supabase.com/docs/guides/database/overview)
- [Supabase: Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Cron (pg_cron)](https://supabase.com/docs/guides/cron)
- [Postgres: Trigger functions](https://www.postgresql.org/docs/current/plpgsql-trigger.html)
- [Postgres: `security definer` functions](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY)
- [Postgres: Row locks (`for update`)](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [Postgres: Data-modifying statements in `with`](https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-MODIFYING)
- [Drizzle: Schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Drizzle: Migrations](https://orm.drizzle.team/docs/migrations)
- [TanStack Start: Server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
