-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
-- ⚠  Block E writes ZZ fixtures (a pinup entry, a panel registration and an
-- aatc submission owned by the RLS harness user) as postgres and deletes them
-- in the same block; a DO block rolls back its own writes on any raise.
-- ============================================================

-- ── A. aatc_submissions shape pinned  (NOTICE pane)
do $$
declare cols text; want text; fk text;
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'aatc_submissions') then raise exception 'FAIL A: aatc_submissions missing'; end if;
  if not (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'aatc_submissions') then raise exception 'FAIL A: RLS disabled on aatc_submissions'; end if;
  cols := (select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'aatc_submissions');
  want := 'id:uuid,exhibitor_id:uuid,artist_name:text,instagram_handle:text,square_paths:ARRAY,vertical_paths:ARRAY,caption:text,status:text,postiz_post_id:text,rejection_reason:text,reviewed_by:uuid,reviewed_at:timestamp with time zone,created_at:timestamp with time zone';
  if cols is distinct from want then raise exception 'FAIL A: columns are (%), want (%)', cols, want; end if;
  fk := (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.aatc_submissions'::regclass and conname = 'aatc_submissions_exhibitor_id_fkey');
  if fk is distinct from 'FOREIGN KEY (exhibitor_id) REFERENCES auth.users(id) ON DELETE CASCADE' then raise exception 'FAIL A: exhibitor_id FK is (%)', fk; end if;
  fk := (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.aatc_submissions'::regclass and conname = 'aatc_submissions_reviewed_by_fkey');
  if fk is distinct from 'FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)' then raise exception 'FAIL A: reviewed_by FK is (%)', fk; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.aatc_submissions'::regclass and conname = 'aatc_submissions_pkey') then raise exception 'FAIL A: primary key missing'; end if;
  raise notice 'PASS A: aatc_submissions shape, FKs and RLS match the live catalog read on 2026-09-25';
end $$;

-- ── B. aatc_submissions policies: four, authenticated, verbatim bodies  (grid + NOTICE)
select policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'aatc_submissions' order by policyname;
do $$
declare n int; r record;
begin
  n := (select count(*) from pg_policies where schemaname = 'public' and tablename = 'aatc_submissions');
  if n <> 4 then raise exception 'FAIL B: % policies on aatc_submissions, want 4', n; end if;
  for r in select policyname, cmd, roles::text as roles, coalesce(qual, with_check) as expr from pg_policies where schemaname = 'public' and tablename = 'aatc_submissions' loop
    if r.roles <> '{authenticated}' then raise exception 'FAIL B: % is scoped to % not {authenticated}', r.policyname, r.roles; end if;
    if r.policyname in ('admins read all', 'admins update all') and position('role = ''admin''' in r.expr) = 0 then raise exception 'FAIL B: % lost its admin check (%)', r.policyname, r.expr; end if;
    if r.policyname in ('exhibitors insert own', 'exhibitors read own') and position('exhibitor_id' in r.expr) = 0 then raise exception 'FAIL B: % lost its owner check (%)', r.policyname, r.expr; end if;
  end loop;
  raise notice 'PASS B: four policies, all to authenticated, bodies intact';
end $$;

-- ── C. pinup admin insert  (NOTICE pane)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pinup_entries' and policyname = 'admins insert pinup entries' and cmd = 'INSERT' and roles::text = '{authenticated}') then
    raise exception 'FAIL C: "admins insert pinup entries" missing or not scoped to authenticated';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'pinup_entries_stamp_consent_trg' and tgrelid = 'public.pinup_entries'::regclass) then
    raise exception 'FAIL C: consent-stamp trigger missing';
  end if;
  raise notice 'PASS C: admins can insert pinup entries; the database stamps consent times';
end $$;

-- ── D. NO anon write anywhere in public, from the catalog  (grid + NOTICE)
select tablename, policyname, cmd, roles::text from pg_policies
 where schemaname = 'public' and cmd <> 'SELECT' and ('anon' = any(roles) or roles = '{public}')
 order by tablename, policyname;
do $$
declare bad text;
begin
  bad := (select string_agg(tablename || ': ' || policyname, ', ') from pg_policies
           where schemaname = 'public' and cmd <> 'SELECT' and ('anon' = any(roles) or roles = '{public}'));
  if bad is not null then raise exception 'FAIL D: anon-reachable write policies remain: %', bad; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sponsorships' and policyname = 'Anyone can submit sponsor application') then
    raise exception 'FAIL D: the sponsor anon insert policy still exists';
  end if;
  raise notice 'PASS D: no policy in public grants anon a write';
end $$;

-- ── E. a signed-in NON-OWNER reads nothing of other people  (NOTICE pane; fixtures written and removed)
do $$
declare
  v_uid uuid; v_event uuid; v_panel uuid;
  v_pin uuid; v_reg uuid; v_sub uuid;
  n_apps int; n_inv int; n_pin int; n_reg int; n_sub int; n_prof int;
  c_apps int; c_inv int; c_prof int; c_inv_other int; n_inv_other int;
begin
  v_uid := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_uid is null then raise exception 'ABORT: RLS harness user missing'; end if;
  if exists (select 1 from public.applications where user_id = v_uid) then raise exception 'ABORT: harness user owns an application - not a clean non-owner'; end if;
  -- The harness user DOES own the seeded RLS-harness sponsorship and its
  -- invoice (seeds/rls_harness_records.sql), so invoices are asserted as
  -- "none the user does not own", not "none at all".
  c_inv_other := (select count(*) from public.invoices i where not public.owns_invoice(i.application_id, i.sponsorship_id, v_uid));
  v_event := (select id from public.events where is_active order by start_date limit 1);
  v_panel := (select id from public.panels order by created_at limit 1);

  -- Positive controls: the data exists for a privileged reader.
  c_apps := (select count(*) from public.applications);
  c_inv  := (select count(*) from public.invoices);
  c_prof := (select count(*) from public.profiles);
  if c_apps = 0 or c_inv = 0 or c_prof < 2 then raise exception 'ABORT: too little live data for a meaningful check (apps %, invoices %, profiles %)', c_apps, c_inv, c_prof; end if;

  -- Fixtures for the tables that may be empty live, so "0 rows" is a refusal, not an empty table.
  -- The pinup fixture omits likeness_release_at on purpose: the 076 trigger must stamp it.
  insert into public.pinup_entries (event_id, full_name, email, phone, age_confirmed, status, likeness_release)
  values (v_event, 'ZZ VERIFY 076', 'zz-verify-076@example.com', '(910) 555-0076', true, 'pending', true) returning id into v_pin;
  if (select likeness_release_at from public.pinup_entries where id = v_pin) is null then raise exception 'FAIL E: consent trigger did not stamp likeness_release_at'; end if;
  if v_panel is not null then
    insert into public.panel_registrations (panel_id, name, email) values (v_panel, 'ZZ VERIFY 076', 'zz-verify-076@example.com') returning id into v_reg;
  end if;
  insert into public.aatc_submissions (exhibitor_id, artist_name, instagram_handle, square_paths, vertical_paths, caption)
  values ((select id from public.profiles where role = 'admin' order by created_at limit 1), 'ZZ VERIFY 076', 'zz', '{}', '{}', 'zz') returning id into v_sub;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  n_apps := (select count(*) from public.applications);
  n_inv  := (select count(*) from public.invoices);
  n_inv_other := (select count(*) from public.invoices i where not public.owns_invoice(i.application_id, i.sponsorship_id, v_uid));
  n_pin  := (select count(*) from public.pinup_entries);
  n_reg  := (select count(*) from public.panel_registrations);
  n_sub  := (select count(*) from public.aatc_submissions);
  n_prof := (select count(*) from public.profiles);
  reset role;
  perform set_config('request.jwt.claims', '', true);

  delete from public.aatc_submissions where id = v_sub;
  if v_reg is not null then delete from public.panel_registrations where id = v_reg; end if;
  delete from public.pinup_entries where id = v_pin;

  if n_apps <> 0 then raise exception 'FAIL E: non-owner sees % applications (of %)', n_apps, c_apps; end if;
  if n_inv_other <> 0 then raise exception 'FAIL E: non-owner sees % invoices they do not own (of % such)', n_inv_other, c_inv_other; end if;
  if n_inv > 0 then raise notice 'REVIEW E: harness user sees % invoice(s) it owns (the seeded harness sponsorship) - expected', n_inv; end if;
  if n_pin  <> 0 then raise exception 'FAIL E: non-owner sees % pinup entries', n_pin; end if;
  if n_reg  <> 0 then raise exception 'FAIL E: non-owner sees % panel registrations', n_reg; end if;
  if n_sub  <> 0 then raise exception 'FAIL E: non-owner sees % aatc submissions', n_sub; end if;
  if n_prof <> 1 then raise exception 'FAIL E: non-owner sees % profiles, want exactly their own', n_prof; end if;
  if exists (select 1 from public.pinup_entries where full_name = 'ZZ VERIFY 076') then raise exception 'FAIL E: fixture not removed'; end if;
  raise notice 'PASS E: a signed-in non-owner sees 0 of % applications, 0 of % invoices it does not own (% total), 0 pinup entries, 0 panel registrations, 0 aatc submissions, and 1 of % profiles (their own)', c_apps, c_inv_other, c_inv, c_prof;
end $$;

-- ── Z. residue  (results grid; want zero rows)
select 'pinup' as t, id::text from public.pinup_entries where full_name = 'ZZ VERIFY 076'
union all select 'panel', id::text from public.panel_registrations where name = 'ZZ VERIFY 076'
union all select 'aatc', id::text from public.aatc_submissions where artist_name = 'ZZ VERIFY 076';
