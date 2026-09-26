-- ============================================================
-- HOW TO RUN: after 079b is applied, paste the whole file. Read the MESSAGES
-- pane and the results grids. A failure RAISES and aborts.
-- Then re-run verify_079.sql and verify_079_matrix.sql (079's block E needs
-- this column nullable; that is what failed on 2026-09-26).
-- ⚠  Block C writes two ZZ applications (one NULL-owner, one owned by the RLS
-- harness user) and removes both in the same block.
-- ============================================================

-- ── A. the column is nullable  (NOTICE pane)
do $$
begin
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'applications' and column_name = 'user_id') <> 'YES' then
    raise exception 'FAIL A: applications.user_id is still NOT NULL - 079b is not applied';
  end if;
  raise notice 'PASS A: applications.user_id is nullable';
end $$;

-- ── B. the LIVE policies that decide who sees an application  (results grid, then NOTICE)
-- Read this grid: every owner test should be an equality with auth.uid().
select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename in ('applications', 'exhibitors', 'booths', 'invoices')
 order by tablename, policyname;
do $$
declare bad text;
begin
  bad := (select string_agg(tablename || ' / ' || policyname, ', ')
            from pg_policies
           where schemaname = 'public' and tablename in ('applications', 'exhibitors', 'booths', 'invoices')
             and (coalesce(qual, '') ~* 'user_id\s+is\s+null' or coalesce(with_check, '') ~* 'user_id\s+is\s+null'
                  or coalesce(qual, '') ~* 'coalesce\s*\(\s*(a\.)?user_id' or coalesce(with_check, '') ~* 'coalesce\s*\(\s*(a\.)?user_id'));
  if bad is not null then raise exception 'FAIL B: a policy treats a NULL owner specially: %', bad; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'applications'
                  and policyname = 'applications: own insert' and cmd = 'INSERT' and with_check ~ 'auth\.uid\(\)') then
    raise exception 'FAIL B: "applications: own insert" is missing or no longer checks auth.uid()';
  end if;
  raise notice 'PASS B: no policy on applications/exhibitors/booths/invoices special-cases a NULL owner; own insert still checks auth.uid()';
end $$;

-- ── C. a NULL-owner application is invisible to an ordinary account  (NOTICE pane; fixture)
do $$
declare v_uid uuid; v_event uuid; v_null uuid; v_own uuid; n int;
begin
  v_uid := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_uid is null then raise exception 'ABORT: RLS harness user missing'; end if;
  if (select role::text from public.profiles where id = v_uid) not in ('exhibitor', 'public') then raise exception 'ABORT: harness user is not an ordinary account (role must be exhibitor or public)'; end if;
  if exists (select 1 from public.applications where user_id = v_uid and status in ('pending','approved','waitlisted')) then raise exception 'ABORT: harness user already has an active application'; end if;
  v_event := (select id from public.events where is_active order by start_date limit 1);

  -- fixture 1: admin-added shape (no JWT, so the insert clamp exempts it, as for the admin form)
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (v_event, null, 'vendor', 'ZZ VERIFY 079b NULL (DELETE ME)', 'ZZ', 'zz-verify-079b-null@example.com', 50000, 'approved', 1, 0)
  returning id into v_null;

  -- fixture 2 (positive control): the harness user's own application at the list price
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (v_event, v_uid, 'vendor', 'ZZ VERIFY 079b OWN (DELETE ME)', 'ZZ', 'zz-verify-079b-own@example.com', 50000, 'pending', 1, 0);

  -- C1. read: own row visible (control), NULL-owner row not
  n := (select count(*) from public.applications where business_name = 'ZZ VERIFY 079b OWN (DELETE ME)');
  if n <> 1 then reset role; raise exception 'FAIL C1 control: the harness user cannot read its own application (%)', n; end if;
  n := (select count(*) from public.applications where id = v_null);
  if n <> 0 then reset role; raise exception 'FAIL C1: an ordinary account can read a NULL-owner application'; end if;

  -- C2. update: own row updates (control), NULL-owner row is untouched
  update public.applications set notes = 'ZZ own touched' where business_name = 'ZZ VERIFY 079b OWN (DELETE ME)';
  get diagnostics n = row_count;
  if n <> 1 then reset role; raise exception 'FAIL C2 control: the harness user could not update its own application'; end if;
  update public.applications set notes = 'ZZ null touched' where id = v_null;
  get diagnostics n = row_count;
  if n <> 0 then reset role; raise exception 'FAIL C2: an ordinary account updated a NULL-owner application'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_own := (select id from public.applications where business_name = 'ZZ VERIFY 079b OWN (DELETE ME)');
  raise notice 'PASS C1/C2: own row readable and updatable; NULL-owner row neither';

  -- C3. an ordinary account cannot insert a NULL-owner row (own insert: auth.uid() = user_id)
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
    values (v_event, null, 'vendor', 'ZZ VERIFY 079b NULLINS (DELETE ME)', 'ZZ', 'zz-verify-079b-ins@example.com', 50000, 'pending', 1, 0);
    reset role;
    raise exception 'FAIL C3: an ordinary account inserted an application with user_id NULL';
  exception when insufficient_privilege then
    reset role; perform set_config('request.jwt.claims', '', true);
    raise notice 'PASS C3: an ordinary account cannot insert a NULL-owner application (42501)';
  end;

  -- C4. invoices: owns_invoice() is false for a NULL-owner application, true for the harness's own (control)
  if not public.owns_invoice(v_own, null, v_uid) then raise exception 'FAIL C4 control: owns_invoice false for the owner'; end if;
  if public.owns_invoice(v_null, null, v_uid) then raise exception 'FAIL C4: owns_invoice true for a NULL-owner application'; end if;
  raise notice 'PASS C4: owns_invoice true for the owner, false for a NULL-owner application';

  -- C5. two NULL-owner active applications coexist for one event (the index counts applicants only)
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (v_event, null, 'vendor', 'ZZ VERIFY 079b NULL2 (DELETE ME)', 'ZZ', 'zz-verify-079b-null2@example.com', 50000, 'approved', 1, 0);
  raise notice 'PASS C5: a second NULL-owner approved application for the same event is accepted';

  delete from public.applications where business_name like 'ZZ VERIFY 079b%';
  if exists (select 1 from public.applications where business_name like 'ZZ VERIFY 079b%') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS C: fixtures removed';
end $$;

-- ── D. REVIEW, not a failure: applications owned by an ADMIN account  (results grid)
-- The /admin/booths add form wrote the signed-in admin's user_id before PR #17.
-- Rows here whose email is not the admin's own are hand-added booths; they
-- show in that admin's /portal and occupy the admin's one active slot per
-- event. Nothing rewrites them; decide per row.
select a.id, a.business_name, a.email as application_email, a.status, a.created_at,
       p.email as owner_admin_email
  from public.applications a
  join public.profiles p on p.id = a.user_id
 where p.role = 'admin'
 order by a.created_at;

-- ── Z. residue  (results grid; want zero rows)
select id, business_name from public.applications where business_name like 'ZZ VERIFY 079%';
