-- ============================================================
-- HOW TO RUN: after 086 is applied, paste the whole file. Read the MESSAGES
-- pane. A failure RAISES and aborts (the failing block rolls back).
--
-- Block B never touches a real booth. It creates its own INACTIVE event
-- "ZZ VERIFY 086 (DELETE ME)" with five booths and two approved
-- applications, runs assign_booths() against them, and deletes all of it in
-- the same block. It also asserts that the active event's booths are
-- byte-for-byte unchanged, so live assigning can carry on while this runs.
-- (If someone saves a real assignment in the same instant, B11 can report a
-- false FAIL; re-run it.)
-- Needs: at least one admin profile, and the RLS harness user
-- (rls-harness@allamericantattooconvention.com) for the non-admin check.
-- ============================================================

-- ── A. shape, grants, policies  (NOTICE pane)
do $$
declare v_pols text;
begin
  if to_regprocedure('public.assign_booths(uuid,text[])') is null then
    raise exception 'FAIL A: assign_booths(uuid, text[]) missing';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.assign_booths(uuid,text[])'::regprocedure) then
    raise exception 'FAIL A: assign_booths is not security definer';
  end if;
  if position('for update' in lower(pg_get_functiondef('public.assign_booths(uuid,text[])'::regprocedure))) = 0 then
    raise exception 'FAIL A: assign_booths does not lock rows';
  end if;
  if has_function_privilege('anon', 'public.assign_booths(uuid,text[])', 'execute') then
    raise exception 'FAIL A: anon can execute assign_booths';
  end if;
  if not has_function_privilege('authenticated', 'public.assign_booths(uuid,text[])', 'execute') then
    raise exception 'FAIL A: authenticated cannot execute assign_booths (the admin page would break)';
  end if;
  -- 086 changes no policy; the live set must still be exactly these three.
  v_pols := (select string_agg(policyname || ':' || cmd, ' | ' order by policyname)
               from pg_policies where schemaname = 'public' and tablename = 'booths');
  if v_pols is distinct from 'booths: admin write:ALL | booths: own read:SELECT | booths: public read deposit-paid:SELECT' then
    raise exception 'FAIL A: booths policies are not the expected three: %', v_pols;
  end if;
  raise notice 'PASS A: function, security definer, row lock, grants; booths policies unchanged (%)', v_pols;
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures in an inactive ZZ event)
do $$
declare
  v_admin uuid; v_harness uuid; v_event uuid; v_active uuid;
  v_app uuid; v_other uuid; v_pending uuid;
  v_before text; v_after text; r text[]; ok boolean;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  v_active  := (select id from public.events where is_active);
  if v_admin is null then raise exception 'ABORT: no admin profile'; end if;
  if v_harness is null then raise exception 'ABORT: RLS harness user missing'; end if;

  -- Snapshot of the live event's booths, compared at the end.
  v_before := (select md5(string_agg(booth_number || ':' || coalesce(application_id::text, '-') || ':' || status::text, ',' order by booth_number))
                 from public.booths where event_id = v_active);

  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 086 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false)
  returning id into v_event;
  -- Numbers 1-5 exist in the live event too: event scoping is what keeps them apart.
  insert into public.booths (event_id, booth_number, size, is_corner, is_sellable, house_use) values
    (v_event, '1', 'single', false, true,  null),
    (v_event, '2', 'single', true,  true,  null),
    (v_event, '3', 'single', false, true,  null),
    (v_event, '4', 'single', false, false, 'ZZ house booth'),
    (v_event, '5', 'single', false, true,  null);
  -- A vendor double = 2 slots.
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_double_qty, artist_count)
  values (v_event, null, 'vendor', 'ZZ VERIFY 086 A (DELETE ME)', 'ZZ', 'zz-verify-086-a@example.com', 100000, 'approved', 1, 0)
  returning id into v_app;
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (v_event, null, 'vendor', 'ZZ VERIFY 086 B (DELETE ME)', 'ZZ', 'zz-verify-086-b@example.com', 50000, 'approved', 1, 0)
  returning id into v_other;
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (v_event, null, 'vendor', 'ZZ VERIFY 086 P (DELETE ME)', 'ZZ', 'zz-verify-086-p@example.com', 50000, 'pending', 1, 0)
  returning id into v_pending;
  update public.booths set application_id = v_other, status = 'reserved' where event_id = v_event and booth_number = '3';

  -- B1. a signed-in non-admin is refused
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  begin
    perform public.assign_booths(v_app, array['1']);
    raise exception 'FAIL B1: a non-admin assigned a booth';
  exception when insufficient_privilege then
    raise notice 'PASS B1: non-admin refused (42501)';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- B2. full assignment (2 of 2), blanks and spaces ignored
  r := public.assign_booths(v_app, array[' 1 ', '', '2']);
  if r is distinct from array['1', '2'] then raise exception 'FAIL B2: returned %', r; end if;
  if (select count(*) from public.booths where event_id = v_event and application_id = v_app and status = 'reserved') <> 2 then
    raise exception 'FAIL B2: booths 1 and 2 are not reserved for the application';
  end if;
  raise notice 'PASS B2: 2 of 2 assigned, returned {1,2}';

  -- B3. partial (1 of 2) is allowed; the dropped booth is released
  r := public.assign_booths(v_app, array['2']);
  if r is distinct from array['2'] then raise exception 'FAIL B3: returned %', r; end if;
  if (select application_id is not null or status <> 'available' from public.booths where event_id = v_event and booth_number = '1') then
    raise exception 'FAIL B3: booth 1 was not released';
  end if;
  raise notice 'PASS B3: partial assignment saved, booth 1 released';

  -- B4 to B8: each refusal must leave the application exactly as it was ({2}).
  begin perform public.assign_booths(v_app, array['1', '2', '5']); raise exception 'FAIL B4: 3 booths accepted for 2 slots';
  exception when check_violation then raise notice 'PASS B4: more booths than slots refused (%)', sqlerrm; end;

  begin perform public.assign_booths(v_app, array['2', '4']); raise exception 'FAIL B5: a not-sellable booth was assigned';
  exception when check_violation then
    if position('ZZ house booth' in sqlerrm) = 0 then raise exception 'FAIL B5: message does not name the house use: %', sqlerrm; end if;
    raise notice 'PASS B5: not-sellable refused (%)', sqlerrm;
  end;

  begin perform public.assign_booths(v_app, array['3']); raise exception 'FAIL B6: a booth held by another application was taken';
  exception when check_violation then raise notice 'PASS B6: booth held by another application refused (%)', sqlerrm; end;

  begin perform public.assign_booths(v_app, array['999']); raise exception 'FAIL B7: an unknown booth number was accepted';
  exception when no_data_found then raise notice 'PASS B7: unknown number refused (%)', sqlerrm; end;

  begin perform public.assign_booths(v_app, array['5', ' 5']); raise exception 'FAIL B8: a duplicate number was accepted';
  exception when check_violation then raise notice 'PASS B8: duplicate refused'; end;

  ok := (select array_agg(booth_number order by booth_number) = array['2'] from public.booths where application_id = v_app)
        and (select application_id = v_other from public.booths where event_id = v_event and booth_number = '3');
  if not ok then raise exception 'FAIL B4-B8: a refused call changed the assignment'; end if;
  raise notice 'PASS B4-B8: refusals changed nothing (application still has {2}; booth 3 still with B)';

  -- B9. a pending application is refused
  begin perform public.assign_booths(v_pending, array['5']); raise exception 'FAIL B9: a pending application was assigned';
  exception when check_violation then raise notice 'PASS B9: non-approved application refused'; end;

  -- B10. an empty list releases everything
  r := public.assign_booths(v_app, array[]::text[]);
  if cardinality(r) <> 0 or exists (select 1 from public.booths where application_id = v_app) then
    raise exception 'FAIL B10: empty list did not release the booths';
  end if;
  raise notice 'PASS B10: empty list releases every booth';

  -- B11. the live event was never touched
  v_after := (select md5(string_agg(booth_number || ':' || coalesce(application_id::text, '-') || ':' || status::text, ',' order by booth_number))
                from public.booths where event_id = v_active);
  if v_after is distinct from v_before then raise exception 'FAIL B11: the active event''s booths changed'; end if;
  raise notice 'PASS B11: active event booths unchanged';

  perform set_config('request.jwt.claims', '', true);
  delete from public.booths where event_id = v_event;
  delete from public.applications where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 086 (DELETE ME)')
     or exists (select 1 from public.applications where business_name like 'ZZ VERIFY 086%') then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;
