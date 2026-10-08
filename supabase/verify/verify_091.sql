-- ============================================================
-- HOW TO RUN: after 091 is applied, paste the whole file. Read the MESSAGES
-- pane. A failure RAISES and aborts (the failing block rolls back). The last
-- query (block C) returns one row: the live event's switch, cap and status
-- counts, for you to eyeball.
--
-- Block B uses its own INACTIVE event "ZZ VERIFY 091 (DELETE ME)" with a cap
-- of 2 and deletes it. Nothing on the live event is written.
-- ============================================================

-- ── A. columns, constraints, triggers, index, bucket  (NOTICE pane)
do $$
declare v_missing text; v_limit bigint;
begin
  select string_agg(c, ', ') into v_missing
    from unnest(array['status','photos','applied_at','acknowledged_at','decided_at','decision_email_opt_out','decision_email_sent_at']) c
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'food_trucks' and column_name = c);
  if v_missing is not null then raise exception 'FAIL A: food_trucks columns missing: %', v_missing; end if;
  select string_agg(c, ', ') into v_missing
    from unnest(array['food_truck_applications_open','food_truck_cap']) c
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'events' and column_name = c);
  if v_missing is not null then raise exception 'FAIL A: events columns missing: %', v_missing; end if;
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'food_trucks' and column_name = 'status') not like '''pending''%' then
    raise exception 'FAIL A: food_trucks.status does not default to pending';
  end if;
  if exists (select 1 from public.events where food_truck_applications_open) then
    raise exception 'FAIL A: an event has food truck applications OPEN; 091 ships them closed until PR 2';
  end if;
  select string_agg(t, ', ') into v_missing
    from unnest(array['food_trucks_aa_guard_insert_trg','food_trucks_protect_staff_columns_trg','food_trucks_zz_enforce_cap_trg']) t
   where not exists (select 1 from pg_trigger where tgrelid = 'public.food_trucks'::regclass and tgname = t);
  if v_missing is not null then raise exception 'FAIL A: triggers missing: %', v_missing; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'food_trucks_one_active_per_email_event') then
    raise exception 'FAIL A: food_trucks_one_active_per_email_event missing';
  end if;
  -- 091 changes no policy: food_trucks keeps exactly its three.
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'food_trucks') <> 3 then
    raise exception 'FAIL A: food_trucks has % policies, expected 3', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'food_trucks');
  end if;
  select file_size_limit into v_limit from storage.buckets where id = 'food-truck-logos';
  if v_limit is distinct from 10485760 then raise exception 'FAIL A: food-truck-logos limit is %, expected 10485760', v_limit; end if;
  raise notice 'PASS A: columns, status default pending, switch closed, three triggers, one-active index, 3 policies, 10 MB bucket';
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures in an inactive ZZ event, cap 2)
do $$
declare v_harness uuid; v_event uuid; v_a uuid; v_b uuid; v_c uuid; v_own uuid; r record; v_ok boolean;
begin
  v_harness := (select id from public.profiles where email = 'rls-harness@allamericantattooconvention.com');
  if v_harness is null then raise exception 'ABORT: RLS harness user missing'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active, food_truck_cap)
  values ('ZZ VERIFY 091 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2099-01-01', date '2099-01-02', false, 2) returning id into v_event;

  -- B1. a new row starts pending (the server route's insert)
  insert into public.food_trucks (event_id, business_name, contact_name, email, days)
  values (v_event, 'ZZ VERIFY 091 A (DELETE ME)', 'ZZ', 'zz-091-a@example.com', array['friday']) returning id into v_a;
  if (select status from public.food_trucks where id = v_a) <> 'pending' then raise exception 'FAIL B1: new truck is not pending'; end if;
  raise notice 'PASS B1: a new truck starts pending';

  -- B2. a pending truck cannot be published
  v_ok := false;
  begin
    update public.food_trucks set is_published = true where id = v_a;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B2: a pending truck was published'; end if;
  raise notice 'PASS B2: publishing a pending truck is refused';

  -- B3. cap 2: two approvals pass, the third is refused (insert and update)
  update public.food_trucks set status = 'approved' where id = v_a;
  insert into public.food_trucks (event_id, business_name, contact_name, email, days, status)
  values (v_event, 'ZZ VERIFY 091 B (DELETE ME)', 'ZZ', 'zz-091-b@example.com', array['friday'], 'approved') returning id into v_b;
  insert into public.food_trucks (event_id, business_name, contact_name, email, days)
  values (v_event, 'ZZ VERIFY 091 C (DELETE ME)', 'ZZ', 'zz-091-c@example.com', array['friday']) returning id into v_c;
  v_ok := false;
  begin
    update public.food_trucks set status = 'approved' where id = v_c;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B3: a third approval passed a cap of 2'; end if;
  v_ok := false;
  begin
    insert into public.food_trucks (event_id, business_name, contact_name, email, days, status)
    values (v_event, 'ZZ VERIFY 091 D (DELETE ME)', 'ZZ', 'zz-091-d@example.com', array['friday'], 'approved');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B3: an approved INSERT passed a cap of 2'; end if;
  -- re-saving an already approved truck is not a new approval
  update public.food_trucks set description = 'ZZ' where id = v_a;
  -- raising the cap lets the third through
  update public.events set food_truck_cap = 3 where id = v_event;
  update public.food_trucks set status = 'approved' where id = v_c;
  update public.food_trucks set status = 'pending' where id = v_c;
  update public.events set food_truck_cap = 2 where id = v_event;
  raise notice 'PASS B3: cap refuses the third approval (update and insert), raising it allows it';

  -- B4. one active application per email per event
  v_ok := false;
  begin
    insert into public.food_trucks (event_id, business_name, contact_name, email, days)
    values (v_event, 'ZZ VERIFY 091 C2 (DELETE ME)', 'ZZ', 'ZZ-091-C@example.com', array['friday']);
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B4: a second active application with the same email (other case) was accepted'; end if;
  update public.food_trucks set status = 'not_selected' where id = v_c;
  insert into public.food_trucks (event_id, business_name, contact_name, email, days)
  values (v_event, 'ZZ VERIFY 091 C3 (DELETE ME)', 'ZZ', 'zz-091-c@example.com', array['friday']);
  raise notice 'PASS B4: same email refused while active, accepted once the first is not selected';

  -- B5. an owner cannot change status or the decision columns
  insert into public.food_trucks (event_id, user_id, business_name, contact_name, email, days)
  values (v_event, v_harness, 'ZZ VERIFY 091 OWN (DELETE ME)', 'ZZ', 'zz-091-own@example.com', array['friday']) returning id into v_own;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_harness, 'role', 'authenticated')::text, true);
  update public.food_trucks
     set status = 'approved', decided_at = now(), decision_email_opt_out = true, applied_at = now(), description = 'ZZ own edit'
   where id = v_own;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select status, decided_at, decision_email_opt_out, applied_at, description into r from public.food_trucks where id = v_own;
  if r.description <> 'ZZ own edit' then raise exception 'FAIL B5: the owner could not edit the profile'; end if;
  if r.status <> 'pending' or r.decided_at is not null or r.decision_email_opt_out or r.applied_at is not null then
    raise exception 'FAIL B5: the owner changed a decision column: %', r;
  end if;
  raise notice 'PASS B5: owner edits the description; status and decision columns unchanged';

  delete from public.food_trucks where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 091 (DELETE ME)') then raise exception 'FAIL: fixtures not removed'; end if;
  raise notice 'PASS B: fixtures removed';
end $$;

-- ── C. the live event  (RESULTS pane, one row)
--    want: applications_open false, cap 8, every existing truck approved,
--    pending 0 until the form opens.
select e.name,
       e.food_truck_applications_open                                as applications_open,
       e.food_truck_cap                                              as cap,
       count(t.id) filter (where t.status = 'approved')              as approved,
       count(t.id) filter (where t.status = 'pending')               as pending,
       count(t.id) filter (where t.status not in ('approved','pending')) as other,
       count(t.id)                                                   as trucks
  from public.events e
  left join public.food_trucks t on t.event_id = e.id
 where e.is_active
 group by e.id, e.name, e.food_truck_applications_open, e.food_truck_cap;
