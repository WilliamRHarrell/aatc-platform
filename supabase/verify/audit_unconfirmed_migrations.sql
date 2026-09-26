-- ============================================================
-- READ-ONLY catalog check for the migrations the 2026-08-31 audit could not
-- see (it read PostgREST's OpenAPI document, which shows no policies, grants,
-- triggers, constraints, indexes or function bodies):
--   002 003 007 011 024 025 031 034 041 043 049 054
-- 015 was on the same list and turned out never applied (superseded by 079b).
--
-- ONE SELECT, no writes, no DO blocks. Paste it and read the grid.
-- Each row states the FINAL expected state after every later migration, not
-- what the migration created on the day: 007's two policies were dropped by
-- 024, 024's applications policy by 075, 025's by 030, and 042 re-created
-- 024's booths policy. result = PASS or DIFFERS; sorted DIFFERS first.
--
-- Known question going in: 070's header (2026-09-23) recorded "schedule_items:
-- admin all" and "contests: admin write" as LIVE beside 054's editorial
-- policies, although 054 drops both. The 054 rows below settle it.
-- ============================================================
with checks(m, what, expected, actual) as (
  -- 002: supabase_auth_admin can run the signup trigger
  select '002', 'supabase_auth_admin USAGE on schema public', 'true',
         has_schema_privilege('supabase_auth_admin', 'public', 'USAGE')::text
  union all select '002', 'supabase_auth_admin EXECUTE handle_new_user()', 'true',
         coalesce(has_function_privilege('supabase_auth_admin', to_regprocedure('public.handle_new_user()'), 'EXECUTE')::text, 'function missing')
  union all select '002', 'supabase_auth_admin INSERT on profiles', 'true',
         has_table_privilege('supabase_auth_admin', 'public.profiles', 'INSERT')::text

  -- 003: handle_new_user() is security definer, pinned search_path, idempotent; trigger wired
  union all select '003', 'handle_new_user() security definer', 'true',
         coalesce((select prosecdef::text from pg_proc where oid = to_regprocedure('public.handle_new_user()')), 'function missing')
  union all select '003', 'handle_new_user() sets search_path', 'true',
         coalesce((select (array_to_string(proconfig, ',') ~ 'search_path=')::text from pg_proc where oid = to_regprocedure('public.handle_new_user()')), 'false')
  union all select '003', 'handle_new_user() body has ON CONFLICT (id) DO NOTHING', 'true',
         coalesce((select (prosrc ~* 'on\s+conflict\s*\(\s*id\s*\)\s*do\s+nothing')::text from pg_proc where oid = to_regprocedure('public.handle_new_user()')), 'function missing')
  union all select '003', 'trigger on_auth_user_created on auth.users -> handle_new_user, enabled', 'true',
         exists (select 1 from pg_trigger t
                  where t.tgname = 'on_auth_user_created' and t.tgrelid = 'auth.users'::regclass
                    and t.tgfoid = to_regprocedure('public.handle_new_user()') and t.tgenabled <> 'D')::text

  -- 007: both policies dropped by 024
  union all select '007', 'policy applications "applications: public read approved"', 'absent',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'applications' and policyname = 'applications: public read approved') then 'present' else 'absent' end
  union all select '007', 'policy booths "booths: public read assigned"', 'absent',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'booths' and policyname = 'booths: public read assigned') then 'present' else 'absent' end

  -- 011: sponsor_tier enum values
  union all select '011', 'sponsor_tier has title, brass, collectible_coin, vip_bag, collectors_choice, artist_lounge, rafter_banner', 'true',
         coalesce((select (array_agg(e.enumlabel::text) @> array['title','brass','collectible_coin','vip_bag','collectors_choice','artist_lounge','rafter_banner'])::text
                     from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace
                    where t.typname = 'sponsor_tier' and n.nspname = 'public'), 'enum missing')

  -- 024: applications policy dropped by 075; booths policy re-created by 042
  union all select '024', 'policy applications "applications: public read deposit-paid" (dropped by 075)', 'absent',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'applications' and policyname = 'applications: public read deposit-paid') then 'present' else 'absent' end
  union all select '024', 'policy booths "booths: public read deposit-paid" (042 body: is_sellable + booth_publicly_visible)', 'present, 042 body',
         coalesce((select case when qual ~ 'is_sellable' and qual ~ 'booth_publicly_visible' then 'present, 042 body' else 'present, OLDER body: ' || qual end
                     from pg_policies where schemaname = 'public' and tablename = 'booths' and policyname = 'booths: public read deposit-paid'), 'absent')

  -- 025: dropped by 030
  union all select '025', 'policy sponsorships "Public can read paid featured sponsors" (dropped by 030)', 'absent',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sponsorships' and policyname = 'Public can read paid featured sponsors') then 'present' else 'absent' end

  -- 031: the insert clamp trigger (the function body is replaced by later migrations and pinned by verify_079)
  union all select '031', 'trigger applications_force_safe_insert_trg: BEFORE INSERT -> applications_force_safe_insert, enabled', 'true',
         exists (select 1 from pg_trigger t
                  where t.tgname = 'applications_force_safe_insert_trg' and t.tgrelid = 'public.applications'::regclass
                    and t.tgfoid = to_regprocedure('public.applications_force_safe_insert()')
                    and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and t.tgenabled <> 'D')::text

  -- 034: FK delete rules + one active event
  union all select '034', 'invoices_food_truck_id_fkey ON DELETE CASCADE', 'c',
         coalesce((select confdeltype::text from pg_constraint where conname = 'invoices_food_truck_id_fkey' and conrelid = 'public.invoices'::regclass), 'missing')
  union all select '034', 'invoices_sponsorship_id_fkey ON DELETE CASCADE', 'c',
         coalesce((select confdeltype::text from pg_constraint where conname = 'invoices_sponsorship_id_fkey' and conrelid = 'public.invoices'::regclass), 'missing')
  union all select '034', 'exhibitors_booth_id_fkey ON DELETE CASCADE', 'c',
         coalesce((select confdeltype::text from pg_constraint where conname = 'exhibitors_booth_id_fkey' and conrelid = 'public.exhibitors'::regclass), 'missing')
  union all select '034', 'page_content_updated_by_fkey ON DELETE SET NULL', 'n',
         coalesce((select confdeltype::text from pg_constraint where conname = 'page_content_updated_by_fkey' and conrelid = 'public.page_content'::regclass), 'missing')
  union all select '034', 'unique partial index events_one_active_idx', 'true',
         coalesce((select (i.indisunique and i.indpred is not null)::text from pg_index i where i.indexrelid = to_regclass('public.events_one_active_idx')), 'missing')

  -- 041: owner update policy + update clamp trigger
  union all select '041', 'policy applications "applications: own update" UPDATE to authenticated', 'UPDATE {authenticated}',
         coalesce((select cmd || ' ' || roles::text from pg_policies where schemaname = 'public' and tablename = 'applications' and policyname = 'applications: own update'), 'absent')
  union all select '041', 'trigger applications_protect_staff_columns_trg: BEFORE UPDATE -> applications_protect_staff_columns, enabled', 'true',
         exists (select 1 from pg_trigger t
                  where t.tgname = 'applications_protect_staff_columns_trg' and t.tgrelid = 'public.applications'::regclass
                    and t.tgfoid = to_regprocedure('public.applications_protect_staff_columns()')
                    and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16 and t.tgenabled <> 'D')::text

  -- 043: service-role exemption in both clamps + four owner policies
  union all select '043', 'applications_force_safe_insert() exempts auth.uid() is null', 'true',
         coalesce((select (prosrc ~* 'auth\.uid\(\)\s+is\s+null')::text from pg_proc where oid = to_regprocedure('public.applications_force_safe_insert()')), 'function missing')
  union all select '043', 'applications_protect_staff_columns() exempts auth.uid() is null', 'true',
         coalesce((select (prosrc ~* 'auth\.uid\(\)\s+is\s+null')::text from pg_proc where oid = to_regprocedure('public.applications_protect_staff_columns()')), 'function missing')
  union all select '043', 'policy food_trucks "food_trucks: own read"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'food_trucks' and policyname = 'food_trucks: own read') then 'present' else 'absent' end
  union all select '043', 'policy exhibitors "exhibitors: own insert"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exhibitors' and policyname = 'exhibitors: own insert') then 'present' else 'absent' end
  union all select '043', 'policy exhibitors "exhibitors: own read"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exhibitors' and policyname = 'exhibitors: own read') then 'present' else 'absent' end
  union all select '043', 'policy booths "booths: own read"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'booths' and policyname = 'booths: own read') then 'present' else 'absent' end

  -- 049: sponsor owner update + both sponsorship clamps
  union all select '049', 'policy sponsorships "sponsorships: own update" UPDATE to authenticated', 'UPDATE {authenticated}',
         coalesce((select cmd || ' ' || roles::text from pg_policies where schemaname = 'public' and tablename = 'sponsorships' and policyname = 'sponsorships: own update'), 'absent')
  union all select '049', 'trigger sponsorships_protect_commercial_columns_trg: BEFORE UPDATE, enabled', 'true',
         exists (select 1 from pg_trigger t
                  where t.tgname = 'sponsorships_protect_commercial_columns_trg' and t.tgrelid = 'public.sponsorships'::regclass
                    and t.tgfoid = to_regprocedure('public.sponsorships_protect_commercial_columns()')
                    and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16 and t.tgenabled <> 'D')::text
  union all select '049', 'sponsorships_protect_commercial_columns() is the allow-list body (jsonb_populate_record)', 'true',
         coalesce((select (prosrc ~ 'jsonb_populate_record')::text from pg_proc where oid = to_regprocedure('public.sponsorships_protect_commercial_columns()')), 'function missing')
  union all select '049', 'trigger sponsorships_force_safe_insert_trg: BEFORE INSERT, enabled', 'true',
         exists (select 1 from pg_trigger t
                  where t.tgname = 'sponsorships_force_safe_insert_trg' and t.tgrelid = 'public.sponsorships'::regclass
                    and t.tgfoid = to_regprocedure('public.sponsorships_force_safe_insert()')
                    and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and t.tgenabled <> 'D')::text
  union all select '049', 'sponsorships_force_safe_insert() nulls user_id (linking is an admin action)', 'true',
         coalesce((select (prosrc ~* 'new\.user_id\s*:=\s*null')::text from pg_proc where oid = to_regprocedure('public.sponsorships_force_safe_insert()')), 'function missing')

  -- 054: editorial policies present, the admin-only policies they replaced absent
  union all select '054', 'policy contests "contests: editorial write"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contests' and policyname = 'contests: editorial write') then 'present' else 'absent' end
  union all select '054', 'policy panels "panels: editorial write"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'panels' and policyname = 'panels: editorial write') then 'present' else 'absent' end
  union all select '054', 'policy schedule_items "schedule_items: editorial write"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_items' and policyname = 'schedule_items: editorial write') then 'present' else 'absent' end
  union all select '054', 'policy food_trucks "food_trucks: editorial write"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'food_trucks' and policyname = 'food_trucks: editorial write') then 'present' else 'absent' end
  union all select '054', 'policy page_content "page_content: editorial write"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'page_content' and policyname = 'page_content: editorial write') then 'present' else 'absent' end
  union all select '054', 'policy page_images "page_images: editorial write"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'page_images' and policyname = 'page_images: editorial write') then 'present' else 'absent' end
  union all select '054', 'storage policy "Editorial can insert page images"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Editorial can insert page images') then 'present' else 'absent' end
  union all select '054', 'storage policy "Editorial can update page images"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Editorial can update page images') then 'present' else 'absent' end
  union all select '054', 'storage policy "Editorial can delete page images"', 'present',
         case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Editorial can delete page images') then 'present' else 'absent' end
  union all select '054', 'policy contests "contests: admin write" (dropped by 054; 070 recorded it live)', 'absent',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contests' and policyname = 'contests: admin write') then 'present' else 'absent' end
  union all select '054', 'policy panels "panels: admin all" (dropped by 054)', 'absent',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'panels' and policyname = 'panels: admin all') then 'present' else 'absent' end
  union all select '054', 'policy schedule_items "schedule_items: admin all" (dropped by 054; 070 recorded it live)', 'absent',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_items' and policyname = 'schedule_items: admin all') then 'present' else 'absent' end
  union all select '054', 'policy food_trucks "Admin full access on food_trucks" (dropped by 054)', 'absent',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'food_trucks' and policyname = 'Admin full access on food_trucks') then 'present' else 'absent' end
  union all select '054', 'policy page_content "admins write content" (dropped by 054)', 'absent',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'page_content' and policyname = 'admins write content') then 'present' else 'absent' end
  union all select '054', 'policy page_images "admins write page images" (dropped by 054)', 'absent',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'page_images' and policyname = 'admins write page images') then 'present' else 'absent' end
  union all select '054', 'storage policies "Admin can insert/update/delete page images" (dropped by 054)', '0',
         (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname in ('Admin can insert page images', 'Admin can update page images', 'Admin can delete page images'))
)
select m as migration, what as "check", expected, actual,
       case when actual = expected then 'PASS' else 'DIFFERS' end as result
  from checks
 order by (actual = expected), m, what;
