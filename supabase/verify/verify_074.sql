-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass. Blocks A-E verify 074; block F is
-- the PUBLIC GRANT AUDIT Ryan asked for (2026-09-24): functions by role,
-- RLS on every table, anon-reachable write policies. F prints grids and
-- raises only on the hard rules; "REVIEW" notices are for reading.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
-- ⚠  Block C tries anon inserts that must FAIL and writes one ZZ pinup row as
-- postgres (positive control) which it deletes in the same block. A DO block
-- is ONE statement in ONE transaction: any raise inside it rolls back every
-- write it made, so a mid-block failure leaves no ZZ row behind (block Z
-- confirms). Re-running after a fix is always safe.
-- ============================================================

-- ── A. functions: signatures and grants  (NOTICE pane)
do $$
declare args text;
begin
  args := (select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'register_pinup_entry');
  if args is null then raise exception 'FAIL A: register_pinup_entry missing'; end if;
  if position('p_capacity' in args) > 0 then raise exception 'FAIL A: register_pinup_entry still takes p_capacity (%)', args; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'register_pinup_entry') <> 1 then
    raise exception 'FAIL A: more than one register_pinup_entry overload survives';
  end if;
  args := (select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'pinup_spots_remaining');
  if args is distinct from 'p_event_id uuid' then raise exception 'FAIL A: pinup_spots_remaining signature is (%)', args; end if;

  if has_function_privilege('anon', 'public.register_pinup_entry(uuid,text,text,text,text,text,text,boolean,boolean)', 'execute') then raise exception 'FAIL A: anon -> register_pinup_entry'; end if;
  if has_function_privilege('authenticated', 'public.register_pinup_entry(uuid,text,text,text,text,text,text,boolean,boolean)', 'execute') then raise exception 'FAIL A: authenticated -> register_pinup_entry'; end if;
  if not has_function_privilege('service_role', 'public.register_pinup_entry(uuid,text,text,text,text,text,text,boolean,boolean)', 'execute') then raise exception 'FAIL A: service_role lost register_pinup_entry - the route would break'; end if;
  if not has_function_privilege('anon', 'public.pinup_spots_remaining(uuid)', 'execute') then raise exception 'FAIL A: anon lost pinup_spots_remaining'; end if;
  raise notice 'PASS A: signatures without p_capacity; register is service_role only; spots is anon-callable';
end $$;

-- ── B. capacity column  (NOTICE pane)
do $$
declare v int;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'pinup_capacity' and data_type = 'integer') then
    raise exception 'FAIL B: events.pinup_capacity missing or not integer';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_pinup_capacity_positive') then
    raise exception 'FAIL B: check constraint events_pinup_capacity_positive missing';
  end if;
  v := (select pinup_capacity from public.events where is_active order by start_date limit 1);
  if v is null or v < 1 then raise exception 'FAIL B: active event capacity is %', v; end if;
  raise notice 'PASS B: events.pinup_capacity present, check present, active event capacity = %', v;
end $$;

-- ── C. direct anon inserts closed; privileged insert still works  (NOTICE pane; writes + cleans up)
do $$
declare v_event uuid; v_id uuid;
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pinup_entries' and policyname = 'anon may submit a pinup entry') then
    raise exception 'FAIL C: pinup anon insert policy still present';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'panel_registrations' and policyname = 'panel_registrations: public insert') then
    raise exception 'FAIL C: panel_registrations public insert policy still present';
  end if;
  v_event := (select id from public.events where is_active order by start_date limit 1);

  begin
    set local role anon;
    insert into public.pinup_entries (event_id, full_name, email, phone, age_confirmed, status, likeness_release, likeness_release_at)
    values (v_event, 'ZZ VERIFY 074', 'zz-verify-074@example.com', '(910) 555-0074', true, 'pending', true, now());
    reset role;
    raise exception 'FAIL C: anon inserted a pinup entry directly';
  exception
    when insufficient_privilege then reset role; raise notice 'PASS C1: anon pinup insert refused (42501)';
  end;

  begin
    set local role anon;
    insert into public.panel_registrations (panel_id, name, email) values (gen_random_uuid(), 'ZZ VERIFY 074', 'zz-verify-074@example.com');
    reset role;
    raise exception 'FAIL C: anon inserted a panel registration directly';
  exception
    when insufficient_privilege then reset role; raise notice 'PASS C2: anon panel_registrations insert refused (42501)';
    when foreign_key_violation then reset role; raise exception 'FAIL C: anon got past RLS on panel_registrations (stopped only by the FK)';
  end;

  -- Positive control: a privileged writer (what the service role is) still inserts.
  -- Constraints the row must satisfy (055 likeness timestamp; 052 marketing
  -- timestamp, satisfied by the default marketing_opt_in = false). The first
  -- run of this block failed on the likeness constraint; a fixture must be a
  -- row the route could have written.
  insert into public.pinup_entries (event_id, full_name, email, phone, age_confirmed, status, likeness_release, likeness_release_at)
  values (v_event, 'ZZ VERIFY 074 CONTROL', 'zz-verify-074-control@example.com', '(910) 555-0074', true, 'pending', true, now())
  returning id into v_id;
  delete from public.pinup_entries where id = v_id;
  if exists (select 1 from public.pinup_entries where id = v_id) then raise exception 'FAIL C: control row not deleted'; end if;
  raise notice 'PASS C: both direct anon inserts refused; privileged insert works (control row removed)';
end $$;

-- ── D. capacity is what the functions read  (NOTICE pane)
do $$
declare v_event uuid; v_cap int; v_taken int; v_spots int;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);
  v_cap := (select pinup_capacity from public.events where id = v_event);
  v_taken := (select count(*) from public.pinup_entries where event_id = v_event and status in ('pending','confirmed'));
  v_spots := public.pinup_spots_remaining(v_event);
  if v_spots <> greatest(0, v_cap - v_taken) then raise exception 'FAIL D: spots % <> capacity % - taken %', v_spots, v_cap, v_taken; end if;
  raise notice 'PASS D: pinup_spots_remaining = % (capacity % - taken %)', v_spots, v_cap, v_taken;
end $$;

-- ── E. applications: anon column grant  (NOTICE pane)
do $$
declare col text;
begin
  if has_table_privilege('anon', 'public.applications', 'select') then
    raise exception 'FAIL E: anon still holds table-level SELECT on applications';
  end if;
  foreach col in array array['email','contact_name','notes','total_amount','id_doc_url','veteran_id_url','user_id','comped_by','comped_at','approved_at','deposit_due_at','final_due_at','veteran_doc_verified_at','veteran_doc_verified_by','other_links','add_ons'] loop
    if has_column_privilege('anon', 'public.applications', col, 'select') then raise exception 'FAIL E: anon can read applications.%', col; end if;
  end loop;
  foreach col in array array['id','event_id','status','needs_roster','directory_override','business_name','exhibitor_type','booth_size','artist_single_qty','artist_double_qty','vendor_single_qty','vendor_double_qty','corner_count','artist_count','instagram','website','facebook','phone','artists','tv_show','logo_url','portfolio_image_urls'] loop
    if not has_column_privilege('anon', 'public.applications', col, 'select') then raise exception 'FAIL E: anon lost applications.% - the directory would break', col; end if;
  end loop;
  raise notice 'PASS E: anon reads the 22 directory columns and none of the 16 withheld ones';
end $$;

-- ── F. PUBLIC GRANT AUDIT ────────────────────────────────────
-- F1 grid: every non-trigger function and who may execute it.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as definer,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
 order by p.proname;

-- F2: allow-lists, exact.
do $$
declare
  anon_ok text[] := array['is_admin','has_paid_deposit','booth_publicly_visible','sponsor_tier_counts','pinup_spots_remaining','voting_state','tattoo_battle_media_ok'];
  auth_ok text[] := array['is_admin','has_paid_deposit','booth_publicly_visible','sponsor_tier_counts','pinup_spots_remaining','voting_state','tattoo_battle_media_ok',
                          'has_role','owns_invoice','comp_application','uncomp_application','set_tattoo_battle_champion'];
  extra text;
begin
  extra := (select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
               and has_function_privilege('anon', p.oid, 'execute') and not (p.proname = any(anon_ok)));
  if extra is not null then raise exception 'FAIL F2: anon can execute beyond the allow-list: %', extra; end if;
  extra := (select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
               and has_function_privilege('authenticated', p.oid, 'execute') and not (p.proname = any(auth_ok)));
  if extra is not null then raise exception 'FAIL F2: authenticated can execute beyond the allow-list: %', extra; end if;
  raise notice 'PASS F2: anon executes exactly % functions, authenticated exactly %', array_length(anon_ok, 1), array_length(auth_ok, 1);
end $$;

-- F3: RLS on every table in public.
select tablename, rowsecurity, forcerowsecurity from pg_tables where schemaname = 'public' order by tablename;
do $$
declare missing text;
begin
  missing := (select string_agg(tablename, ', ') from pg_tables where schemaname = 'public' and not rowsecurity);
  if missing is not null then raise exception 'FAIL F3: RLS disabled on: %', missing; end if;
  raise notice 'PASS F3: RLS enabled on every table in public (%)', (select count(*) from pg_tables where schemaname = 'public');
end $$;

-- F4 grid: write policies reachable by anon (explicit, or {public} = no TO clause).
select tablename, policyname, cmd, roles::text, coalesce(with_check, qual) as expr
  from pg_policies
 where schemaname = 'public' and cmd <> 'SELECT'
   and ('anon' = any(roles) or roles = '{public}')
 order by tablename, policyname;
do $$
declare
  known text[] := array[
    'applications|applications: admin all', 'applications|applications: own insert',
    'booths|booths: admin write', 'contest_entries|contest_entries: admin write',
    'events|events: admin write', 'exhibitors|exhibitors: admin write',
    'food_trucks|Vendors update own food_truck', 'invoices|invoices: admin all',
    'panel_registrations|panel_registrations: admin all',
    'profiles|profiles: admin update all', 'profiles|profiles: own update',
    'sponsorships|Anyone can submit sponsor application', 'sponsorships|sponsorships: admin write'
  ];
  extra text; gone text;
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('pinup_entries','panel_registrations')
               and cmd in ('INSERT','UPDATE','DELETE','ALL') and ('anon' = any(roles) or roles = '{public}')
               and policyname not in ('panel_registrations: admin all')) then
    raise exception 'FAIL F4: an anon-reachable write policy remains on pinup_entries / panel_registrations';
  end if;
  extra := (select string_agg(tablename || '|' || policyname, ', ') from pg_policies
             where schemaname = 'public' and cmd <> 'SELECT' and ('anon' = any(roles) or roles = '{public}')
               and not ((tablename || '|' || policyname) = any(known)));
  if extra is not null then raise notice 'REVIEW F4: anon-reachable write policies not in the known list (new since 2026-09-24?): %', extra; end if;
  gone := (select string_agg(k, ', ') from unnest(known) k where not exists (select 1 from pg_policies where schemaname = 'public' and (tablename || '|' || policyname) = k));
  if gone is not null then raise notice 'REVIEW F4: known policies not found live: %', gone; end if;
  raise notice 'PASS F4: no anon-reachable write on the two intake tables. Of the known list, every policy except sponsorships insert requires auth.uid() or is_admin() and is dead for anon; the sponsor insert is by design (/apply/sponsor, clamped by 049). All are PUBLIC-scoped by omission - rewrite `to authenticated` in 075.';
end $$;

-- ── Z. residue  (results grid; want zero rows)
select id, full_name from public.pinup_entries where full_name like 'ZZ VERIFY 074%';
