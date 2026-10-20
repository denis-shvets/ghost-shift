# Sign-in and access

This guide explains sign-in and who may see what, in plain words. Read [Orders and the database](orders-database.md) first, because this builds on its ideas (roles, grants, row-level security).

## 1. The big picture

Before sign-in existed, the database said "anyone may read orders", and the app asked as an anonymous visitor. Anyone with the site address could see every order.

Now there are three steps:

- **Sign-in** proves who you are. Supabase Auth checks your email and password and gives the app a login token.
- **Access** decides what you may see. Roles and memberships live in tables, and the database checks them for every row.
- **Permissions** decide what you may do. A role is a set of named actions, such as `orders.edit`.

```
Login page         src/routes/login.tsx
  │  sends email + password to the server
  ▼
signIn function    src/features/auth/server/functions.ts
  │  asks Supabase Auth to check the password, then stores the login token in a cookie
  ▼
Next page request  src/features/orders/server/functions.ts
  │  reads the cookie (or an "Authorization: Bearer" header for non-browser callers), asks Supabase to verify the token and return its claims
  ▼
withUser(user)     src/shared/db/client.ts
  │  tells Postgres "this query is from this signed-in user"
  ▼
Postgres           has_permission() checks the user's roles, then row-level security filters the rows
```

## 2. Words you'll meet

| Word                  | Meaning here                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Auth user**         | An account Supabase keeps in its `auth.users` table: an email, a password (stored as a hash, never plain text), and some metadata.                                                   |
| **JWT**               | JSON Web Token. The login token. It has three parts: a header, a payload with facts about the user, and a signature. The signature proves Supabase issued it and nobody changed it.  |
| **Claim**             | One fact in the token's payload, like `sub` (the user's id), `email`, or `global_roles`.                                                                                             |
| **Role**              | A named set of permissions, such as `merchant_order_manager`. Its scope says where it applies: everywhere (`global`), one merchant company (`organization`), or one store (`store`). |
| **Permission**        | A named action, such as `orders.edit` or `disputes.manage`.                                                                                                                          |
| **Membership**        | A person's role in an organization (`org_members`) or on a store (`store_assignments`).                                                                                              |
| **Access token hook** | A small SQL function Supabase runs whenever it issues a token. It can add claims. Ours copies a person's global roles into the token.                                                |
| **Postgres role**     | Who Postgres thinks is asking: `anon`, `authenticated`, or `postgres` (the admin, which ignores RLS).                                                                                |
| **Cookie**            | A small note the browser keeps and sends back with every request. Ours is marked HttpOnly, so page scripts can't read it.                                                            |

## 3. Who can do what: roles, permissions and scopes

Access is role-based (RBAC). A person can hold several roles, and their permissions are the union of all of them. The reasons are in [ADR 0015](../adr/0015-role-based-access.md).

Three tables hold the access rules, and each one answers a different question:

| Table               | Question it answers                             | Example rows                                                               |
| ------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| `user_roles`        | Which roles does this person have everywhere?   | `platform_developer` for the developer account                             |
| `org_members`       | Which roles does this person have in a company? | `merchant_order_manager` and `merchant_dispute_handler` in Moonlight Goods |
| `store_assignments` | Which roles does this person have on a store?   | `agent_first_line` and `agent_second_line` on Nordic Bikes Germany         |

The roles themselves are listed in `roles`, with their scope. A role's scope limits where it can be used. A store role can't be given to a company, and a company role can't be given to one store. The database refuses that.

Each role then has permissions, listed in `role_permissions`:

| Role                       | Scope        | Permissions                                                    |
| -------------------------- | ------------ | -------------------------------------------------------------- |
| `platform_developer`       | global       | all of the below, plus read organizations and create orders    |
| `platform_operator`        | global       | read orders and stores                                         |
| `merchant_admin`           | organization | read and edit orders, move money, handle disputes, read stores |
| `merchant_order_manager`   | organization | read and edit orders, move money, read stores                  |
| `merchant_dispute_handler` | organization | read orders, handle disputes, read stores                      |
| `agent_first_line`         | store        | read orders and stores                                         |
| `agent_second_line`        | store        | read and edit orders, move money, handle disputes, read stores |

"Move money" is three permissions: `orders.capture`, `orders.cancel` and `orders.refund` (added 2026-10-20, section 4). They went to exactly the roles that could already edit orders.

Merchant A holds two roles at Moonlight Goods, so it can edit orders, move money and handle disputes there. Merchant B holds one role at Nordic Bikes, so it can handle disputes there but not edit orders or move money. The agent holds both support levels on one store, so it can edit orders and move money there, but only at that store.

The token carries only the global roles, as the `global_roles` claim. Organization and store roles are checked in the database for each query, so changing them takes effect immediately, not after the token refreshes.

## 4. The check every policy asks

Policies don't look at the tables above directly. They call one function, `public.has_permission(permission, store_id)`. It returns true if the signed-in user has the permission through:

1. a global role, or
2. a role in the organization that owns the store, or
3. a role assigned to that store.

It only ever looks up rows for the signed-in user (`auth.uid()`), so it can't reveal anyone else's access. Here is how the read policy on orders uses it:

```sql
create policy "members can read orders in their stores" on public.orders
  for select to authenticated using (public.has_permission('orders.read', store_id));
```

Read it as "a row may be read when the user has `orders.read` for this row's store". The same pattern will make writes safe later: `has_permission('orders.edit', store_id)` on an update policy.

### Insert policies and `with check`

Reading and writing use different parts of a policy:

- `using (...)` decides which existing rows a query may see or touch.
- `with check (...)` decides whether a **new** row may be saved. Postgres runs it on each row an insert or update is about to write. If it's false, the write fails with `permission denied` (error code `42501`). It doesn't quietly do nothing.

The `orders.create` permission follows the same pattern. Only `platform_developer` holds it, so only that role can insert:

```sql
create policy "developers can create orders" on public.orders
  for insert to authenticated with check (public.has_permission('orders.create', store_id));
```

Read it as "a new order may be saved when the user has `orders.create` for that order's store". An insert also needs a grant (`grant insert on ... to authenticated`), and the grant and the policy work together: the grant lets the role ask, and the policy decides each row.

Order lines get the same check, made through their order. A line has no `store_id` of its own, so the policy looks up the line's order and asks `has_permission` about that order's store:

```sql
create policy "developers can create order lines" on public.order_lines
  for insert to authenticated with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.has_permission('orders.create', o.store_id)
    )
  );
```

Read it as "a new line may be saved when its order exists, the user can see it, and the user has `orders.create` for its store". Being able to _read_ the order is not enough. A merchant can read their own orders, and without the `has_permission` part they could add lines to an order that was already paid.

The migration is `supabase/migrations/20261019015532_orders_create_access.sql`. It inserts the permission, gives it to `platform_developer` only, grants insert (never update or delete) and adds the two policies above.

### Writes through a function: capture, cancel and refund

Capture, cancel and refund don't use an update policy. Signed-in users still have no update grant on `orders`. Instead they call one database function, `public.order_action(order_id, action, amount, reason)`, which is `security definer`: it runs with the table owner's rights, so it can change the order and add the timeline event that the caller can't.

Because row-level security doesn't apply to the owner, the function asks `has_permission` itself, in the same way a policy would:

```sql
-- An order the caller can't read is "not found", like a policy hiding it.
where o.id = p_order_id and public.has_permission('orders.read', o.store_id)
-- Then the action's own permission: orders.capture, orders.cancel or orders.refund.
if not public.has_permission('orders.' || p_action, v_order.store_id) then
  raise exception … using errcode = 'insufficient_privilege';
```

Why a function instead of an update policy:

- A policy can say who may update a row, but not which columns change or by how much. The function changes only the amounts and status, by the amount asked for.
- The function also writes the timeline event with the caller's email and the reason, in the same transaction. Since it is the only way in, no capture can happen without a reason on record, even through Supabase's REST API.

The migration is `supabase/migrations/20261020003438_orders_capture_cancel_refund.sql`. The [orders database guide, section 6](orders-database.md#6-capture-cancel-and-refund-2026-10-20) walks through it.

## 5. The policy changes, in order

Everything is in one migration, `supabase/migrations/20261018123358_auth_and_access.sql`. It does four things, in order:

1. **Creates the tables:** organizations, roles, permissions, and the membership tables. It adds `organization_id` to stores. Existing stores are first moved into a placeholder organization, so the column can be required.
2. **Replaces the old "everyone" read policies** from the first migration. Anonymous visitors lose all access, because `anon` no longer has privileges on these tables.
3. **Adds the roles and permissions**, the `has_permission` function and the scoped read policies.
4. **Sets the grants and the token hook.** Signed-in users can only read, and the hook copies global roles into the token.

A later migration, `supabase/migrations/20261019003455_organizations_read_permission.sql`, narrows the organizations read policy. It adds the `organizations.read` permission, which only `platform_developer` holds, so a platform operator can no longer read organization names. Members still read their own organization.

Point the grants at one thing: a policy only filters rows. It can't stop a role that has no access at all from asking. An anonymous visitor is refused at the grant step with `permission denied`, before any policy looks at a row.

There's a trap here, and the migration says so in a comment. If a role has an update privilege but no update policy, an update doesn't fail. RLS hides every row, so the update quietly changes nothing. So the migration revokes write privileges outright, instead of relying on a missing policy.

## 6. `withUser` and `withRole`

Two helpers in `src/shared/db/client.ts` run queries inside a transaction with a role set:

| Helper     | What it does                                                                                                | Used for                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `withUser` | Sets the role to `authenticated` and stores the user's claims for this transaction only. RLS can read them. | Anything a signed-in person or agent asks for. |
| `withRole` | Sets the role to a given one (`anon` or `authenticated`) without any user.                                  | Anonymous queries. There are none in the app.  |

The claims go in as a bound parameter (`set_config(..., true)`), never by joining strings into SQL, so a strange email can't change the query. The `true` at the end means "only for this transaction", so nothing leaks to the next request.

The app connects to Postgres as the `postgres` admin, and admins skip RLS. So a query that forgets `withUser` or `withRole` runs with no checks at all. That's why every request handler must go through one of them.

## 7. Accounts for local testing

`pnpm db:seed-users` creates five sign-in accounts in your local Supabase, and gives each one its access. Run `pnpm db:start`, then `pnpm db:reset`, then `pnpm db:seed-users`. Reset wipes accounts, so seed again after every reset.

| Email                                 | Access                                                                     | What it's for                                                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `developer@ghostshift.test`           | `platform_developer` (global)                                              | Sees every order.                                                                                                                                                                                                                        |
| `platform-operator@ghostshift.test`   | `platform_operator` (global)                                               | Sees every order and store, without the developer's permissions. Can't read organization names.                                                                                                                                          |
| `merchant-orders@ghostshift.test`     | `merchant_order_manager` and `merchant_dispute_handler` at Moonlight Goods | Sees and edits Moonlight Goods orders, and handles their disputes (merchant A, with two roles).                                                                                                                                          |
| `merchant-nordic@ghostshift.test`     | `merchant_dispute_handler` at Nordic Bikes                                 | Sees Nordic Bikes orders and handles disputes, but can't edit them (merchant B).                                                                                                                                                         |
| `viewer@ghostshift.test`              | none                                                                       | Signed in, but sees nothing. Shows that signing in alone grants nothing.                                                                                                                                                                 |
| `SEED_AGENT_EMAIL` (from `.dev.vars`) | `agent_first_line` and `agent_second_line` on Nordic Bikes Germany         | The agent identity ([ADR 0007](../adr/0007-agent-identities.md)). Two support levels on one store. The address is any email you can receive mail at; a Gmail plus-address keeps the mail in your inbox while the account stays separate. |

The seed script reads the local keys from `supabase status`, and it refuses to run against anything other than `127.0.0.1` or `localhost`. Its password comes from `SEED_PASSWORD` in `.dev.vars`, which Git ignores.

The `.test` addresses can't receive mail. Local Supabase doesn't send confirmation mail anyway, because the seed marks each account's email as confirmed.

## 8. Try it yourself

With `pnpm db:start`, `pnpm db:seed-users` and `pnpm dev` running:

1. Open <http://localhost:3000/orders> in a private window. You're sent to the login page, because you're not signed in.
2. Sign in as `merchant-orders@ghostshift.test` with your `SEED_PASSWORD`. Four Moonlight Goods orders appear, and no `NB-2001`.
3. Sign out, then sign in as `merchant-nordic@ghostshift.test`. Only `NB-2001` appears.
4. Sign out, then sign in as `developer@ghostshift.test`. All five orders appear.
5. In Studio (<http://127.0.0.1:64323>), open the **SQL Editor** and run:
   ```sql
   set role anon;
   select reference from orders;
   ```
   It fails with `permission denied for table orders`. Run `reset role;` afterwards.
6. Check what the token carries. Sign in with the Auth API, then decode the token's middle part (the payload) at <https://jwt.io>:
   ```bash
   curl -s "http://127.0.0.1:64321/auth/v1/token?grant_type=password" \
     -H "apikey: <PUBLISHABLE_KEY from pnpm exec supabase status>" \
     -H "Content-Type: application/json" \
     -d '{"email":"developer@ghostshift.test","password":"<SEED_PASSWORD>"}'
   ```
   Look for `"global_roles": ["platform_developer"]` in the payload. The merchant's token shows `"global_roles": []`, because its roles are organization-scoped and live in the database.

### Reading the sign-in logs

When sign-in fails, the Auth service's own log shows what it answered. Start the stack with `pnpm db:start`, then in a terminal run:

```bash
docker logs -f supabase_auth_ghost-shift
```

Leave it running, then try signing in. Each request appears as it happens.

Studio's **Logs** page doesn't work on Windows at the moment: its log collector can't reach Docker. Use the command above instead.

Our own server code logs to the `pnpm dev` terminal. A wrong password shows as a normal sign-in response, with `ok` set to `false`, so check the Auth log to see why.

## 9. Tests

- `src/features/orders/db/schema.test.ts` proves the rules themselves. It checks that:
  - an anonymous visitor is refused on orders, order lines and stores (Postgres error `42501`, "insufficient privilege");
  - a merchant sees only their own company's orders, an agent sees only their store, a developer sees everything, and a stranger sees nothing;
  - a person's permissions are the union of their roles, and removing one role removes only its permissions;
  - a platform operator can't read organization names, a developer can, and a merchant reads only their own company;
  - a store role can't be given at company level, and a company role can't be given at store level;
  - direct updates are refused for everyone;
  - capture, cancel and refund through `order_action` follow the permissions: a dispute handler is refused, another company's order is "not found", and an agent with second-line support may capture at their store;
  - the token hook copies global roles into the claim.
- `src/features/orders/server/orders-repository.test.ts` runs the real order queries as a merchant, including one order that belongs to another company.
- The same file checks that a second-line agent can capture while a first-line-only agent gets `403`, using the `firstLineAgent` account in `test-accounts.ts`.
- `src/shared/env/server-env.test.ts`, `src/shared/auth/user-claims.test.ts` and `src/features/auth/model/login-input.test.ts` cover the input checks.

The access tests create their own accounts with fixed ids, in `src/features/access/db/test-accounts.ts`. They need only the database, not the Auth service, so CI can run them.

Run them with `pnpm db:start`, `pnpm db:reset`, then `pnpm test`.

## 10. What's not done yet

- **Sessions last one hour, then the user signs in again.** The login token expires after an hour, and the app doesn't refresh it yet. Refreshing needs a second cookie and a refresh step on each request.
- **Sign-out only clears the cookie.** The token stays valid until it expires, because the server doesn't revoke it. Revoking all of a user's sessions needs one extra call, to add later.
- **Only platform developers can create orders.** Existing orders change only through capture, cancel and refund (section 4) and the expiry job.
- **The create-order page is for platform developers only.** The page checks the role so other people do not see a developer tool; the database still decides who may create (`orders.create`). The orders API under `/api/v1/` is open to any signed-in user, and the database decides what each one may do. See [The orders API for agents](orders-api.md).
- **Limit by amount isn't built.** A rule like "refund up to 500" needs an attribute check on top of the roles. That's the next step if you need it (see ADR 0015).
- **Effective permissions aren't shown anywhere.** Someone has to read several membership rows to see what a person can do. A view can list them later (see ADR 0015).
- **No admin screen for memberships.** The seed script and SQL manage who has which role. A screen comes later.
- **No password reset or sign-up pages.** Accounts come from the seed script or the Supabase dashboard.
- **Hosted setup is separate.** The hook must be switched on, the migrations pushed, and accounts and memberships created in the hosted Supabase project. The owner does those steps by hand, and the hand-off notes list them.

## 11. Where to read more

- [ADR 0015: Role-based access](../adr/0015-role-based-access.md)
- [ADR 0005: Supabase](../adr/0005-supabase.md), [ADR 0007: Agent identities](../adr/0007-agent-identities.md)
- [Supabase: Custom access token hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- [Supabase: Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: JWT claims](https://supabase.com/docs/guides/auth/jwt-fields)
