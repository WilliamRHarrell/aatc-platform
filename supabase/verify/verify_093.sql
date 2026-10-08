-- ============================================================
-- HOW TO RUN: after 093 is applied, paste the whole file. Read the MESSAGES
-- pane. A failure RAISES and aborts (the failing block rolls back). Then run
-- `node scripts/verify-food-truck-docs.mjs`: real uploads and reads go through
-- the Storage API there, never by writing storage tables here (rules.md).
--
-- Needs an admin profile and the RLS harness user. Block B uses its own
-- INACTIVE event "ZZ VERIFY 093 (DELETE ME)" with two trucks (one owned by
-- the harness user) and deletes it. Nothing on the live event is written.
-- ============================================================

-- ── A. bucket, policies, columns, trigger, function  (NOTICE pane)
do $$
declare b record; v_missing text; v_q text;
begin
  select public, file_size_limit, allowed_mime_types into b from storage.buckets where id = 'food-truck-docs';
  if not found then raise exception 'FAIL A: bucket food-truck-docs missing'; end if;
  if b.public then raise exception 'FAIL A: bucket food-truck-docs is PUBLIC'; end if;
  if b.file_size_limit is distinct from 10485760 then raise exception 'FAIL A: food-truck-docs limit is %, expected 10485760', b.file_size_limit; end if;
  if not (b.allowed_mime_types @> array['application/pdf','image/jpeg','image/png'] and cardinality(b.allowed_mime_types) = 3) then
    raise exception 'FAIL A: food-truck-docs types are %', b.allowed_mime_types;
  end if;

  -- Exactly three policies name the bucket: owner insert, admin insert, admin read.
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') || coalesce(with_check, '')) like '%food-truck-docs%') <> 3 then
    raise exception 'FAIL A: expected exactly 3 storage policies on food-truck-docs, found %',
      (select string_agg(policyname || ' ' || cmd, ', ') from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and (coalesce(qual, '') || coalesce(with_check, '')) like '%food-truck-docs%');
  end if;
  select coalesce(with_check, '') into v_q from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'food-truck-docs: owner insert' and cmd = 'INSERT';
  if v_q is null or position('food_trucks' in v_q) = 0 or position('foldername' in v_q) = 0 then
    raise exception 'FAIL A: owner insert is not scoped to the owner''s truck folder: %', v_q;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'food-truck-docs: admin read'
                  and cmd = 'SELECT' and position('is_admin' in coalesce(qual, '')) > 0) then
    raise exception 'FAIL A: food-truck-docs: admin read missing or not admin-only';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and (coalesce(qual, '') || coalesce(with_check, '')) like '%food-truck-docs%' and cmd in ('UPDATE', 'DELETE', 'ALL')) then
    raise exception 'FAIL A: an UPDATE/DELETE/ALL policy exists on food-truck-docs';
  end if;

  select string_agg(c, ', ') into v_missing
    from unnest(array['permit_path','permit_uploaded_at','permit_verified_at','permit_verified_by','license_path','license_uploaded_at','license_verified_at','license_verified_by']) c
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'food_trucks' and column_name = c);
  if v_missing is not null then raise exception 'FAIL A: food_trucks columns missing: %', v_missing; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.food_trucks'::regclass and tgname = 'food_trucks_docs_guard_trg') then
    raise exception 'FAIL A: food_trucks_docs_guard_trg missing';
  end if;
  if has_function_privilege('anon', 'public.set_food_truck_doc_verified(uuid, text, boolean)', 'execute') then
    raise exception 'FAIL A: anon can execute set_food_truck_doc_verified';
  end if;
  if not has_function_privilege('authenticated', 'public.set_food_truck_doc_verified(uuid, text, boolean)', 'execute') then
    raise exception 'FAIL A: authenticated cannot execute set_food_truck_doc_verified (the admin page would break)';
  end if;
  -- 093 changes no table policy: food_trucks keeps exactly its three.
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'food_trucks') <> 3 then
    raise exception 'FAIL A: food_trucks has % policies, expected 3', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'food_trucks');
  end if;
  raise notice 'PASS A: private 10 MB PDF/JPG/PNG bucket, 3 scoped storage policies, 8 columns, guard trigger, admin-only verify function';
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures in an inactive ZZ event)
do $$
declare v_admin uuid; v_harness uuid; v_event uuid; v_own uuid; v_other uuid; r record; v_ok boolean;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_admin is null then raise exception 'ABORT: no admin profile'; end if;
  if v_harness is null then raise exception 'ABORT: RLS harness user missing'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 093 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false) returning id into v_event;
  insert into public.food_trucks (event_id, user_id, business_name, contact_name, email, days)
  values (v_event, v_harness, 'ZZ VERIFY 093 OWN (DELETE ME)', 'ZZ', 'zz-093-own@example.com', array['friday']) returning id into v_own;
  insert into public.food_trucks (event_id, business_name, contact_name, email, days)
  values (v_event, 'ZZ VERIFY 093 OTHER (DELETE ME)', 'ZZ', 'zz-093-other@example.com', array['friday']) returning id into v_other;

  -- B1. a path outside the truck's own folder is refused
  v_ok := false;
  begin
    update public.food_trucks set permit_path = v_other::text || '/permit-x.pdf' where id = v_own;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B1: a permit path in another truck''s folder was accepted'; end if;
  raise notice 'PASS B1: document paths must sit in the truck''s own folder';

  -- B2a. FIRST, before anything in this transaction sets aatc.truck_doc_verify:
  -- an owner's request starts with that setting unset (NULL), and a guard that
  -- compares it without coalesce lets the owner write the verified columns.
  if current_setting('aatc.truck_doc_verify', true) is not null and current_setting('aatc.truck_doc_verify', true) <> '' then
    raise exception 'ABORT B2a: aatc.truck_doc_verify is already set in this session (%); run the file in a fresh session', current_setting('aatc.truck_doc_verify', true);
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  update public.food_trucks set permit_verified_at = now(), permit_verified_by = v_harness where id = v_own;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select permit_verified_at from public.food_trucks where id = v_own) is not null then
    raise exception 'FAIL B2a: the owner set a verification directly (the guard skipped its revert)';
  end if;
  raise notice 'PASS B2a: with the setting unset, the owner cannot write a verification';

  -- B2. the owner records a permit: stamped, unverified; cannot verify it themselves
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  update public.food_trucks set permit_path = v_own::text || '/permit-a.pdf', permit_verified_at = now(), permit_verified_by = v_harness where id = v_own;
  v_ok := false;
  begin
    perform public.set_food_truck_doc_verified(v_own, 'permit', true);
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if not v_ok then raise exception 'FAIL B2: a non-admin ran set_food_truck_doc_verified'; end if;
  select permit_path, permit_uploaded_at, permit_verified_at into r from public.food_trucks where id = v_own;
  if r.permit_path <> v_own::text || '/permit-a.pdf' or r.permit_uploaded_at is null then raise exception 'FAIL B2: the owner''s upload was not recorded: %', r; end if;
  if r.permit_verified_at is not null then raise exception 'FAIL B2: the owner verified their own permit'; end if;
  raise notice 'PASS B2: owner records a permit (stamped, unverified) and cannot verify it';

  -- B3. the admin verifies; refusing a document that was never uploaded
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.set_food_truck_doc_verified(v_own, 'permit', true);
  v_ok := false;
  begin
    perform public.set_food_truck_doc_verified(v_own, 'license', true);
  exception when check_violation then v_ok := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if not v_ok then raise exception 'FAIL B3: a license that was never uploaded was verified'; end if;
  select permit_verified_at, permit_verified_by into r from public.food_trucks where id = v_own;
  if r.permit_verified_at is null or r.permit_verified_by is distinct from v_admin then raise exception 'FAIL B3: verification not recorded with the admin id: %', r; end if;
  raise notice 'PASS B3: admin verifies an uploaded permit; a missing license cannot be verified';

  -- B3b. an owner editing ONLY the verified columns (no new upload) changes nothing.
  -- Isolates the revert: a new path would clear them anyway and hide a broken guard.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  update public.food_trucks set permit_verified_at = null, permit_verified_by = null,
                                license_verified_at = now(), license_verified_by = v_harness where id = v_own;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select permit_verified_at, permit_verified_by, license_verified_at into r from public.food_trucks where id = v_own;
  if r.permit_verified_at is null or r.permit_verified_by is distinct from v_admin or r.license_verified_at is not null then
    raise exception 'FAIL B3b: the owner changed a verification directly: %', r;
  end if;
  raise notice 'PASS B3b: the owner cannot set or clear a verification directly';

  -- B4. a replacement upload by the owner clears the verification
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  update public.food_trucks set permit_path = v_own::text || '/permit-b.pdf' where id = v_own;
  -- and an unrelated profile edit does not touch it
  update public.food_trucks set description = 'ZZ edit' where id = v_own;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select permit_path, permit_verified_at into r from public.food_trucks where id = v_own;
  if r.permit_path <> v_own::text || '/permit-b.pdf' or r.permit_verified_at is not null then
    raise exception 'FAIL B4: a replaced permit kept its verification: %', r;
  end if;
  raise notice 'PASS B4: replacing the document clears its verification';

  delete from public.food_trucks where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 093 (DELETE ME)') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS B: fixtures removed';
end $$;
