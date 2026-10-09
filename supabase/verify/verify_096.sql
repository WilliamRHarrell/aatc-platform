-- ============================================================
-- HOW TO RUN: after 096 is applied, paste the whole file. Read the MESSAGES
-- pane; a failure RAISES. Block B uses its own INACTIVE event
-- "ZZ VERIFY 096 (DELETE ME)" and deletes it.
-- ============================================================

-- ── A. column, check, trigger, not public  (NOTICE pane)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applications'
                  and column_name = 'agreed_total' and data_type = 'integer' and is_nullable = 'YES') then
    raise exception 'FAIL A: applications.agreed_total (nullable integer) missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.applications'::regclass and conname = 'applications_agreed_total_check') then
    raise exception 'FAIL A: applications_agreed_total_check missing';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.applications'::regclass and tgname = 'applications_protect_agreed_total_trg') then
    raise exception 'FAIL A: applications_protect_agreed_total_trg missing';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applications_public' and column_name = 'agreed_total') then
    raise exception 'FAIL A: agreed_total leaked into applications_public';
  end if;
  if has_column_privilege('anon', 'public.applications', 'agreed_total', 'select') then
    raise exception 'FAIL A: anon can read agreed_total';
  end if;
  raise notice 'PASS A: nullable integer >= 0, guard trigger, not public';
end $$;

-- ── B. admin sets it; the applicant can neither set nor change it  (NOTICE pane)
do $$
declare v_admin uuid; v_harness uuid; v_event uuid; v_app uuid; v_ok boolean; v_val int;
begin
  v_admin   := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_admin is null or v_harness is null then raise exception 'ABORT: admin profile or RLS harness user missing'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 096 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false) returning id into v_event;

  -- B1. a negative total is refused
  v_ok := false;
  begin
    insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_single_qty, artist_count, total_amount, status, agreed_total)
    values (v_event, null, 'artist', 'ZZ VERIFY 096 NEG (DELETE ME)', 'ZZ', 'zz-096-neg@example.com', 1, 1, 85000, 'pending', -1);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B1: a negative agreed_total was accepted'; end if;
  raise notice 'PASS B1: agreed_total cannot be negative';

  -- B2. the admin sets it on insert
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_single_qty, artist_count, total_amount, status, agreed_total)
  values (v_event, v_harness, 'artist', 'ZZ VERIFY 096 (DELETE ME)', 'ZZ', 'zz-096@example.com', 1, 1, 85000, 'pending', 50000) returning id into v_app;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select agreed_total from public.applications where id = v_app) is distinct from 50000 then raise exception 'FAIL B2: the admin could not set agreed_total'; end if;
  raise notice 'PASS B2: the admin sets agreed_total';

  -- B3. the owner cannot change it (their other edit still lands)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  update public.applications set agreed_total = 1, instagram = 'zz096' where id = v_app;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select agreed_total into v_val from public.applications where id = v_app;
  if (select instagram from public.applications where id = v_app) is distinct from 'zz096' then raise exception 'FAIL B3: the owner update did not run, so this proves nothing'; end if;
  if v_val is distinct from 50000 then raise exception 'FAIL B3: the owner changed agreed_total to %', v_val; end if;
  raise notice 'PASS B3: the owner cannot change agreed_total';

  -- B4. a non-admin insert cannot set it
  delete from public.applications where id = v_app;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  insert into public.applications (event_id, user_id, exhibitor_type, business_name, contact_name, email, artist_single_qty, artist_count, total_amount, status, agreed_total)
  values (v_event, v_harness, 'artist', 'ZZ VERIFY 096 OWN (DELETE ME)', 'ZZ', 'zz-096-own@example.com', 1, 1, public.application_list_price('artist', 1, 0, 0, 0, 0, 1, '[]'::jsonb, false), 'pending', 1)
  returning id into v_app;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select agreed_total from public.applications where id = v_app) is not null then raise exception 'FAIL B4: an applicant set agreed_total on insert'; end if;
  raise notice 'PASS B4: an applicant insert cannot set agreed_total';

  delete from public.applications where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 096 (DELETE ME)') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS B: fixtures removed';
end $$;
