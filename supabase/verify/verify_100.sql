-- ============================================================
-- HOW TO RUN: after 100 is applied, paste the whole file (copy it from the
-- Raw file on develop). Read the MESSAGES pane; a failure RAISES. Block B
-- uses fixtures on the ACTIVE event named "ZZ VERIFY 100 ... (DELETE ME)"
-- and deletes them (badges cascade).
-- ============================================================

-- ── A. structure and access  (NOTICE pane)
do $$
declare v_cols text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.veteran_badges'::regclass) then raise exception 'FAIL A: RLS is off on veteran_badges'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'veteran_badges') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'veteran_badges'
                     and policyname = 'veteran_badges: admin all' and roles = '{authenticated}'
                     and qual like '%is_admin()%' and with_check like '%is_admin()%') then
    raise exception 'FAIL A: veteran_badges must have exactly the admin-all policy';
  end if;
  if has_table_privilege('anon', 'public.veteran_badges', 'select') then raise exception 'FAIL A: anon can read veteran_badges'; end if;
  if not has_table_privilege('anon', 'public.veteran_badges_public', 'select') then raise exception 'FAIL A: anon cannot read veteran_badges_public'; end if;
  select string_agg(column_name::text, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema = 'public' and table_name = 'veteran_badges_public';
  if v_cols is distinct from 'application_id,artist_uid' then raise exception 'FAIL A: veteran_badges_public columns are %', v_cols; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'veteran_badges' and indexname = 'veteran_badges_one_per_subject') then
    raise exception 'FAIL A: unique index veteran_badges_one_per_subject missing';
  end if;
  raise notice 'PASS A: admin-only table, ids-only public view, one badge per subject';
end $$;

-- ── B. who can badge, and what shows  (NOTICE pane)
do $$
declare
  v_admin uuid; v_harness uuid; v_event uuid; v_art uuid; v_ven uuid; u0 text; u1 text; v_ok boolean; n int;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  v_event   := (select id from public.events where is_active limit 1);
  if v_admin is null or v_harness is null or v_event is null then raise exception 'ABORT: admin, RLS harness user or active event missing'; end if;
  perform set_config('request.jwt.claims', '', true);

  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_double_qty, artist_count, total_amount, status, artists)
  values (v_event, v_harness, 'artist', 'ZZ VERIFY 100 SHOP (DELETE ME)', 'ZZ', 'zz-100@example.com', 1, 2,
          public.application_list_price('artist', 0, 1, 0, 0, 0, 2, '[]'::jsonb, false), 'pending',
          jsonb_build_array(jsonb_build_object('name', 'ZZ A'), jsonb_build_object('name', 'ZZ B')))
  returning id into v_art;
  select artists->0->>'uid', artists->1->>'uid' into u0, u1 from public.applications where id = v_art;
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, vendor_single_qty, artist_count, total_amount, status)
  values (v_event, null, 'vendor', 'ZZ VERIFY 100 VENDOR (DELETE ME)', 'ZZ', 'zz-100-v@example.com', 1, 0,
          public.application_list_price('vendor', 0, 0, 1, 0, 0, 0, '[]'::jsonb, false), 'approved')
  returning id into v_ven;

  -- B1. the owner cannot badge themselves, nor read the table
  v_ok := false;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  begin
    insert into public.veteran_badges (application_id, artist_uid) values (v_art, u0);
  exception when insufficient_privilege then v_ok := true;
  end;
  n := (select count(*) from public.veteran_badges);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if not v_ok then raise exception 'FAIL B1: an owner inserted a veteran badge'; end if;
  if n <> 0 then raise exception 'FAIL B1: an owner can read veteran_badges (% rows)', n; end if;
  raise notice 'PASS B1: owners can neither write nor read veteran_badges';

  -- B2. the admin badges artist A and the vendor business; pending: not public
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.veteran_badges (application_id, artist_uid) values (v_art, u0), (v_ven, null);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.veteran_badges_public where application_id = v_art) then raise exception 'FAIL B2: a pending application shows a badge'; end if;
  set local role anon;
  n := (select count(*) from public.veteran_badges_public where application_id = v_ven and artist_uid is null);
  reset role;
  if n <> 1 then raise exception 'FAIL B2: anon does not see the approved vendor business badge'; end if;
  raise notice 'PASS B2: the admin badges; pending hidden; an approved vendor business badge is public';

  -- B3. approved: only the ticked artist shows
  update public.applications set status = 'approved' where id = v_art;
  set local role anon;
  n := (select count(*) from public.veteran_badges_public where application_id = v_art);
  v_ok := exists (select 1 from public.veteran_badges_public where application_id = v_art and artist_uid = u0);
  reset role;
  if n <> 1 or not v_ok then raise exception 'FAIL B3: expected exactly artist A badged, got % row(s)', n; end if;
  raise notice 'PASS B3: only the ticked artist is public';

  -- B4. one badge per subject
  v_ok := false;
  begin
    insert into public.veteran_badges (application_id, artist_uid) values (v_ven, null);
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B4: a second business badge was accepted'; end if;
  raise notice 'PASS B4: one badge per artist or business';

  -- B5. wrong kind and removed artists drop out
  insert into public.veteran_badges (application_id, artist_uid) values (v_art, null), (v_ven, 'not-an-artist');
  if exists (select 1 from public.veteran_badges_public where (application_id = v_art and artist_uid is null) or (application_id = v_ven and artist_uid is not null)) then
    raise exception 'FAIL B5: a business badge on an artist application, or an artist badge on a vendor, is public';
  end if;
  update public.applications set artists = jsonb_build_array(artists->1) where id = v_art;
  if exists (select 1 from public.veteran_badges_public where application_id = v_art) then raise exception 'FAIL B5: an artist removed from the roster still shows'; end if;
  raise notice 'PASS B5: wrong-kind badges and removed artists are not public';

  delete from public.applications where id in (v_art, v_ven);
  if exists (select 1 from public.applications where business_name like 'ZZ VERIFY 100%') or exists (select 1 from public.veteran_badges where application_id in (v_art, v_ven)) then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;
