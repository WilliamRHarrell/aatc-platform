-- ============================================================
-- HOW TO RUN: after 104 is applied, paste the whole file in a FRESH session
-- (block B refuses to run if aatc.woh_import is already set). Read the
-- MESSAGES pane. A failure RAISES and aborts (the failing block rolls back).
-- Storage is asserted from pg_policies only; nothing here writes storage
-- tables (rules.md).
--
-- Needs an admin profile. Blocks B and C each use their own INACTIVE event
-- "ZZ VERIFY 104 (DELETE ME)" and delete it. Block C moves its one published
-- fixture onto the active event for the view check only (the view shows the
-- active event alone, like 098), then deletes it; nothing else on the live
-- event is written.
-- ============================================================

-- ── A. buckets, storage policy, table, RLS, view, index, switch  (NOTICE pane)
do $$
declare b record; v_missing text; n int;
begin
  select public, file_size_limit, allowed_mime_types into b from storage.buckets where id = 'wall-of-honor-submissions';
  if not found then raise exception 'FAIL A: bucket wall-of-honor-submissions missing'; end if;
  if b.public then raise exception 'FAIL A: bucket wall-of-honor-submissions is PUBLIC'; end if;
  if b.file_size_limit is distinct from 10485760 then raise exception 'FAIL A: wall-of-honor-submissions limit is %, expected 10485760', b.file_size_limit; end if;
  if not (b.allowed_mime_types @> array['image/jpeg','image/png','image/webp'] and cardinality(b.allowed_mime_types) = 3) then
    raise exception 'FAIL A: wall-of-honor-submissions types are %', b.allowed_mime_types;
  end if;
  select public, file_size_limit, allowed_mime_types into b from storage.buckets where id = 'wall-of-honor';
  if not found then raise exception 'FAIL A: bucket wall-of-honor missing'; end if;
  if not b.public then raise exception 'FAIL A: bucket wall-of-honor is not public'; end if;
  if b.file_size_limit is distinct from 10485760 then raise exception 'FAIL A: wall-of-honor limit is %, expected 10485760', b.file_size_limit; end if;
  if not (b.allowed_mime_types @> array['image/jpeg','image/png','image/webp'] and cardinality(b.allowed_mime_types) = 3) then
    raise exception 'FAIL A: wall-of-honor types are %', b.allowed_mime_types;
  end if;

  -- Exactly one policy names the submissions bucket: admin read.
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') || coalesce(with_check, '')) like '%wall-of-honor-submissions%') <> 1 then
    raise exception 'FAIL A: expected exactly 1 storage policy on wall-of-honor-submissions, found %',
      (select string_agg(policyname || ' ' || cmd, ', ') from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and (coalesce(qual, '') || coalesce(with_check, '')) like '%wall-of-honor-submissions%');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'wall-of-honor-submissions: admin read' and cmd = 'SELECT'
                  and position('is_admin' in coalesce(qual, '')) > 0) then
    raise exception 'FAIL A: wall-of-honor-submissions: admin read missing or not admin-only';
  end if;
  -- No policy names the public wall-of-honor bucket (only the service role writes it).
  n := (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
         and (coalesce(qual, '') || coalesce(with_check, '')) like '%wall-of-honor%')
     - (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
         and (coalesce(qual, '') || coalesce(with_check, '')) like '%wall-of-honor-submissions%');
  if n <> 0 then raise exception 'FAIL A: % storage policies name the public wall-of-honor bucket, expected 0', n; end if;

  if to_regclass('public.wall_of_honor_entries') is null then raise exception 'FAIL A: wall_of_honor_entries missing'; end if;
  select string_agg(c, ', ') into v_missing
    from unnest(array['id','event_id','status','is_published','published_at','submitted_at','decided_at','decided_by','admin_notes',
                      'honoree_name','honoree_rank','branch','unit','service_years','tribute','tribute_display',
                      'photo_paths','public_photo_paths','submitter_name','submitter_relationship','submitter_email','submitter_phone',
                      'consent_at','consent_social','include_in_print']) c
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_entries' and column_name = c);
  if v_missing is not null then raise exception 'FAIL A: wall_of_honor_entries columns missing: %', v_missing; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.wall_of_honor_entries'::regclass) then
    raise exception 'FAIL A: RLS is off on wall_of_honor_entries';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'wall_of_honor_entries') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wall_of_honor_entries'
                     and policyname = 'wall_of_honor: admin all' and cmd = 'ALL' and roles = '{authenticated}'
                     and qual like '%is_admin()%' and with_check like '%is_admin()%') then
    raise exception 'FAIL A: wall_of_honor_entries must have exactly the admin-all policy';
  end if;
  if has_table_privilege('anon', 'public.wall_of_honor_entries', 'select') then raise exception 'FAIL A: anon can read wall_of_honor_entries'; end if;
  if has_table_privilege('anon', 'public.wall_of_honor_entries', 'insert') then raise exception 'FAIL A: anon can insert into wall_of_honor_entries'; end if;
  if not has_table_privilege('anon', 'public.wall_of_honor_public', 'select') then raise exception 'FAIL A: anon cannot read wall_of_honor_public'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.wall_of_honor_entries'::regclass and tgname = 'wall_of_honor_guard_trg' and not tgisinternal) then
    raise exception 'FAIL A: wall_of_honor_guard_trg missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'wall_of_honor_entries'
                  and indexname = 'wall_of_honor_one_active_per_submitter_honoree' and indexdef like 'CREATE UNIQUE INDEX%') then
    raise exception 'FAIL A: unique index wall_of_honor_one_active_per_submitter_honoree missing';
  end if;
  if has_function_privilege('anon', 'public.paths_under_folder(text[], text)', 'execute')
     or has_function_privilege('anon', 'public.wall_of_honor_guard()', 'execute') then
    raise exception 'FAIL A: anon can execute a 104 function';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events'
                  and column_name = 'wall_of_honor_open' and is_nullable = 'NO' and column_default = 'false') then
    raise exception 'FAIL A: events.wall_of_honor_open missing or not NOT NULL default false';
  end if;
  raise notice 'PASS A: private and public 10 MB JPG/PNG/WebP buckets, 1 admin-read storage policy, table with RLS and 1 admin policy, anon has no table access but reads the view, trigger, unique index, switch default off';
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures in an inactive ZZ event)
do $$
declare v_admin uuid; v_event uuid; v_p uuid; v_imp uuid; v_adm uuid; r record; v_ok boolean;
begin
  v_admin := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  if v_admin is null then raise exception 'ABORT: no admin profile'; end if;
  if coalesce(current_setting('aatc.woh_import', true), '') <> '' then
    raise exception 'ABORT B: aatc.woh_import is already set in this session (%); run the file in a fresh session', current_setting('aatc.woh_import', true);
  end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 104 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false) returning id into v_event;

  -- B1. a supplied consent_at is replaced by the database clock
  insert into public.wall_of_honor_entries (event_id, honoree_name, branch, tribute, submitter_name, submitter_relationship, submitter_email, consent_at)
  values (v_event, 'ZZ Honoree One', 'ZZ Branch', 'ZZ original tribute', 'ZZ Submitter', 'ZZ Relation', 'zz-104-a@example.com', timestamptz '2000-01-01')
  returning id into v_p;
  if (select consent_at from public.wall_of_honor_entries where id = v_p) < now() - interval '1 minute' then
    raise exception 'FAIL B1: a supplied consent_at was kept on a normal insert';
  end if;
  raise notice 'PASS B1: consent_at is the database clock on a normal insert';

  -- B2. the trusted import (no signed-in user, aatc.woh_import on) keeps it
  perform set_config('aatc.woh_import', 'on', true);
  insert into public.wall_of_honor_entries (event_id, honoree_name, branch, tribute, submitter_name, submitter_relationship, submitter_email, consent_at)
  values (v_event, 'ZZ Honoree Import', 'ZZ Branch', 'ZZ imported tribute', 'ZZ Submitter', 'ZZ Relation', 'zz-104-imp@example.com', timestamptz '2000-01-01')
  returning id into v_imp;
  perform set_config('aatc.woh_import', '', true);
  if (select consent_at from public.wall_of_honor_entries where id = v_imp) is distinct from timestamptz '2000-01-01' then
    raise exception 'FAIL B2: the trusted import lost its consent_at';
  end if;
  raise notice 'PASS B2: the trusted import keeps the supplied consent_at';

  -- B3. positive control: a signed-in admin with the setting on still gets the stamp
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('aatc.woh_import', 'on', true);
  insert into public.wall_of_honor_entries (event_id, honoree_name, branch, tribute, submitter_name, submitter_relationship, submitter_email, consent_at)
  values (v_event, 'ZZ Honoree Admin', 'ZZ Branch', 'ZZ admin tribute', 'ZZ Submitter', 'ZZ Relation', 'zz-104-adm@example.com', timestamptz '2000-01-01')
  returning id into v_adm;
  perform set_config('aatc.woh_import', '', true);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select consent_at from public.wall_of_honor_entries where id = v_adm) < now() - interval '1 minute' then
    raise exception 'FAIL B3: a signed-in admin backdated consent_at through aatc.woh_import';
  end if;
  raise notice 'PASS B3: a signed-in admin cannot use aatc.woh_import to backdate consent';

  -- B4. the submitted tribute never changes
  update public.wall_of_honor_entries set tribute = 'ZZ rewritten' where id = v_p;
  if (select tribute from public.wall_of_honor_entries where id = v_p) is distinct from 'ZZ original tribute' then
    raise exception 'FAIL B4: the submitted tribute was changed';
  end if;
  raise notice 'PASS B4: the submitted tribute is immutable';

  -- B5. a pending entry cannot be published
  v_ok := false;
  begin
    update public.wall_of_honor_entries set is_published = true where id = v_p;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B5: a pending entry was published'; end if;
  raise notice 'PASS B5: a pending entry cannot be published';

  -- B6. approved but with no public photo: still refused
  update public.wall_of_honor_entries set status = 'approved' where id = v_p;
  v_ok := false;
  begin
    update public.wall_of_honor_entries set is_published = true where id = v_p;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B6: an approved entry with no public photo was published'; end if;
  raise notice 'PASS B6: publishing needs at least one public photo';

  -- B7. approved with a public photo in its own folder: published
  update public.wall_of_honor_entries set public_photo_paths = array[v_p::text || '/photo-0-x.jpg'] where id = v_p;
  update public.wall_of_honor_entries set is_published = true, published_at = now() where id = v_p;
  if not (select is_published from public.wall_of_honor_entries where id = v_p) then raise exception 'FAIL B7: the publish did not land'; end if;
  raise notice 'PASS B7: an approved entry with a public photo publishes';

  -- B8. a photo path outside the entry's own folder is refused (both arrays)
  v_ok := false;
  begin
    update public.wall_of_honor_entries set photo_paths = array[v_imp::text || '/photo-0-x.jpg'] where id = v_p;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B8: a photo path in another entry''s folder was accepted'; end if;
  v_ok := false;
  begin
    update public.wall_of_honor_entries set public_photo_paths = array[v_p::text || '/ok.jpg', 'photo-1-x.jpg'] where id = v_p;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B8: a public photo path outside any folder was accepted'; end if;
  raise notice 'PASS B8: photo paths must sit in the entry''s own folder';

  -- B9. same submitter email, same honoree (case and spaces shifted): refused
  v_ok := false;
  begin
    insert into public.wall_of_honor_entries (event_id, honoree_name, branch, tribute, submitter_name, submitter_relationship, submitter_email)
    values (v_event, '  zz HONOREE one ', 'ZZ Branch', 'ZZ duplicate', 'ZZ Submitter', 'ZZ Relation', 'ZZ-104-A@example.com');
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B9: a duplicate active entry for the same submitter and honoree was accepted'; end if;
  raise notice 'PASS B9: one active entry per submitter email and honoree';

  -- B10. the same honoree from a different email is never blocked
  insert into public.wall_of_honor_entries (event_id, honoree_name, branch, tribute, submitter_name, submitter_relationship, submitter_email)
  values (v_event, 'ZZ Honoree One', 'ZZ Branch', 'ZZ second family', 'ZZ Other Submitter', 'ZZ Relation', 'zz-104-b@example.com');
  raise notice 'PASS B10: the same honoree from a different email is accepted';

  delete from public.wall_of_honor_entries where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 104 (DELETE ME)')
     or exists (select 1 from public.wall_of_honor_entries where submitter_email ilike 'zz-104-%@example.com') then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;

-- ── C. the public view, as anon  (NOTICE pane)
do $$
declare v_event uuid; v_live uuid; v_id uuid := gen_random_uuid(); r record; n int; v_ok boolean;
begin
  v_live := (select id from public.events where is_active limit 1);
  if v_live is null then raise exception 'ABORT: no active event'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 104 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false) returning id into v_event;
  insert into public.wall_of_honor_entries (id, event_id, status, is_published, published_at, honoree_name, honoree_rank, branch, unit, service_years,
                                            tribute, tribute_display, public_photo_paths, submitter_name, submitter_relationship, submitter_email, submitter_phone)
  values (v_id, v_event, 'approved', true, now(), 'ZZ VERIFY 104 Honoree (DELETE ME)', 'ZZ Rank', 'ZZ Branch', 'ZZ Unit', 'ZZ Years',
          'ZZ original tribute', 'ZZ display tribute', array[v_id::text || '/photo-0-x.jpg'], 'ZZ Submitter', 'ZZ Relation', 'zz-104-c@example.com', '000-000-0000');

  -- C1. published on an INACTIVE event: not public
  set local role anon;
  n := (select count(*) from public.wall_of_honor_public where id = v_id);
  reset role;
  if n <> 0 then raise exception 'FAIL C1: an entry of an inactive event is public'; end if;
  raise notice 'PASS C1: entries of an inactive event are not public';

  -- C2. on the active event: exactly one row, honoree fields and the display tribute
  update public.wall_of_honor_entries set event_id = v_live where id = v_id;
  set local role anon;
  n := (select count(*) from public.wall_of_honor_public where id = v_id);
  select * into r from public.wall_of_honor_public where id = v_id;
  reset role;
  if n <> 1 then raise exception 'FAIL C2: expected 1 public row, found %', n; end if;
  if r.honoree_name is distinct from 'ZZ VERIFY 104 Honoree (DELETE ME)' or r.honoree_rank is distinct from 'ZZ Rank'
     or r.branch is distinct from 'ZZ Branch' or r.unit is distinct from 'ZZ Unit' or r.service_years is distinct from 'ZZ Years'
     or r.photo_paths is distinct from array[v_id::text || '/photo-0-x.jpg'] or r.published_at is null then
    raise exception 'FAIL C2: unexpected public row %', row_to_json(r);
  end if;
  if r.tribute is distinct from 'ZZ display tribute' then raise exception 'FAIL C2: the view shows % instead of tribute_display', r.tribute; end if;
  if (select tribute from public.wall_of_honor_entries where id = v_id) is distinct from 'ZZ original tribute' then
    raise exception 'FAIL C2: the table lost the original tribute';
  end if;
  if row_to_json(r)::text like '%zz-104-c@example.com%' or row_to_json(r)::text like '%ZZ Submitter%' or row_to_json(r)::text like '%000-000-0000%' then
    raise exception 'FAIL C2: submitter data is public';
  end if;
  raise notice 'PASS C2: anon sees one published row with honoree fields and tribute_display; the table keeps the original';

  -- C3. unpublished: gone from the view
  update public.wall_of_honor_entries set is_published = false where id = v_id;
  set local role anon;
  n := (select count(*) from public.wall_of_honor_public where id = v_id);
  reset role;
  if n <> 0 then raise exception 'FAIL C3: an unpublished entry is public'; end if;
  raise notice 'PASS C3: an unpublished entry leaves the view';

  -- C4. no submitter column in the view
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_public' and column_name like 'submitter%') then
    raise exception 'FAIL C4: wall_of_honor_public exposes a submitter column';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_public'
              and column_name not in ('id', 'honoree_name', 'honoree_rank', 'branch', 'unit', 'service_years', 'tribute', 'photo_paths', 'published_at')) then
    raise exception 'FAIL C4: wall_of_honor_public exposes a column outside the public list';
  end if;
  raise notice 'PASS C4: the view has honoree columns only';

  -- C5. positive control: anon reading the table is permission denied, not an empty set
  v_ok := false;
  begin
    set local role anon;
    perform 1 from public.wall_of_honor_entries limit 1;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  if not v_ok then raise exception 'FAIL C5: anon read wall_of_honor_entries without a permission error'; end if;
  raise notice 'PASS C5: anon reading the table is permission denied';

  delete from public.wall_of_honor_entries where id = v_id;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 104 (DELETE ME)')
     or exists (select 1 from public.wall_of_honor_entries where submitter_email ilike 'zz-104-%@example.com') then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS C: fixtures removed';
end $$;
