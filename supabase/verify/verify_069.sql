-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
--
-- ⚠  WRITES fixtures (bucket_number 9001-9003 on the ACTIVE event only) and
-- removes them. Block E owns teardown; Z only looks.
--
-- The point of this file is block C (anon cannot see a draft, cannot write,
-- cannot call the RPC) and block D (one champion, never a draft, and the RPC
-- actually runs as an admin identity). Everything else confirms shape.
-- ============================================================

-- ── A. policies, exactly as written  (results grid)
--    want: 2 rows on tattoo_battle_entries; 4 rows on storage.objects named
--    "Editorial can list/insert/update/delete tattoo battle media". A fifth
--    row, or one with roles {public}, is a later "helpful" policy - remove it.
select tablename, policyname, cmd, roles::text
  from pg_policies
 where (schemaname = 'public'  and tablename = 'tattoo_battle_entries')
    or (schemaname = 'storage' and tablename = 'objects' and policyname ilike '%tattoo battle%')
 order by tablename, policyname;

-- ── B. bucket shape and privileges  (NOTICE pane)
do $$
declare v_types text[]; v_limit bigint; v_public boolean;
begin
  v_types  := (select allowed_mime_types from storage.buckets where id = 'tattoo-battle-media');
  v_limit  := (select file_size_limit    from storage.buckets where id = 'tattoo-battle-media');
  v_public := (select public             from storage.buckets where id = 'tattoo-battle-media');
  if v_types is null then raise exception 'FAIL: bucket tattoo-battle-media missing'; end if;
  if v_types <> array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'] then
    raise exception 'FAIL: mime list is % - must match the admin accept list', v_types;
  end if;
  if v_limit <> 52428800 then raise exception 'FAIL: size limit is %, want 52428800', v_limit; end if;
  if not v_public then raise exception 'FAIL: bucket is not public'; end if;
  raise notice 'PASS: bucket public, 50 MB, mime list matches the admin input';

  -- Grants, not just policies. Supabase default privileges hand anon ALL at
  -- creation; 069 revokes by name. A pass here means the revoke landed.
  if has_table_privilege('anon', 'public.tattoo_battle_entries', 'insert') then
    raise exception 'FAIL: anon still holds INSERT on tattoo_battle_entries';
  end if;
  if has_table_privilege('anon', 'public.tattoo_battle_entries', 'update') then
    raise exception 'FAIL: anon still holds UPDATE on tattoo_battle_entries';
  end if;
  if has_table_privilege('anon', 'public.tattoo_battle_entries', 'delete') then
    raise exception 'FAIL: anon still holds DELETE on tattoo_battle_entries';
  end if;
  if not has_table_privilege('anon', 'public.tattoo_battle_entries', 'select') then
    raise exception 'FAIL: anon lost SELECT - the public page would render nothing';
  end if;
  if has_function_privilege('anon', 'public.set_tattoo_battle_champion(uuid)', 'execute') then
    raise exception 'FAIL: anon can EXECUTE set_tattoo_battle_champion';
  end if;
  if not has_function_privilege('authenticated', 'public.set_tattoo_battle_champion(uuid)', 'execute') then
    raise exception 'FAIL: authenticated cannot execute set_tattoo_battle_champion';
  end if;
  raise notice 'PASS: anon has SELECT only; anon cannot execute the champion RPC';
end $$;

-- ── C. a draft is invisible to anon; anon cannot write or call the RPC  (NOTICE pane)
--    Control first: the rows exist as postgres. Then set role anon.
do $$
declare v_event uuid; n int;
begin
  v_event := (select id from public.events where is_active limit 1);
  if v_event is null then raise exception 'FAIL: no active event'; end if;
  delete from public.tattoo_battle_entries where event_id = v_event and bucket_number >= 9001;

  insert into public.tattoo_battle_entries (event_id, bucket_number, artist_name, media, is_published)
  values (v_event, 9001, 'ZZ Draft Artist', '[]'::jsonb, false),
         (v_event, 9002, 'ZZ Published Artist', '[{"type":"image","path":"zz/test.jpg"}]'::jsonb, true);

  n := (select count(*) from public.tattoo_battle_entries where event_id = v_event and bucket_number in (9001, 9002));
  if n <> 2 then raise exception 'FAIL: control - expected 2 fixture rows, found %', n; end if;
  raise notice 'PASS: control - both fixture rows exist as postgres';

  set local role anon;
  n := (select count(*) from public.tattoo_battle_entries where bucket_number = 9001);
  if n <> 0 then raise exception 'FAIL: anon can see the DRAFT (bucket 9001)'; end if;
  n := (select count(*) from public.tattoo_battle_entries where bucket_number = 9002);
  if n <> 1 then raise exception 'FAIL: anon cannot see the PUBLISHED row (bucket 9002) - policy too tight or grant missing'; end if;
  raise notice 'PASS: anon sees the published row and not the draft';

  begin
    insert into public.tattoo_battle_entries (event_id, bucket_number) values (v_event, 9003);
    raise exception 'FAIL: anon inserted a row';
  exception
    when insufficient_privilege then raise notice 'PASS: anon insert refused (42501)';
  end;
  begin
    update public.tattoo_battle_entries set artist_name = 'hacked' where bucket_number = 9002;
    raise exception 'FAIL: anon update was not refused at the grant';
  exception
    when insufficient_privilege then raise notice 'PASS: anon update refused (42501)';
  end;
  begin
    delete from public.tattoo_battle_entries where bucket_number = 9002;
    raise exception 'FAIL: anon delete was not refused at the grant';
  exception
    when insufficient_privilege then raise notice 'PASS: anon delete refused (42501)';
  end;
  begin
    perform public.set_tattoo_battle_champion(null);
    raise exception 'FAIL: anon executed the champion RPC';
  exception
    when insufficient_privilege then raise notice 'PASS: anon cannot call set_tattoo_battle_champion (42501)';
  end;
  reset role;
end $$;

-- ── D. one champion per event, never a draft; the RPC as an admin  (NOTICE pane)
--    Skips (with a notice) if a REAL champion already exists on the active
--    event - re-running after the show must not disturb it.
do $$
declare v_event uuid; v_pub uuid; v_draft uuid; v_admin uuid; n int; v_ret uuid;
begin
  v_event := (select id from public.events where is_active limit 1);
  if exists (select 1 from public.tattoo_battle_entries where event_id = v_event and is_champion and bucket_number < 9001) then
    raise notice 'SKIP: a real champion exists on the active event - block D not run';
    return;
  end if;
  v_pub   := (select id from public.tattoo_battle_entries where event_id = v_event and bucket_number = 9002);
  v_draft := (select id from public.tattoo_battle_entries where event_id = v_event and bucket_number = 9001);

  begin
    update public.tattoo_battle_entries set is_champion = true where id = v_draft;
    raise exception 'FAIL: a DRAFT became champion';
  exception
    when check_violation then raise notice 'PASS: a draft cannot be champion (check constraint)';
  end;

  insert into public.tattoo_battle_entries (event_id, bucket_number, artist_name, media, is_published)
  values (v_event, 9003, 'ZZ Second Published', '[{"type":"image","path":"zz/b.jpg"}]'::jsonb, true);
  update public.tattoo_battle_entries set is_champion = true where id = v_pub;
  begin
    update public.tattoo_battle_entries set is_champion = true where event_id = v_event and bucket_number = 9003;
    raise exception 'FAIL: two champions on one event';
  exception
    when unique_violation then raise notice 'PASS: a second champion is refused by the partial index';
  end;

  -- Run the RPC as a real admin identity: has_role() reads auth.uid() from
  -- request.jwt.claims, which set_config can supply inside this transaction.
  v_admin := (select id from public.profiles where role = 'admin' limit 1);
  if v_admin is null then raise exception 'FAIL: no admin profile to impersonate'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ret := (select id from public.set_tattoo_battle_champion((select id from public.tattoo_battle_entries where event_id = v_event and bucket_number = 9003)));
  reset role;
  perform set_config('request.jwt.claims', '', true);
  n := (select count(*) from public.tattoo_battle_entries where event_id = v_event and is_champion and bucket_number >= 9001);
  if n <> 1 then raise exception 'FAIL: after the RPC expected exactly 1 fixture champion, found %', n; end if;
  if (select bucket_number from public.tattoo_battle_entries where id = v_ret) <> 9003 then
    raise exception 'FAIL: the RPC crowned the wrong row';
  end if;
  raise notice 'PASS: set_tattoo_battle_champion moved the crown from 9002 to 9003 atomically';
end $$;

-- ── E. a published row must be complete; media shape; teardown  (NOTICE pane)
do $$
declare v_event uuid;
begin
  v_event := (select id from public.events where is_active limit 1);
  begin
    update public.tattoo_battle_entries set is_published = true where event_id = v_event and bucket_number = 9001; -- no artist, no media
    raise exception 'FAIL: an incomplete row was published';
  exception
    when check_violation then raise notice 'PASS: publishing without artist+media is refused';
  end;
  begin
    update public.tattoo_battle_entries set media = '[{}]'::jsonb where event_id = v_event and bucket_number = 9001;
    raise exception 'FAIL: a shapeless media item was accepted';
  exception
    when check_violation then raise notice 'PASS: media items must be {type: image|video, path}';
  end;
  delete from public.tattoo_battle_entries where event_id = v_event and bucket_number >= 9001;
  raise notice 'PASS: fixtures removed';
end $$;

-- ── F. page_images slot exists  (results grid)  want: 1 row, filled = false until the logo is uploaded
select slug, image_path is not null as filled from public.page_images where slug = 'tattoo-battle-veteran-ink';

-- ── Z. FIXTURE RESIDUE CHECK - run LAST. A clean run is ZERO.
select 'tattoo_battle_entries bucket_number >= 9001 (active event)' as fixtures_looked_for,
       count(*) as fixtures_remaining
  from public.tattoo_battle_entries
 where bucket_number >= 9001
   and event_id = (select id from public.events where is_active limit 1);
