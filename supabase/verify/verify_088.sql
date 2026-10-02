-- ============================================================
-- HOW TO RUN: after 088 is applied, paste the whole file, then paste
-- verify_079_matrix.sql (regenerated for 088). Read the MESSAGES pane. A
-- failure RAISES and aborts (the failing block rolls back).
--
-- Block B uses its own INACTIVE event "ZZ VERIFY 088 (DELETE ME)" with two
-- applications, one owned by the RLS harness user, and deletes it all. It
-- never touches a real application.
-- Needs: an admin profile and the RLS harness user, with no application of
-- its own in that ZZ event (it is created here, so none).
-- ============================================================

-- ── A. shape, price cap, grants  (NOTICE pane)
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.applications'::regclass and conname = 'applications_artist_capacity') then
    raise exception 'FAIL A: applications_artist_capacity missing';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.applications'::regclass and tgname = 'applications_roster_guard_trg') then
    raise exception 'FAIL A: applications_roster_guard_trg missing';
  end if;
  -- 1 artist single, 3 artists: permits capped at 2 -> 80000 + 2 x 5000.
  if public.application_list_price('artist', 1, 0, 0, 0, 0, 3, '[]'::jsonb, false) <> 90000 then
    raise exception 'FAIL A: application_list_price does not cap permits at 2 per single';
  end if;
  -- 1 artist double, 5 artists: capped at 4 -> 120000 + 4 x 5000.
  if public.application_list_price('artist', 0, 1, 0, 0, 0, 5, '[]'::jsonb, false) <> 140000 then
    raise exception 'FAIL A: application_list_price does not cap permits at 4 per double';
  end if;
  if has_function_privilege('anon', 'public.set_artist_id_verified(uuid,int,boolean)', 'execute') then
    raise exception 'FAIL A: anon can execute set_artist_id_verified';
  end if;
  if not has_function_privilege('authenticated', 'public.set_artist_id_verified(uuid,int,boolean)', 'execute') then
    raise exception 'FAIL A: authenticated cannot execute set_artist_id_verified (the admin page would break)';
  end if;
  if has_function_privilege('authenticated', 'public.applications_roster_guard()', 'execute') then
    raise exception 'FAIL A: the roster guard trigger function is directly executable';
  end if;
  raise notice 'PASS A: capacity constraint, roster trigger, permit cap 2/4 in the list price, grants';
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures in an inactive ZZ event)
do $$
declare
  v_admin uuid; v_harness uuid; v_event uuid; v_owned uuid; v_other uuid;
  v_el jsonb; v_arts jsonb;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_admin is null then raise exception 'ABORT: no admin profile'; end if;
  if v_harness is null then raise exception 'ABORT: RLS harness user missing'; end if;

  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 088 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false)
  returning id into v_event;

  -- B1. capacity: a single booth cannot carry 3 artists, for anyone
  begin
    insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, artist_single_qty, artist_count)
    values (v_event, null, 'artist', 'ZZ VERIFY 088 OVER (DELETE ME)', 'ZZ', 'zz-088-over@example.com', 90000, 'approved', 1, 3);
    raise exception 'FAIL B1: 3 artists on one single booth were stored';
  exception when check_violation then raise notice 'PASS B1: 3 artists on a single booth refused (%)', sqlerrm; end;

  -- Owned by the harness user: 1 double, 2 permits, 2 artists.
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, artist_double_qty, artist_count, artists)
  values (v_event, v_harness, 'artist', 'ZZ VERIFY 088 OWNED (DELETE ME)', 'ZZ', 'zz-088-owned@example.com', 130000, 'approved', 1, 2,
          '[{"name":"ZZ Ann","id_url":"zz/ann.jpg"},{"name":"ZZ Bob","id_url":"zz/bob.jpg"}]'::jsonb)
  returning id into v_owned;
  -- B10. a verification forged at insert is stripped
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, artist_single_qty, artist_count, artists)
  values (v_event, null, 'artist', 'ZZ VERIFY 088 OTHER (DELETE ME)', 'ZZ', 'zz-088-other@example.com', 85000, 'approved', 1, 1,
          '[{"name":"ZZ Cy","id_url":"zz/cy.jpg","id_verified_at":"2026-01-01T00:00:00Z","id_verified_by":"00000000-0000-0000-0000-000000000000"}]'::jsonb)
  returning id into v_other;
  if (select artists->0 ? 'id_verified_at' from public.applications where id = v_other) then
    raise exception 'FAIL B10: a verification forged at insert was kept';
  end if;
  raise notice 'PASS B10: verification keys supplied at insert are stripped';

  -- B2. the roster cannot exceed artist_count (admin included)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    update public.applications set artists = artists || '[{"name":"ZZ Extra","id_url":"zz/x.jpg"}]'::jsonb where id = v_owned;
    raise exception 'FAIL B2: a third artist was stored on 2 permits';
  exception when check_violation then raise notice 'PASS B2: roster longer than artist_count refused'; end;

  -- B3. the owner cannot append an artist either (the 079 hole)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  begin
    update public.applications set artists = artists || '[{"name":"ZZ Sneak","id_url":"zz/s.jpg"}]'::jsonb where id = v_owned;
    raise exception 'FAIL B3: the owner appended an artist past the permits';
  exception when check_violation then raise notice 'PASS B3: owner cannot append past the permits'; end;

  -- B4. the owner cannot forge a verification by update
  update public.applications
     set artists = jsonb_set(artists, '{0}', (artists->0) || '{"id_verified_at":"2026-01-01T00:00:00Z"}'::jsonb)
   where id = v_owned;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select artists->0 ? 'id_verified_at' from public.applications where id = v_owned) then
    raise exception 'FAIL B4: the owner set a verification';
  end if;
  raise notice 'PASS B4: owner-supplied verification is stripped';

  -- B5. set_artist_id_verified: non-admin refused; admin verifies artist 1
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  begin
    perform public.set_artist_id_verified(v_owned, 0, true);
    raise exception 'FAIL B5: a non-admin verified an ID';
  exception when insufficient_privilege then raise notice 'PASS B5a: non-admin cannot verify'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_el := public.set_artist_id_verified(v_owned, 0, true);
  if not (v_el ? 'id_verified_at') or (v_el->>'id_verified_by')::uuid is distinct from v_admin then
    raise exception 'FAIL B5: verification not recorded with the admin id: %', v_el;
  end if;
  raise notice 'PASS B5: admin verified artist 1 (by %)', v_el->>'id_verified_by';

  -- B6. a stale admin write (no verification keys) keeps the verification
  update public.applications set artists = '[{"name":"ZZ Ann","id_url":"zz/ann.jpg","styles":["Traditional"]},{"name":"ZZ Bob","id_url":"zz/bob.jpg"}]'::jsonb
   where id = v_owned;
  if not (select artists->0 ? 'id_verified_at' from public.applications where id = v_owned) then
    raise exception 'FAIL B6: a write without the verification keys dropped the verification';
  end if;
  raise notice 'PASS B6: verification survives a write that omits it (matched by id_url)';

  -- B7. owner may edit styles of a verified artist; may not rename, re-ID or remove them
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  update public.applications set artists = jsonb_set(artists, '{0,styles}', '["Realism"]'::jsonb) where id = v_owned;
  begin
    update public.applications set artists = jsonb_set(artists, '{0,name}', '"ZZ Someone Else"'::jsonb) where id = v_owned;
    raise exception 'FAIL B7: the owner renamed a verified artist';
  exception when check_violation then null; end;
  begin
    update public.applications set artists = jsonb_set(artists, '{0,id_url}', '"zz/other.jpg"'::jsonb) where id = v_owned;
    raise exception 'FAIL B7: the owner replaced a verified artist''s ID';
  exception when check_violation then null; end;
  begin
    update public.applications set artists = jsonb_build_array(artists->1) where id = v_owned;
    raise exception 'FAIL B7: the owner removed a verified artist';
  exception when check_violation then null; end;
  -- the unverified artist 2 is still freely editable
  update public.applications set artists = jsonb_set(artists, '{1,name}', '"ZZ Robert"'::jsonb) where id = v_owned;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_arts := (select artists from public.applications where id = v_owned);
  if v_arts->0->'styles' <> '["Realism"]'::jsonb or not (v_arts->0 ? 'id_verified_at') or v_arts->1->>'name' <> 'ZZ Robert' then
    raise exception 'FAIL B7: unexpected roster after owner edits: %', v_arts;
  end if;
  raise notice 'PASS B7: owner edits styles of a verified artist; rename, re-ID and removal refused; unverified artist editable';

  -- B8. replacing a verified ID (admin) clears the verification
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update public.applications set artists = jsonb_set(artists, '{0,id_url}', '"zz/ann-new.jpg"'::jsonb) where id = v_owned;
  if (select artists->0 ? 'id_verified_at' from public.applications where id = v_owned) then
    raise exception 'FAIL B8: a replaced ID kept its verification';
  end if;
  raise notice 'PASS B8: replacing an ID clears its verification';

  -- B9. verify then unverify; verifying needs an ID
  perform public.set_artist_id_verified(v_owned, 0, true);
  perform public.set_artist_id_verified(v_owned, 0, false);
  if (select artists->0 ? 'id_verified_at' from public.applications where id = v_owned) then
    raise exception 'FAIL B9: unverify did not clear';
  end if;
  update public.applications set artists = jsonb_set(artists, '{1,id_url}', 'null'::jsonb) where id = v_owned;
  begin
    perform public.set_artist_id_verified(v_owned, 1, true);
    raise exception 'FAIL B9: an artist without an ID was verified';
  exception when check_violation then null; end;
  raise notice 'PASS B9: unverify clears; an artist without an ID cannot be verified';

  perform set_config('request.jwt.claims', '', true);
  delete from public.applications where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 088 (DELETE ME)') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS B: fixtures removed';
end $$;
