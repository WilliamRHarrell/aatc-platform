-- ============================================================
-- HOW TO RUN: after 098 is applied, paste the whole file. Read the MESSAGES
-- pane; a failure RAISES. Block B uses fixtures on the ACTIVE event (the
-- view only shows the active event), named "ZZ VERIFY 098 ... (DELETE ME)",
-- and deletes them at the end (vip rows cascade).
-- ============================================================

-- ── A. structure and access  (NOTICE pane)
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.applications'::regclass and tgname = 'applications_roster_uid_trg' and not tgisinternal) then
    raise exception 'FAIL A: applications_roster_uid_trg missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.vip_featured_artists'::regclass) then
    raise exception 'FAIL A: RLS is off on vip_featured_artists';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'vip_featured_artists') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vip_featured_artists'
                     and policyname = 'vip_featured_artists: admin all' and roles = '{authenticated}'
                     and qual like '%is_admin()%' and with_check like '%is_admin()%') then
    raise exception 'FAIL A: vip_featured_artists must have exactly the admin-all policy';
  end if;
  if has_table_privilege('anon', 'public.vip_featured_artists', 'select') then raise exception 'FAIL A: anon can read vip_featured_artists'; end if;
  if not has_table_privilege('anon', 'public.vip_featured_public', 'select') then raise exception 'FAIL A: anon cannot read vip_featured_public'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vip_featured_public'
              and column_name not in ('id', 'display_order', 'artist_name', 'shop', 'instagram', 'photo_url', 'tv_credit', 'bio')) then
    raise exception 'FAIL A: vip_featured_public exposes a column outside the public list';
  end if;
  if exists (select 1 from public.applications a, jsonb_array_elements(a.artists) as x(value)
              where jsonb_typeof(a.artists) = 'array' and jsonb_typeof(x.value) = 'object' and coalesce(x.value->>'uid', '') = '') then
    raise exception 'FAIL A: a roster artist has no uid (backfill)';
  end if;
  if exists (select 1 from public.applications a
              where jsonb_typeof(a.artists) = 'array'
                and (select count(*) from jsonb_array_elements(a.artists) x where jsonb_typeof(x) = 'object')
                 <> (select count(distinct x->>'uid') from jsonb_array_elements(a.artists) x where jsonb_typeof(x) = 'object')) then
    raise exception 'FAIL A: a roster has duplicate uids';
  end if;
  raise notice 'PASS A: trigger, admin-only table, public view columns, every artist has a unique uid';
end $$;

-- ── B. uids, the view, and who can write  (NOTICE pane)
do $$
declare
  v_admin uuid; v_harness uuid; v_event uuid; v_app uuid; v_solo uuid; v_pend uuid;
  u0 text; u1 text; u_solo text; n int; v_ok boolean; r record;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  v_event   := (select id from public.events where is_active limit 1);
  if v_admin is null or v_harness is null or v_event is null then raise exception 'ABORT: admin, RLS harness user or active event missing'; end if;
  perform set_config('request.jwt.claims', '', true);

  -- B1. insert as the owner: every artist gets a distinct uid; a forged one is replaced
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_double_qty, artist_count, total_amount, status, artists)
  values (v_event, v_harness, 'artist', 'ZZ VERIFY 098 SHOP (DELETE ME)', 'ZZ', 'zz-098@example.com', 1, 2,
          public.application_list_price('artist', 0, 1, 0, 0, 0, 2, '[]'::jsonb, false), 'pending',
          jsonb_build_array(
            jsonb_build_object('name', 'ZZ One', 'nickname', 'Zed', 'instagram', '@zz098', 'tv_featured', true, 'tv_credit', 'ZZ Show S1', 'bio', 'ZZ bio',
                               'portfolio_urls', jsonb_build_array('https://example.com/p0.jpg'), 'id_url', 'zz/private-id.jpg', 'uid', 'forged'),
            jsonb_build_object('name', 'ZZ Two', 'tv_featured', false, 'tv_credit', 'ignored')))
  returning id into v_app;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select artists->0->>'uid', artists->1->>'uid' into u0, u1 from public.applications where id = v_app;
  if u0 is null or u1 is null or u0 = u1 then raise exception 'FAIL B1: uids missing or equal (%, %)', u0, u1; end if;
  if u0 = 'forged' then raise exception 'FAIL B1: an applicant chose their own uid'; end if;
  raise notice 'PASS B1: each artist gets a distinct uid; an applicant cannot pick one';

  -- B2. the owner edits the roster: uids are kept; a duplicated uid is replaced
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  update public.applications
     set artists = jsonb_set(jsonb_set(artists, '{0,instagram}', '"zz098b"'), '{1,uid}', to_jsonb(u0))
   where id = v_app;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select artists->0->>'instagram' from public.applications where id = v_app) is distinct from 'zz098b' then raise exception 'FAIL B2: the owner edit did not land'; end if;
  if (select artists->0->>'uid' from public.applications where id = v_app) is distinct from u0 then raise exception 'FAIL B2: an edit changed artist 1''s uid'; end if;
  select artists->1->>'uid' into u1 from public.applications where id = v_app;
  if u1 = u0 or u1 is null then raise exception 'FAIL B2: a duplicated uid survived'; end if;
  raise notice 'PASS B2: edits keep uids; a duplicate is replaced';

  -- B3. the owner cannot feature themselves
  v_ok := false;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  begin
    insert into public.vip_featured_artists (application_id, artist_uid) values (v_app, u0);
  exception when insufficient_privilege then v_ok := true;
  end;
  n := (select count(*) from public.vip_featured_artists);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if not v_ok then raise exception 'FAIL B3: an owner inserted a vip_featured_artists row'; end if;
  if n <> 0 then raise exception 'FAIL B3: an owner can read vip_featured_artists (% rows)', n; end if;
  raise notice 'PASS B3: owners can neither write nor read vip_featured_artists';

  -- B4. admin features both artists; pending: not public
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.vip_featured_artists (application_id, artist_uid, display_order) values (v_app, u0, 1), (v_app, u1, 2);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.vip_featured_public where shop = 'ZZ VERIFY 098 SHOP (DELETE ME)') then raise exception 'FAIL B4: a pending application is public'; end if;
  raise notice 'PASS B4: the admin features artists; pending stays private';

  -- B5. approved: public fields only, TV per artist, photo falls back to the portfolio
  update public.applications set status = 'approved' where id = v_app;
  set local role anon;
  select * into r from public.vip_featured_public where shop = 'ZZ VERIFY 098 SHOP (DELETE ME)' and display_order = 1;
  reset role;
  if r is null then raise exception 'FAIL B5: an approved featured artist is not public'; end if;
  if r.artist_name is distinct from 'Zed' or r.instagram is distinct from 'zz098b' or r.tv_credit is distinct from 'ZZ Show S1'
     or r.photo_url is distinct from 'https://example.com/p0.jpg' or r.bio is distinct from 'ZZ bio' then
    raise exception 'FAIL B5: unexpected public row %', row_to_json(r);
  end if;
  if row_to_json(r)::text like '%private-id%' or row_to_json(r)::text like '%zz-098@example.com%' then raise exception 'FAIL B5: ID or contact data is public'; end if;
  if (select tv_credit from public.vip_featured_public where shop = 'ZZ VERIFY 098 SHOP (DELETE ME)' and display_order = 2) is not null then
    raise exception 'FAIL B5: an artist who answered No shows a TV credit';
  end if;
  raise notice 'PASS B5: anon sees name, shop, Instagram, TV, photo fallback, bio; nothing private';

  -- B6. one-artist roster: the application's TV show is used
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_single_qty, artist_count, total_amount, status, tv_show_featured, tv_show, artists)
  values (v_event, null, 'artist', 'ZZ VERIFY 098 SOLO (DELETE ME)', 'ZZ', 'zz-098-solo@example.com', 1, 1,
          public.application_list_price('artist', 1, 0, 0, 0, 0, 1, '[]'::jsonb, false), 'approved', true, 'ZZ Legacy Show',
          jsonb_build_array(jsonb_build_object('name', 'ZZ Solo', 'photo_url', 'https://example.com/solo.jpg')))
  returning id into v_solo;
  select artists->0->>'uid' into u_solo from public.applications where id = v_solo;
  insert into public.vip_featured_artists (application_id, artist_uid, display_order) values (v_solo, u_solo, 3);
  if (select tv_credit from public.vip_featured_public where shop = 'ZZ VERIFY 098 SOLO (DELETE ME)') is distinct from 'ZZ Legacy Show' then
    raise exception 'FAIL B6: a one-artist roster did not fall back to the application TV show';
  end if;
  if (select photo_url from public.vip_featured_public where shop = 'ZZ VERIFY 098 SOLO (DELETE ME)') is distinct from 'https://example.com/solo.jpg' then
    raise exception 'FAIL B6: photo_url not used';
  end if;
  raise notice 'PASS B6: one-artist roster falls back to the application TV show; photo_url wins';

  -- B7. send back, remove an artist: they drop out by themselves
  update public.applications set status = 'pending' where id = v_solo;
  if exists (select 1 from public.vip_featured_public where shop = 'ZZ VERIFY 098 SOLO (DELETE ME)') then raise exception 'FAIL B7: sent back but still public'; end if;
  update public.applications set artists = jsonb_build_array(artists->0), artist_count = 2 where id = v_app;
  if exists (select 1 from public.vip_featured_public where shop = 'ZZ VERIFY 098 SHOP (DELETE ME)' and display_order = 2) then raise exception 'FAIL B7: a removed artist is still public'; end if;
  if not exists (select 1 from public.vip_featured_public where shop = 'ZZ VERIFY 098 SHOP (DELETE ME)' and display_order = 1) then raise exception 'FAIL B7: the remaining artist vanished'; end if;
  raise notice 'PASS B7: send back and roster removal drop artists from the view';

  -- teardown (vip rows cascade)
  delete from public.applications where id in (v_app, v_solo);
  if exists (select 1 from public.applications where business_name like 'ZZ VERIFY 098%')
     or exists (select 1 from public.vip_featured_artists where application_id in (v_app, v_solo)) then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;
