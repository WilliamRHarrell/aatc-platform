-- ============================================================
-- HOW TO RUN: paste the whole file, then paste verify_079_matrix.sql (the
-- GENERATED price matrix - src/lib/pricing-matrix.test.ts keeps it equal to
-- calculatePricing()). Read the MESSAGES pane. A failure RAISES and aborts.
-- ⚠  Block C and D write ZZ applications owned by the RLS harness user and
-- remove them in the same block.
-- ============================================================

-- ── A. function + index present, right shape  (NOTICE pane)
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'application_list_price') then
    raise exception 'FAIL A: application_list_price missing';
  end if;
  if (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'application_list_price') <> 'i' then
    raise exception 'FAIL A: application_list_price is not IMMUTABLE';
  end if;
  if has_function_privilege('anon', 'public.application_list_price(text,int,int,int,int,int,int,jsonb,boolean)', 'execute') then raise exception 'FAIL A: anon can execute application_list_price'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'applications' and indexname = 'applications_one_active_per_user_event') then
    raise exception 'FAIL A: index applications_one_active_per_user_event missing';
  end if;
  if position('total_amount is distinct from v_price' in pg_get_functiondef('public.applications_force_safe_insert'::regproc)) = 0 then
    raise exception 'FAIL A: insert clamp does not refuse a mismatched total';
  end if;
  if position('new.add_ons := old.add_ons' in pg_get_functiondef('public.applications_protect_staff_columns'::regproc)) = 0 then
    raise exception 'FAIL A: update clamp does not restore add_ons for owners';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.applications'::regclass and conname = 'applications_quantities_nonnegative') then
    raise exception 'FAIL A: applications_quantities_nonnegative missing';
  end if;
  raise notice 'PASS A: function (immutable, no anon), index, clamp refusal present';
end $$;

-- ── B. every live application matches the function  (results grid, then NOTICE)
select a.id, a.business_name, a.total_amount,
       public.application_list_price(a.exhibitor_type::text, a.artist_single_qty, a.artist_double_qty, a.vendor_single_qty, a.vendor_double_qty, a.corner_count, a.artist_count, a.add_ons, a.is_veteran) as list_price
  from public.applications a
 order by a.created_at;
do $$
declare bad text;
begin
  bad := (select string_agg(a.business_name || ' (' || a.total_amount || ' vs ' || public.application_list_price(a.exhibitor_type::text, a.artist_single_qty, a.artist_double_qty, a.vendor_single_qty, a.vendor_double_qty, a.corner_count, a.artist_count, a.add_ons, a.is_veteran) || ')', ', ')
           from public.applications a
          where a.total_amount is distinct from public.application_list_price(a.exhibitor_type::text, a.artist_single_qty, a.artist_double_qty, a.vendor_single_qty, a.vendor_double_qty, a.corner_count, a.artist_count, a.add_ons, a.is_veteran));
  if bad is not null then raise notice 'REVIEW B: totals that differ from the list price (returning-exhibitor imports at prior-year prices are expected here): %', bad;
  else raise notice 'PASS B: every live application total equals the list price'; end if;
end $$;

-- ── C. an owner cannot insert a wrong total; the right one lands  (NOTICE pane; fixture)
do $$
declare v_uid uuid; v_event uuid; v_app uuid;
begin
  v_uid := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_uid is null then raise exception 'ABORT: RLS harness user missing'; end if;
  if exists (select 1 from public.applications where user_id = v_uid and status in ('pending','approved','waitlisted')) then raise exception 'ABORT: harness user already has an active application'; end if;
  v_event := (select id from public.events where is_active order by start_date limit 1);

  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, corner_count, artist_count)
    values (v_event, v_uid, 'vendor', 'ZZ VERIFY 079 (DELETE ME)', 'ZZ', 'zz-verify-079@example.com', 1, 'pending', 1, 1, 0);
    reset role;
    raise exception 'FAIL C: an owner inserted total_amount 1 for a 60000 booth';
  exception when check_violation then
    reset role; perform set_config('request.jwt.claims', '', true);
    raise notice 'PASS C1: wrong total refused (check_violation)';
  end;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, corner_count, artist_count)
  values (v_event, v_uid, 'vendor', 'ZZ VERIFY 079 (DELETE ME)', 'ZZ', 'zz-verify-079@example.com', 60000, 'pending', 1, 1, 0);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_app := (select id from public.applications where business_name = 'ZZ VERIFY 079 (DELETE ME)');
  if v_app is null then raise exception 'FAIL C2: the correct total did not land'; end if;
  raise notice 'PASS C2: the list price (60000 = single + corner) lands';

  -- C3. negative quantities are refused (a negative cross-type quantity used to zero the permit fees at an agreed total)
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, artist_single_qty, vendor_single_qty, artist_count)
    values (v_event, v_uid, 'artist', 'ZZ VERIFY 079 NEG (DELETE ME)', 'ZZ', 'zz-verify-079n@example.com', 80000, 'pending', 1, -1, 4);
    reset role;
    raise exception 'FAIL C3: a negative quantity was accepted';
  exception when check_violation then
    reset role; perform set_config('request.jwt.claims', '', true);
    raise notice 'PASS C3: negative quantity refused';
  end;

  -- C4. an owner cannot change the priced inputs after insert (add_ons, artist_count are restored)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  update public.applications set add_ons = '[{"kind":"tattoo_bed","term":"weekend","qty":3}]'::jsonb, artist_count = 4, notes = 'ZZ owner touched' where id = v_app;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select notes from public.applications where id = v_app) is distinct from 'ZZ owner touched' then raise exception 'FAIL C4 control: the owner update did not land'; end if;
  if (select add_ons from public.applications where id = v_app) <> '[]'::jsonb or (select artist_count from public.applications where id = v_app) <> 0 then
    raise exception 'FAIL C4: owner changed add_ons or artist_count after insert';
  end if;
  raise notice 'PASS C4: add_ons and artist_count are clamped for owners';

  -- D. one ACTIVE application per user per event: a second one is refused, a rejected one is allowed
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
    values (v_event, v_uid, 'vendor', 'ZZ VERIFY 079 DUP (DELETE ME)', 'ZZ', 'zz-verify-079b@example.com', 50000, 'pending', 1, 0);
    reset role;
    raise exception 'FAIL D: a second active application for the same user + event was accepted';
  exception when unique_violation then
    reset role; perform set_config('request.jwt.claims', '', true);
    raise notice 'PASS D1: second active application refused (unique_violation)';
  end;
  update public.applications set status = 'rejected' where id = v_app;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (v_event, v_uid, 'vendor', 'ZZ VERIFY 079 DUP (DELETE ME)', 'ZZ', 'zz-verify-079b@example.com', 50000, 'pending', 1, 0);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from public.applications where business_name = 'ZZ VERIFY 079 DUP (DELETE ME)') then raise exception 'FAIL D2: re-applying after a rejection was refused'; end if;
  raise notice 'PASS D2: a rejected application does not block a new one';

  -- E. admin-added applications (user_id NULL, /admin/booths add form) are not limited to one per event
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (v_event, null, 'vendor', 'ZZ VERIFY 079 ADMIN1 (DELETE ME)', 'ZZ', 'zz-verify-079-admin1@example.com', 50000, 'approved', 1, 0),
         (v_event, null, 'vendor', 'ZZ VERIFY 079 ADMIN2 (DELETE ME)', 'ZZ', 'zz-verify-079-admin2@example.com', 50000, 'approved', 1, 0);
  raise notice 'PASS E: two approved admin-added applications (user_id null) coexist for one event';

  delete from public.applications where business_name like 'ZZ VERIFY 079%';
  if exists (select 1 from public.applications where business_name like 'ZZ VERIFY 079%') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS C/D/E: fixtures removed';
end $$;

-- ── Z. residue  (results grid; want zero rows)
select id, business_name from public.applications where business_name like 'ZZ VERIFY 079%';
