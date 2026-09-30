-- ============================================================
-- HOW TO RUN: after 087 is applied, paste the whole file. Read the MESSAGES
-- pane. A failure RAISES and aborts (the failing block rolls back).
--
-- Block B never touches a real booth: it creates its own INACTIVE event
-- "ZZ VERIFY 087 (DELETE ME)" with four booths, two approved applications and
-- a sponsorship, exercises holds and assign_booths(), deletes it all, and
-- asserts the active event's booths are unchanged (safe while assigning; if
-- a real save lands in the same instant B12 can false-FAIL - re-run).
-- Needs: an admin profile and the RLS harness user.
-- ============================================================

-- ── A. shape, constraints, grants, policies  (NOTICE pane)
do $$
declare v_pols text;
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'booths'
       and column_name in ('held_for', 'held_for_application_id', 'held_for_sponsorship_id', 'held_until', 'held_by', 'held_at')) <> 6 then
    raise exception 'FAIL A: booths hold columns missing';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.booths'::regclass
       and conname in ('booths_hold_complete', 'booths_hold_one_link', 'booths_hold_not_assigned')) <> 3 then
    raise exception 'FAIL A: hold constraints missing';
  end if;
  if position('held_until > now()' in pg_get_functiondef('public.assign_booths(uuid,text[])'::regprocedure)) = 0 then
    raise exception 'FAIL A: assign_booths does not check active holds (087 body not applied)';
  end if;
  if has_function_privilege('anon', 'public.hold_booth(uuid,text,timestamptz,uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.release_booth_hold(uuid)', 'execute')
     or has_function_privilege('anon', 'public.assign_booths(uuid,text[])', 'execute') then
    raise exception 'FAIL A: anon can execute a booth function';
  end if;
  if not has_function_privilege('authenticated', 'public.hold_booth(uuid,text,timestamptz,uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.release_booth_hold(uuid)', 'execute') then
    raise exception 'FAIL A: authenticated cannot execute hold_booth / release_booth_hold (the admin page would break)';
  end if;
  if has_function_privilege('authenticated', 'public.release_expired_booth_holds()', 'execute')
     or has_function_privilege('anon', 'public.release_expired_booth_holds()', 'execute') then
    raise exception 'FAIL A: release_expired_booth_holds is callable outside service_role';
  end if;
  v_pols := (select string_agg(policyname || ':' || cmd, ' | ' order by policyname)
               from pg_policies where schemaname = 'public' and tablename = 'booths');
  if v_pols is distinct from 'booths: admin write:ALL | booths: own read:SELECT | booths: public read deposit-paid:SELECT' then
    raise exception 'FAIL A: booths policies are not the expected three: %', v_pols;
  end if;
  raise notice 'PASS A: columns, constraints, assign_booths checks holds, grants; booths policies unchanged';
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures in an inactive ZZ event)
do $$
declare
  v_admin uuid; v_harness uuid; v_event uuid; v_active uuid;
  v_a uuid; v_b uuid; v_sp uuid; b1 uuid; b2 uuid; b3 uuid; b4 uuid;
  v_before text; v_after text; r text[]; n int;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  v_active  := (select id from public.events where is_active);
  if v_admin is null then raise exception 'ABORT: no admin profile'; end if;
  if v_harness is null then raise exception 'ABORT: RLS harness user missing'; end if;
  -- Assignment columns only: B10's release_expired_booth_holds() may clear a
  -- real EXPIRED hold, which is its job.
  v_before := (select md5(string_agg(booth_number || ':' || coalesce(application_id::text, '-') || ':' || status::text, ',' order by booth_number))
                 from public.booths where event_id = v_active);

  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 087 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false)
  returning id into v_event;
  insert into public.booths (event_id, booth_number, size, is_sellable, house_use) values (v_event, '1', 'single', true, null) returning id into b1;
  insert into public.booths (event_id, booth_number, size, is_sellable, house_use) values (v_event, '2', 'single', true, null) returning id into b2;
  insert into public.booths (event_id, booth_number, size, is_sellable, house_use) values (v_event, '3', 'single', true, null) returning id into b3;
  insert into public.booths (event_id, booth_number, size, is_sellable, house_use) values (v_event, '4', 'single', false, 'ZZ house') returning id into b4;
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_double_qty, artist_count)
  values (v_event, null, 'vendor', 'ZZ VERIFY 087 A (DELETE ME)', 'ZZ', 'zz-verify-087-a@example.com', 100000, 'approved', 1, 0) returning id into v_a;
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_double_qty, artist_count)
  values (v_event, null, 'vendor', 'ZZ VERIFY 087 B (DELETE ME)', 'ZZ', 'zz-verify-087-b@example.com', 100000, 'approved', 1, 0) returning id into v_b;
  insert into public.sponsorships (event_id, sponsor_name) values (v_event, 'ZZ VERIFY 087 SPONSOR (DELETE ME)') returning id into v_sp;

  -- B1. non-admin refused
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  begin perform public.hold_booth(b1, 'ZZ', now() + interval '7 days'); raise exception 'FAIL B1: a non-admin set a hold';
  exception when insufficient_privilege then raise notice 'PASS B1: non-admin refused'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- B2. input checks: no name, past end, both links, not sellable
  begin perform public.hold_booth(b1, '  ', now() + interval '7 days'); raise exception 'FAIL B2: blank name accepted';
  exception when check_violation then null; end;
  begin perform public.hold_booth(b1, 'ZZ', now() - interval '1 minute'); raise exception 'FAIL B2: past end accepted';
  exception when check_violation then null; end;
  begin perform public.hold_booth(b1, 'ZZ', now() + interval '7 days', v_a, v_sp); raise exception 'FAIL B2: two links accepted';
  exception when check_violation then null; end;
  begin perform public.hold_booth(b4, 'ZZ', now() + interval '7 days'); raise exception 'FAIL B2: not-sellable booth held';
  exception when check_violation then null; end;
  raise notice 'PASS B2: blank name, past end, two links and not-sellable are refused';

  -- B3. hold booth 1 for application A, booth 2 for the sponsor
  perform public.hold_booth(b1, 'ZZ Exhibitor A', now() + interval '7 days', v_a, null);
  perform public.hold_booth(b2, 'ZZ Sponsor', now() + interval '7 days', null, v_sp);
  if (select held_by from public.booths where id = b1) is distinct from v_admin then raise exception 'FAIL B3: held_by not recorded'; end if;
  raise notice 'PASS B3: holds set, held_by recorded';

  -- B4. B cannot take A's held booth; the message names the hold
  begin perform public.assign_booths(v_b, array['1']); raise exception 'FAIL B4: another application took a held booth';
  exception when check_violation then
    if position('held for ZZ Exhibitor A' in sqlerrm) = 0 then raise exception 'FAIL B4: message does not name the hold: %', sqlerrm; end if;
    raise notice 'PASS B4: held booth refused for another application (%)', sqlerrm;
  end;

  -- B5. a sponsorship hold blocks every application, A included
  begin perform public.assign_booths(v_a, array['2']); raise exception 'FAIL B5: a sponsorship-held booth was assigned';
  exception when check_violation then raise notice 'PASS B5: sponsorship hold blocks applications'; end;

  -- B6. A takes its own held booth; the hold is consumed
  r := public.assign_booths(v_a, array['1']);
  if r is distinct from array['1'] then raise exception 'FAIL B6: returned %', r; end if;
  if (select held_for from public.booths where id = b1) is not null then raise exception 'FAIL B6: hold not cleared on assignment'; end if;
  raise notice 'PASS B6: the linked application takes its held booth, hold cleared';

  -- B7. an assigned booth cannot be held
  begin perform public.hold_booth(b1, 'ZZ', now() + interval '7 days'); raise exception 'FAIL B7: an assigned booth was held';
  exception when check_violation then raise notice 'PASS B7: assigned booth cannot be held'; end;

  -- B8. an EXPIRED hold does not block (set directly: hold_booth refuses past dates)
  perform set_config('request.jwt.claims', '', true);
  update public.booths set held_for = 'ZZ Expired', held_until = now() - interval '1 hour', held_by = v_admin, held_at = now() - interval '8 days' where id = b3;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  r := public.assign_booths(v_b, array['3']);
  if r is distinct from array['3'] or (select held_for from public.booths where id = b3) is not null then
    raise exception 'FAIL B8: an expired hold blocked or survived assignment';
  end if;
  raise notice 'PASS B8: an expired hold does not block, and is cleared on assignment';

  -- B9. release
  perform public.release_booth_hold(b2);
  if (select held_for from public.booths where id = b2) is not null then raise exception 'FAIL B9: release did not clear'; end if;
  raise notice 'PASS B9: release clears the hold';

  -- B10. release_expired_booth_holds clears only expired holds
  perform set_config('request.jwt.claims', '', true);
  update public.booths set held_for = 'ZZ Old', held_until = now() - interval '1 day', held_by = v_admin, held_at = now() - interval '9 days' where id = b2;
  n := public.release_expired_booth_holds();
  if n < 1 or (select held_for from public.booths where id = b2) is not null then raise exception 'FAIL B10: expired hold not released (n=%)', n; end if;
  raise notice 'PASS B10: release_expired_booth_holds released % expired hold(s)', n;

  -- B11. the constraint refuses a half-filled hold
  begin update public.booths set held_for = 'ZZ', held_until = null where id = b2; raise exception 'FAIL B11: a hold without an end was stored';
  exception when check_violation then raise notice 'PASS B11: a hold without held_until is refused by the table'; end;

  -- B12. live event assignments untouched
  v_after := (select md5(string_agg(booth_number || ':' || coalesce(application_id::text, '-') || ':' || status::text, ',' order by booth_number))
                from public.booths where event_id = v_active);
  if v_after is distinct from v_before then raise exception 'FAIL B12: the active event''s assignments changed'; end if;
  raise notice 'PASS B12: active event assignments unchanged';

  delete from public.booths where event_id = v_event;
  delete from public.applications where event_id = v_event;
  delete from public.sponsorships where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 087 (DELETE ME)') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS B: fixtures removed';
end $$;
