-- Newer hosted Supabase projects don't grant the API roles access to new tables
-- automatically, while local Supabase still does. Granting here makes every
-- database behave the same. Row-level security policies still decide which rows
-- each role sees; a grant only lets the role ask.
--
-- Every new table needs a grant like these in its own migration.

grant select on table public.stores to anon, authenticated;
grant select on table public.orders to anon, authenticated;
grant select on table public.order_lines to anon, authenticated;
