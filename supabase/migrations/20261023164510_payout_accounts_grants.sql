-- Newer hosted Supabase projects don't grant the API roles access to new tables
-- automatically. Row-level security policies still decide which rows each role sees.

-- Local Supabase grants every privilege on new tables, hosted grants none. Revoke first so both
-- end up the same.
revoke all on table public.payout_accounts from anon, authenticated;

grant select, insert on table public.payout_accounts to authenticated;

-- Column-level grant: a signed-in user can change only these columns of a store.
-- Market, currency, organization and status stay locked, so existing orders keep their currency.
grant update (name, support_email, payout_account_id) on table public.stores to authenticated;
