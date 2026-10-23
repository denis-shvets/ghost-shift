-- Store settings: who may change a store, and which payout accounts a merchant can use.
-- Writes stay closed except for the policies and column grants below.

insert into public.permissions (name, description) values
  ('stores.edit', 'Change store settings and payout accounts'),
  ('payout_accounts.read', 'See payout accounts of the organization');

-- Payout accounts hold business names, so only organization roles and platform developers see them.
-- platform_operator has stores.read globally but not this permission, so it can't see other organizations' accounts.
-- Anyone who may add an account also holds payout_accounts.read, because the insert returns the new row.
insert into public.role_permissions (role, permission) values
  ('platform_developer', 'stores.edit'),
  ('merchant_admin', 'stores.edit'),
  ('platform_developer', 'payout_accounts.read'),
  ('merchant_admin', 'payout_accounts.read'),
  ('merchant_order_manager', 'payout_accounts.read'),
  ('merchant_dispute_handler', 'payout_accounts.read');

-- A person can change a store only if they hold stores.edit for it.
create policy "members can edit their stores" on public.stores
  for update to authenticated
  using (public.has_permission('stores.edit', id))
  with check (public.has_permission('stores.edit', id));

create policy "members can read payout accounts" on public.payout_accounts
  for select to authenticated using (public.has_organization_permission('payout_accounts.read', organization_id));

create policy "members can add payout accounts" on public.payout_accounts
  for insert to authenticated with check (public.has_organization_permission('stores.edit', organization_id));
