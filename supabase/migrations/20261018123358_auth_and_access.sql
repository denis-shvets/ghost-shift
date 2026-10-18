CREATE TABLE "org_members" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role_scope" text DEFAULT 'organization' NOT NULL,
	"role" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_members_pk" PRIMARY KEY("user_id","organization_id","role"),
	CONSTRAINT "org_members_scope_check" CHECK ("org_members"."role_scope" = 'organization')
);
--> statement-breakpoint
ALTER TABLE "org_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "permissions" (
	"name" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" text NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role","permission")
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roles" (
	"name" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "roles_name_scope_unique" UNIQUE("name","scope"),
	CONSTRAINT "roles_scope_check" CHECK ("roles"."scope" in ('global', 'organization', 'store'))
);
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store_assignments" (
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"role_scope" text DEFAULT 'store' NOT NULL,
	"role" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_assignments_pk" PRIMARY KEY("user_id","store_id","role"),
	CONSTRAINT "store_assignments_scope_check" CHECK ("store_assignments"."role_scope" = 'store')
);
--> statement-breakpoint
ALTER TABLE "store_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_scope" text DEFAULT 'global' NOT NULL,
	"role" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "user_roles_scope_check" CHECK ("user_roles"."role_scope" = 'global')
);
--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
INSERT INTO "organizations" ("id", "name") SELECT gen_random_uuid(), 'Unassigned stores' WHERE EXISTS (SELECT 1 FROM "stores");--> statement-breakpoint
UPDATE "stores" SET "organization_id" = (SELECT "id" FROM "organizations" LIMIT 1) WHERE "organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_role_fk" FOREIGN KEY ("role","role_scope") REFERENCES "public"."roles"("name","scope") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_fk" FOREIGN KEY ("permission") REFERENCES "public"."permissions"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_assignments" ADD CONSTRAINT "store_assignments_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_assignments" ADD CONSTRAINT "store_assignments_store_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_assignments" ADD CONSTRAINT "store_assignments_role_fk" FOREIGN KEY ("role","role_scope") REFERENCES "public"."roles"("name","scope") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_fk" FOREIGN KEY ("role","role_scope") REFERENCES "public"."roles"("name","scope") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
-- Replace the first migration's "everyone" read policies, and lock the tables down.
-- Anonymous visitors get no access, and signed-in users get read access only through
-- has_permission() below.
drop policy "order lines are readable by everyone" on public.order_lines;
drop policy "orders are readable by everyone" on public.orders;
drop policy "stores are readable by everyone" on public.stores;

revoke all on table public.orders, public.order_lines, public.stores from anon, authenticated;
grant select on table public.orders, public.order_lines, public.stores to authenticated;

-- Reference data: the permissions, the roles, and which role gets which permission.
-- Add a role or permission here (or in a later migration) rather than in code.
-- Suggested roles that are not created yet are listed in ADR 0015.

insert into public.permissions (name, description) values
  ('orders.read', 'See orders'),
  ('orders.edit', 'Change orders'),
  ('disputes.manage', 'Handle disputes'),
  ('stores.read', 'See stores');

insert into public.roles (name, scope, description) values
  ('platform_developer', 'global', 'Builds and supports the app'),
  ('platform_operator', 'global', 'Runs the platform day to day'),
  ('merchant_admin', 'organization', 'Everything for one merchant company'),
  ('merchant_order_manager', 'organization', 'Reads and changes orders for one merchant company'),
  ('merchant_dispute_handler', 'organization', 'Reads orders and handles disputes for one merchant company'),
  ('agent_first_line', 'store', 'First-line support for assigned stores'),
  ('agent_second_line', 'store', 'Escalations for assigned stores');

insert into public.role_permissions (role, permission) values
  ('platform_developer', 'orders.read'),
  ('platform_developer', 'orders.edit'),
  ('platform_developer', 'disputes.manage'),
  ('platform_developer', 'stores.read'),
  ('platform_operator', 'orders.read'),
  ('platform_operator', 'stores.read'),
  ('merchant_admin', 'orders.read'),
  ('merchant_admin', 'orders.edit'),
  ('merchant_admin', 'disputes.manage'),
  ('merchant_admin', 'stores.read'),
  ('merchant_order_manager', 'orders.read'),
  ('merchant_order_manager', 'orders.edit'),
  ('merchant_order_manager', 'stores.read'),
  ('merchant_dispute_handler', 'orders.read'),
  ('merchant_dispute_handler', 'disputes.manage'),
  ('merchant_dispute_handler', 'stores.read'),
  ('agent_first_line', 'orders.read'),
  ('agent_first_line', 'stores.read'),
  ('agent_second_line', 'orders.read'),
  ('agent_second_line', 'orders.edit'),
  ('agent_second_line', 'disputes.manage'),
  ('agent_second_line', 'stores.read');

-- The check every policy asks: does the signed-in user have this permission for this store?
-- A person may hold several roles, so every matching row counts and the permissions are the union.
-- It looks in three places: global roles, the store's organization, and direct store assignments.
-- It runs as the table owner so it can read the membership tables, and it only ever
-- looks up rows for auth.uid(), so it can't reveal anyone else's access.
create or replace function public.has_permission(p_permission text, p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = auth.uid() and rp.permission = p_permission
  )
  or exists (
    select 1
    from public.stores s
    join public.org_members om on om.organization_id = s.organization_id
    join public.role_permissions rp on rp.role = om.role
    where s.id = p_store_id and om.user_id = auth.uid() and rp.permission = p_permission
  )
  or exists (
    select 1
    from public.store_assignments sa
    join public.role_permissions rp on rp.role = sa.role
    where sa.store_id = p_store_id and sa.user_id = auth.uid() and rp.permission = p_permission
  );
$$;

revoke execute on function public.has_permission(text, uuid) from public, anon;
grant execute on function public.has_permission(text, uuid) to authenticated;


create policy "members can read orders in their stores" on public.orders
  for select to authenticated using (public.has_permission('orders.read', store_id));

create policy "members can read lines of orders they can read" on public.order_lines
  for select to authenticated using (exists (select 1 from public.orders o where o.id = order_lines.order_id));

create policy "members can read their stores" on public.stores
  for select to authenticated using (public.has_permission('stores.read', id));

create policy "members can read their organizations" on public.organizations
  for select to authenticated using (
    exists (
      select 1 from public.org_members om
      where om.organization_id = organizations.id and om.user_id = auth.uid()
    )
    or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid())
  );

-- People can read their own memberships. Nobody can change them through the API yet.
create policy "users read their own global roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "users read their own organization roles" on public.org_members
  for select to authenticated using (user_id = auth.uid());
create policy "users read their own store assignments" on public.store_assignments
  for select to authenticated using (user_id = auth.uid());

-- The role catalogue is the same for everyone who is signed in.
create policy "signed-in users read roles" on public.roles
  for select to authenticated using (true);
create policy "signed-in users read permissions" on public.permissions
  for select to authenticated using (true);
create policy "signed-in users read role permissions" on public.role_permissions
  for select to authenticated using (true);

-- Grants: nothing for anonymous visitors, and read-only for signed-in users.
-- Writes stay closed until their own policies exist.
revoke all on table
  public.organizations, public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.org_members, public.store_assignments
  from anon, authenticated;
grant select on table
  public.organizations, public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.org_members, public.store_assignments
  to authenticated;

-- The token hook reads global roles from the user_roles table and writes them
-- as the global_roles claim. Organization and store roles are checked in the policies instead.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  global_roles jsonb;
begin
  select coalesce(jsonb_agg(ur.role order by ur.role), '[]'::jsonb)
    into global_roles
    from public.user_roles ur
    where ur.user_id = (event ->> 'user_id')::uuid;

  claims := jsonb_set(claims, '{global_roles}', global_roles);
  return jsonb_build_object('claims', claims);
end;
$$;

-- The token hook runs as supabase_auth_admin, so that role needs to use the function.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
