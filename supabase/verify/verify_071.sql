-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
--
-- ⚠  Block D WRITES one fixture (a ZZ vendor application owned by the RLS
-- harness user) and deletes it at the end of the same block. It ABORTS if the
-- harness user rls-harness@allamericantattooconvention.com is missing, so it
-- cannot run against the wrong database. Nothing else writes.
-- ============================================================

-- ── A. storage policies  (results grid, then a hard check)
--    want exactly: "application-docs: admin insert" INSERT,
--                  "application-docs: admin read"   SELECT,
--                  "application-docs: own folder insert" INSERT.
--    "authenticated upload" and "own read" must be GONE.
select policyname, cmd, roles::text, coalesce(qual, with_check) as expr
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'application-docs:%'
 order by policyname;

do $$
declare n int; bad int;
begin
  n := (select count(*) from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname in ('application-docs: admin insert', 'application-docs: admin read', 'application-docs: own folder insert'));
  if n <> 3 then raise exception 'FAIL: expected the 3 new application-docs policies, found %', n; end if;
  bad := (select count(*) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname in ('application-docs: authenticated upload', 'application-docs: own read'));
  if bad <> 0 then raise exception 'FAIL: % dropped policy(ies) still present', bad; end if;
  n := (select count(*) from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname like 'application-docs:%');
  if n <> 3 then raise exception 'FAIL: % application-docs policies in total, expected 3 - something extra exists', n; end if;
  -- Nothing on this bucket for anon, and nothing for UPDATE / DELETE.
  n := (select count(*) from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname like 'application-docs:%'
           and ('anon' = any(roles) or cmd in ('UPDATE', 'DELETE')));
  if n <> 0 then raise exception 'FAIL: an application-docs policy grants anon, UPDATE or DELETE'; end if;
  raise notice 'PASS A: application-docs carries exactly admin insert, admin read, own folder insert';
end $$;

-- ── B. columns and FK  (NOTICE pane)
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'applications' and column_name = 'veteran_doc_verified_at' and data_type = 'timestamp with time zone') then
    raise exception 'FAIL: applications.veteran_doc_verified_at missing or not timestamptz';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'applications' and column_name = 'veteran_doc_verified_by' and data_type = 'uuid') then
    raise exception 'FAIL: applications.veteran_doc_verified_by missing or not uuid';
  end if;
  if not exists (select 1 from pg_constraint c
                  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
                 where c.conrelid = 'public.applications'::regclass and c.contype = 'f'
                   and a.attname = 'veteran_doc_verified_by' and c.confrelid = 'public.profiles'::regclass) then
    raise exception 'FAIL: veteran_doc_verified_by has no FK to profiles';
  end if;
  raise notice 'PASS B: verification columns present with FK';
end $$;

-- ── C. the clamp function carries 071  (NOTICE pane)
do $$
declare body text;
begin
  body := pg_get_functiondef('public.applications_protect_staff_columns'::regproc);
  if position('veteran_doc_verified_at := old.veteran_doc_verified_at' in body) = 0 then
    raise exception 'FAIL: clamp does not restore veteran_doc_verified_at for owners';
  end if;
  if position('new.veteran_id_url is distinct from old.veteran_id_url' in body) = 0 then
    raise exception 'FAIL: clamp has no reset-on-document-change';
  end if;
  if position('auth.uid() is null' in body) = 0 then
    raise exception 'FAIL: the 043 service-role exemption was lost';
  end if;
  body := pg_get_functiondef('public.applications_force_safe_insert'::regproc);
  if position('new.veteran_doc_verified_at := null' in body) = 0 then
    raise exception 'FAIL: insert clamp does not null veteran_doc_verified_at';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'applications_force_safe_insert_trg' and tgrelid = 'public.applications'::regclass) then
    raise exception 'FAIL: applications_force_safe_insert_trg is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'applications_protect_staff_columns_trg' and tgrelid = 'public.applications'::regclass) then
    raise exception 'FAIL: applications_protect_staff_columns_trg is missing';
  end if;
  raise notice 'PASS C: clamp function body and trigger present';
end $$;

-- ── D. behaviour, with a fixture  (NOTICE pane; writes and cleans up)
do $$
declare
  v_uid uuid; v_event uuid; v_app uuid;
  v_at timestamptz; v_by uuid; v_notes text;
begin
  v_uid := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_uid is null then raise exception 'ABORT: RLS harness user missing - wrong database or partial cleanup'; end if;
  v_event := (select id from public.events where is_active order by start_date limit 1);
  if v_event is null then raise exception 'ABORT: no active event'; end if;

  -- D0. An OWNER inserting a row cannot arrive verified (insert clamp). The
  --     insert itself is the positive control: it must land.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  insert into public.applications
    (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status,
     is_veteran, veteran_id_url, vendor_single_qty, artist_count,
     veteran_doc_verified_at, veteran_doc_verified_by)
  values
    (v_event, v_uid, 'vendor', 'ZZ VERIFY 071 (DELETE ME)', 'ZZ', 'zz-verify-071@example.com', 35000, 'pending', -- 35000 = list price (single, veteran; 079 refuses an owner total that differs)
     true, 'zz/verify-071-veteran-id.png', 1, 0,
     now(), v_uid);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_app := (select id from public.applications where business_name = 'ZZ VERIFY 071 (DELETE ME)' and user_id = v_uid);
  if v_app is null then raise exception 'FAIL D0 control: the owner insert did not land'; end if;
  v_at := (select veteran_doc_verified_at from public.applications where id = v_app);
  v_by := (select veteran_doc_verified_by from public.applications where id = v_app);
  if v_at is not null or v_by is not null then
    raise exception 'FAIL D0: an owner inserted a row already verified (at=%, by=%)', v_at, v_by;
  end if;
  raise notice 'PASS D0: owner insert landed and arrived unverified';

  -- D1. An OWNER cannot verify their own document (clamp), but the same update
  --     lands on a column they may edit (positive control that the update ran).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  update public.applications
     set veteran_doc_verified_at = now(), veteran_doc_verified_by = v_uid, notes = 'ZZ owner touched'
   where id = v_app;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  v_at    := (select veteran_doc_verified_at from public.applications where id = v_app);
  v_by    := (select veteran_doc_verified_by from public.applications where id = v_app);
  v_notes := (select notes from public.applications where id = v_app);
  if v_notes is distinct from 'ZZ owner touched' then
    raise exception 'FAIL D1 control: the owner update did not land at all (notes = %) - the clamp result below would be vacuous', v_notes;
  end if;
  if v_at is not null or v_by is not null then
    raise exception 'FAIL D1: an owner set their own verification (at=%, by=%)', v_at, v_by;
  end if;
  raise notice 'PASS D1: owner update landed on notes and was clamped off the verification columns';

  -- D2. A trusted writer (no auth.uid) can verify, and an unrelated edit keeps it.
  update public.applications set veteran_doc_verified_at = now(), veteran_doc_verified_by = v_uid where id = v_app;
  update public.applications set notes = 'ZZ unrelated edit' where id = v_app;
  v_at := (select veteran_doc_verified_at from public.applications where id = v_app);
  if v_at is null then raise exception 'FAIL D2: verification did not survive an unrelated edit (reset is unconditional)'; end if;
  raise notice 'PASS D2: verification set and kept across an unrelated edit';

  -- D3. Replacing the document clears BOTH columns, even for a trusted writer.
  update public.applications set veteran_id_url = 'zz/verify-071-veteran-id-2.png' where id = v_app;
  v_at := (select veteran_doc_verified_at from public.applications where id = v_app);
  v_by := (select veteran_doc_verified_by from public.applications where id = v_app);
  if v_at is not null or v_by is not null then
    raise exception 'FAIL D3: document replaced but verification kept (at=%, by=%)', v_at, v_by;
  end if;
  raise notice 'PASS D3: replacing the document un-verified it';

  -- Cleanup belongs with the last block that needs the fixture.
  delete from public.applications where id = v_app;
  if exists (select 1 from public.applications where id = v_app) then
    raise exception 'FAIL: fixture % not deleted', v_app;
  end if;
  raise notice 'PASS D: fixture removed';
end $$;

-- ── E. the bucket is private  (NOTICE pane)
do $$
declare pub boolean;
begin
  pub := (select public from storage.buckets where id = 'application-docs');
  if pub is null then raise exception 'FAIL: bucket application-docs missing'; end if;
  if pub then raise exception 'FAIL: bucket application-docs is PUBLIC'; end if;
  raise notice 'PASS E: application-docs is private';
end $$;

-- ── Z. residue  (results grid; want zero rows)
select id, business_name from public.applications where business_name like 'ZZ VERIFY 071%';
