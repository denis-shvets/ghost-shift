# 0015. Role-based access with scoped assignments and several roles per person

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Ghost Shift has three kinds of people:

- **Merchants:** representatives of a merchant company. One company (organization) can own many stores, for example Moonlight Goods Sweden and Moonlight Goods Norway.
- **Agents:** external support staff assigned to specific stores, sometimes across companies. Agents often hold two support levels on the same store, for example first-line and second-line.
- **Developers and platform staff:** people who build and run the platform, with access across all companies.

Limits must be set on actions too. One merchant may only edit orders, another may only handle disputes. Roles will also grow over time, so combined roles for every mix of jobs would multiply quickly.

Until now, any signed-in user could read every order (ADR 0005 and the sign-in work). Row-level security (ADR 0006) already decides who sees which row, so the decision is which model to put in the database.

## Decision

Use **role-based access control (RBAC) with scoped assignments and a permission layer**, where a person may hold several roles:

- A **permission** is a named action, such as `orders.edit`.
- A **role** is a named set of permissions, with a scope: `global`, `organization` or `store`.
- An **assignment** gives a person a role in one scope: a global role in `user_roles`, an organization role in `org_members`, or a store role in `store_assignments`.
- A person may hold **several roles** at the same company and on the same store. Their permissions are the union of all of them.
- A role's scope is fixed by its name. A store role can't be given to a company, and a company role can't be given to a store. The database enforces this with foreign keys.
- A policy asks one question, `has_permission(permission, store_id)`, which checks all three kinds of assignment.

Roles are stored in tables, not in the login token or in `app_metadata`. The token carries only global roles, as `global_roles`, for the app to read. Organization and store roles are checked in the database on every query.

The primary keys of `org_members` and `store_assignments` include the role, so one person can hold several roles in one scope.

### Roles

Minimum roles, created by the migration:

| Role                       | Scope        | Permissions                                                            |
| -------------------------- | ------------ | ---------------------------------------------------------------------- |
| `platform_developer`       | global       | read and edit orders, handle disputes, read stores, read organizations |
| `platform_operator`        | global       | read orders and stores                                                 |
| `merchant_admin`           | organization | read and edit orders, handle disputes, read stores                     |
| `merchant_order_manager`   | organization | read and edit orders, read stores                                      |
| `merchant_dispute_handler` | organization | read orders, handle disputes, read stores                              |
| `agent_first_line`         | store        | read orders and stores                                                 |
| `agent_second_line`        | store        | read and edit orders, handle disputes, read stores                     |

Suggested roles are **documented, not created**. Create one with a migration when a real person needs it:

- **Platform (global):** `platform_support`, `platform_auditor`, `platform_finance`
- **Merchant (company):** `merchant_member` (read only), `merchant_finance`, `merchant_developer`, `merchant_shipping`
- **Merchant (store):** `merchant_store_manager`
- **Agent (store):** `agent_member` (read only), `agent_order_handler`, `agent_dispute_handler`, `agent_refund_specialist`, `agent_trainee`

Roles are named for the job, with a prefix for the side (`platform_`, `merchant_`, `agent_`). Permissions are named for the action, with a dot (`orders.edit`).

### Alternatives considered

- **Access control lists (ACL):** a list of who may do what on each row. Simple, but every order and store needs its own list, and changing a role means editing many rows.
- **Owner-only (`user_id = auth.uid()`):** good for personal data, too narrow for teams that share a company's orders.
- **One role per scope:** each person gets one role per company and one per store. Simple to read, but needs a combined role for every mix of jobs. Rejected because the list grows with every mix.
- **A composite key on roles (name and scope):** would let one name exist at two scopes, but every permission grant would then also need the scope. Rejected as more complex than the problem.
- **Attribute-based access control (ABAC):** rules based on attributes such as amount or country. Not needed yet. It can be added as an extra condition in the same policy, for example "refund up to 500".
- **Relationship-based access control (ReBAC, for example OpenFGA or SpiceDB):** powerful, but another service to run. Revisit only if rules become long chains of relationships.
- **External policy engine (OPA, Cedar):** another service and language. Overkill at this size.

## Links

- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase custom access token hook: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- Postgres primary keys and unique constraints: https://www.postgresql.org/docs/current/ddl-constraints.html

## How to use

- Role and permission reference data lives in `supabase/migrations/20261018123358_auth_and_access.sql`. Add roles and permissions in a new migration.
- Tables: `src/features/access/db/schema.ts` (roles, permissions, memberships) and `src/features/organizations/db/schema.ts`.
- To grant a role, insert one row, for example `insert into public.org_members (user_id, organization_id, role) values (...)`, or the same for `store_assignments`. Remove one role by deleting that row. The person keeps their other roles.
- To check access in a new policy, call `public.has_permission('orders.edit', store_id)` in the `using` or `with check` clause.
- Local accounts with access are created by `pnpm db:seed-users` (see [the auth guide](../guides/auth-and-policies.md)).

## Known limits

- **Checked 2026-10-18:** the custom access token hook is not confirmed to be available on Supabase's free plan. If it isn't, the token claim goes away and policies still work, because they read the role tables directly. ADR 0002 requires a free plan.
- Role changes reach the app after the user's token refreshes, which is up to an hour. Organization and store roles take effect immediately, because they're checked in the database.
- `has_permission` reads the membership tables on every row check. Fine at this size. Watch it if an order list grows large.
- Only read policies exist. Write policies are added with the features that need them.
- Nothing shows a person's effective permissions yet. Someone has to read several membership rows to see them.

## Consequences

- Easier: adding a role or permission is data, not code. Adding a store to an organization or a role to a person is one row.
- Easier: a short role list stays short, because people combine roles instead of needing a role for each mix.
- Easier: the database refuses access that the app forgets to check, and refuses roles at the wrong scope.
- Harder: every new table needs a grant migration and, if it holds access data, a policy. Forgetting either fails closed, which is the safe direction.
- Harder: answering "what can this person do?" means reading several rows. A view that lists them is the next step when it becomes a regular question.
- Harder: someone has to manage memberships. No admin screen exists yet, so the seed script and SQL do it for now.
- Revisit when: rules start depending on the data itself (amounts, countries, time). Add ABAC checks then, or move to ReBAC if relationship chains grow. Revisit if one role must deny a permission another role grants, because RBAC's union can't express that.
