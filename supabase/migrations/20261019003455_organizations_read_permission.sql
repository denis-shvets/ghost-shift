-- Narrows who can read organization names. The old policy let any global role read every
-- organization, so platform_operator could read names it has no permission for.
-- This adds an organizations.read permission, granted to platform_developer only.
-- Members still read their own organization through org_members.

insert into public.permissions (name, description) values
  ('organizations.read', 'See organization names');

insert into public.role_permissions (role, permission) values
  ('platform_developer', 'organizations.read');

-- Like has_permission, but for an organization id: a global role or a role in that organization.
create or replace function public.has_organization_permission(p_permission text, p_organization_id uuid)
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
    from public.org_members om
    join public.role_permissions rp on rp.role = om.role
    where om.organization_id = p_organization_id and om.user_id = auth.uid() and rp.permission = p_permission
  );
$$;

revoke execute on function public.has_organization_permission(text, uuid) from public, anon;
grant execute on function public.has_organization_permission(text, uuid) to authenticated;

drop policy "members can read their organizations" on public.organizations;

create policy "members can read their organizations" on public.organizations
  for select to authenticated using (
    public.has_organization_permission('organizations.read', id)
    or exists (
      select 1 from public.org_members om
      where om.organization_id = organizations.id and om.user_id = auth.uid()
    )
  );
