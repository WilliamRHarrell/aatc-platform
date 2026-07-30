-- ============================================================
-- VERIFY 038 — run after the migration. Read the results; nothing mutates.
--
-- Query A: the views exist and are SECURITY DEFINER (security_invoker off).
-- Query B: no anon-readable policy remains on the four base tables.
-- Query C: anon has no direct SELECT grant on the base tables.
--
-- The bypass question — "can anon just query the base table once the policy is
-- dropped?" — is answered by B and C together. B removes the only permissive
-- policy, so RLS returns zero rows. C removes the table-level SELECT privilege,
-- so the request is rejected before RLS is even consulted. Either alone would
-- do; both is the point.
--
-- sponsor_tier_counts() is unaffected: it is SECURITY DEFINER, so it reads
-- sponsorships as its owner, bypassing both RLS and the anon grant. Confirm by
-- calling it with the anon key after applying (it returned
-- [{brass,1},{gold,1}] before).
-- ============================================================

-- A. views present and definer
select c.relname as view_name,
       coalesce(
         (select option_value from pg_options_to_table(c.reloptions)
           where option_name = 'security_invoker'), 'false') as security_invoker,
       'want false' as expected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'v'
   and c.relname in ('sponsors_public','exhibitors_public','food_trucks_public','panels_public')
 order by 1;

-- B. any remaining policy readable by anon on the base tables (want 0 rows)
select tablename, policyname, roles::text, qual
  from pg_policies
 where schemaname = 'public'
   and tablename in ('sponsorships','exhibitors','food_trucks','panels','booths')
   and cmd = 'SELECT'
   and (roles::text like '%anon%' or roles::text = '{public}')
 order by tablename, policyname;

-- C. anon must hold no SELECT privilege on the base tables (want 0 rows)
select table_name, privilege_type, grantee
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee = 'anon'
   and privilege_type = 'SELECT'
   and table_name in ('sponsorships','exhibitors','food_trucks','panels')
 order by table_name;

-- D. anon SHOULD hold SELECT on the four views (want 4 rows)
select table_name, grantee
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee = 'anon'
   and privilege_type = 'SELECT'
   and table_name in ('sponsors_public','exhibitors_public','food_trucks_public','panels_public')
 order by table_name;
