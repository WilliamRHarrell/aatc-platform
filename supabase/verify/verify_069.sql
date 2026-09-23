-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
--
-- ⚠  WRITES fixtures (bucket_number 9001-9003 on the active event) and removes
-- them. Block E owns teardown; Z only looks.
--
-- The point of this file is block C (anon cannot see a draft) and block D
-- (one champion, and never a draft). Everything else confirms shape.
-- ============================================================

-- ── A. policies, exactly as written  (results grid)
--    want: 2 rows on tattoo_battle_entries, 4 rows on storage.objects for
--    the bucket. Names pinned so a later "helpful" policy shows up here.
select tablename, policyname, cmd, roles::text
  from pg_policies
 where (schemaname = 'public'  and tablename = 'tattoo_battle_entries')
    or (schemaname = 'storage' and tablename = 'objects' and policyname ilike '%tattoo battle%')
 order by tablename, policyname;

-- ── B. bucket shape  (NOTICE pane)
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
end $$;

-- ── C. a draft is invisible to anon; a published row is visible  (NOTICE pane)
--    Control first: the rows exist as postgres. Then set role anon.
do $$
declare v_event uuid; n int;
begin
  v_event := (select id from public.events where is_active limit 1);
  delete from public.tattoo_battle_entries where bucket_number >= 9001;

  insert into public.tattoo_battle_entries (event_id, bucket_number, artist_name, media, is_published)
  values (v_event, 9001, 'ZZ Draft Artist', '[]'::jsonb, false),
         (v_event, 9002, 'ZZ Published Artist', '[{"type":"image","path":"zz/test.jpg"}]'::jsonb, true);

  n := (select count(*) from public.tattoo_battle_entries where bucket_number in (9001, 9002));
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
    n := (select count(*) from public.tattoo_battle_entries where artist_name = 'hacked');
    if n <> 0 then raise exception 'FAIL: anon updated a row'; end if;
    raise notice 'PASS: anon update affected 0 rows';
  exception
    when insufficient_privilege then raise notice 'PASS: anon update refused (42501)';
  end;
  reset role;
end $$;

-- ── D. one champion per event, never a draft  (NOTICE pane)
do $$
declare v_event uuid; v_pub uuid; v_draft uuid; n int;
begin
  v_event := (select id from public.events where is_active limit 1);
  v_pub   := (select id from public.tattoo_battle_entries where bucket_number = 9002);
  v_draft := (select id from public.tattoo_battle_entries where bucket_number = 9001);

  begin
    update public.tattoo_battle_entries set is_champion = true where id = v_draft;
    raise exception 'FAIL: a DRAFT became champion';
  exception
    when check_violation then raise notice 'PASS: a draft cannot be champion (check constraint)';
  end;

  -- publish a second row so two published rows exist, then try two champions
  insert into public.tattoo_battle_entries (event_id, bucket_number, artist_name, media, is_published)
  values (v_event, 9003, 'ZZ Second Published', '[{"type":"image","path":"zz/b.jpg"}]'::jsonb, true);
  update public.tattoo_battle_entries set is_champion = true where id = v_pub;
  begin
    update public.tattoo_battle_entries set is_champion = true where bucket_number = 9003;
    raise exception 'FAIL: two champions on one event';
  exception
    when unique_violation then raise notice 'PASS: a second champion is refused by the partial index';
  end;

  -- The RPC's role check needs auth.uid(); as postgres in the SQL editor it
  -- has none, so the function is asserted by signature and definer flag here.
  -- Its behaviour is exercised from the admin UI (guardedWrite surfaces any
  -- refusal) and the index + constraint above are what it relies on.
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'set_tattoo_battle_champion'
       and p.prosecdef and pg_get_function_arguments(p.oid) = 'p_entry_id uuid'
  ) then raise exception 'FAIL: set_tattoo_battle_champion(uuid) missing or not security definer'; end if;
  raise notice 'PASS: set_tattoo_battle_champion(uuid) exists, security definer';

  n := (select count(*) from public.tattoo_battle_entries where event_id = v_event and is_champion and bucket_number >= 9001);
  if n <> 1 then raise exception 'FAIL: expected exactly 1 fixture champion, found %', n; end if;
end $$;

-- ── E. a published row must be complete; teardown  (NOTICE pane)
do $$
begin
  begin
    update public.tattoo_battle_entries set is_published = true where bucket_number = 9001; -- no artist, no media
    raise exception 'FAIL: an incomplete row was published';
  exception
    when check_violation then raise notice 'PASS: publishing without artist+media is refused';
  end;
  delete from public.tattoo_battle_entries where bucket_number >= 9001;
  raise notice 'PASS: fixtures removed';
end $$;

-- ── F. page_images slot exists  (results grid)  want: 1 row, filled = false until the logo is uploaded
select slug, image_path is not null as filled from public.page_images where slug = 'tattoo-battle-veteran-ink';

-- ── Z. FIXTURE RESIDUE CHECK - run LAST. A clean run is ZERO.
select 'tattoo_battle_entries bucket_number >= 9001' as fixtures_looked_for,
       count(*) as fixtures_remaining
  from public.tattoo_battle_entries where bucket_number >= 9001;
