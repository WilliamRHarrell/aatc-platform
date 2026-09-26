-- ============================================================
-- HOW TO RUN: after 080 is applied, paste the whole file. Read the MESSAGES
-- pane. A failure RAISES and aborts. Then re-run verify_073.sql (its anon
-- allow-list now includes panel_seats_remaining).
-- ⚠  Block B creates ZZ panels and registrations and removes them in the same
-- block; it is one transaction, so nothing is ever visible to anyone else.
-- What SQL cannot show: two concurrent registrations. The FOR UPDATE lock is
-- asserted from the function body in block A instead.
-- ============================================================

-- ── A. shape and grants  (NOTICE pane)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'panels' and column_name = 'hard_cap' and is_nullable = 'NO') then
    raise exception 'FAIL A: panels.hard_cap missing or nullable';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'panel_registrations' and column_name = 'hold_expires_at') then
    raise exception 'FAIL A: panel_registrations.hold_expires_at missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.panels'::regclass and conname = 'panels_hard_cap_needs_capacity') then
    raise exception 'FAIL A: panels_hard_cap_needs_capacity missing';
  end if;
  if position('for update' in lower(pg_get_functiondef('public.register_panel_seat(uuid,text,text,text,text,text,int)'::regprocedure))) = 0 then
    raise exception 'FAIL A: register_panel_seat does not lock the panel row';
  end if;
  if has_function_privilege('anon', 'public.register_panel_seat(uuid,text,text,text,text,text,int)', 'execute')
     or has_function_privilege('authenticated', 'public.register_panel_seat(uuid,text,text,text,text,text,int)', 'execute') then
    raise exception 'FAIL A: register_panel_seat is callable by anon or authenticated (service_role only)';
  end if;
  if has_function_privilege('anon', 'public.panel_seats_taken(uuid)', 'execute') then raise exception 'FAIL A: anon can execute panel_seats_taken'; end if;
  if not has_function_privilege('anon', 'public.panel_seats_remaining(uuid)', 'execute') then raise exception 'FAIL A: anon cannot execute panel_seats_remaining (the public page needs it)'; end if;
  -- src/types/database.ts once described a register_for_panel() (an unapplied
  -- draft of 047). If one exists live it is a second path around the cap.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'register_for_panel') then
    raise exception 'FAIL A: a register_for_panel() function exists live - a registration path that bypasses the cap';
  end if;
  raise notice 'PASS A: columns, constraint, row lock, grants; no register_for_panel()';
end $$;

-- ── B. the cap, at its boundary  (NOTICE pane; fixtures)
do $$
declare
  v_event uuid; v_hard uuid; v_open uuid; v_paid uuid;
  r1 uuid; r2 uuid; r3 uuid;
begin
  v_event := (select id from public.events where is_active);
  if v_event is null then raise exception 'ABORT: no active event'; end if;

  insert into public.panels (event_id, title, signup_type, max_capacity, hard_cap, is_free, cost, is_published, panel_day, panel_start)
  values (v_event, 'ZZ VERIFY 080 HARD (DELETE ME)', 'free_registration', 2, true,  true, 0,     true, current_date, '10:00')
  returning id into v_hard;
  insert into public.panels (event_id, title, signup_type, max_capacity, hard_cap, is_free, cost, is_published, panel_day, panel_start)
  values (v_event, 'ZZ VERIFY 080 OPEN (DELETE ME)', 'free_registration', 1, false, true, 0,     true, current_date, '10:00')
  returning id into v_open;
  insert into public.panels (event_id, title, signup_type, max_capacity, hard_cap, is_free, cost, is_published, panel_day, panel_start)
  values (v_event, 'ZZ VERIFY 080 PAID (DELETE ME)', 'aatc_invoice',      1, false, false, 40000, true, current_date, '10:00')
  returning id into v_paid;

  -- B1. hard-capped free panel, cap 2: the 2nd (the cap itself) lands, the 3rd is refused
  r1 := public.register_panel_seat(v_hard, 'ZZ one', 'zz-080-1@example.com');
  r2 := public.register_panel_seat(v_hard, 'ZZ two', 'zz-080-2@example.com');
  if r1 is null or r2 is null then raise exception 'FAIL B1: a registration under or at the cap was refused'; end if;
  r3 := public.register_panel_seat(v_hard, 'ZZ three', 'zz-080-3@example.com');
  if r3 is not null then raise exception 'FAIL B1: a registration past the hard cap was accepted'; end if;
  if public.panel_seats_remaining(v_hard) <> 0 then raise exception 'FAIL B1: seats_remaining on a full hard-capped panel is not 0'; end if;
  raise notice 'PASS B1: hard cap 2 - second accepted, third refused, 0 remaining';

  -- B2. control: a free panel WITHOUT hard_cap is never refused, and reports no remaining count
  r1 := public.register_panel_seat(v_open, 'ZZ one', 'zz-080-4@example.com');
  r2 := public.register_panel_seat(v_open, 'ZZ two', 'zz-080-5@example.com');
  if r1 is null or r2 is null then raise exception 'FAIL B2: an un-capped free panel refused a registration past its planning target'; end if;
  if public.panel_seats_remaining(v_open) is not null then raise exception 'FAIL B2: panel_seats_remaining reports a number for an un-enforced panel'; end if;
  raise notice 'PASS B2: un-capped free panel stays open past max_capacity; remaining is NULL';

  -- B3. paid panel, cap 1: a live hold takes the seat; an expired hold frees it
  r1 := public.register_panel_seat(v_paid, 'ZZ payer', 'zz-080-6@example.com', null, null, 'patron', 36);
  if r1 is null then raise exception 'FAIL B3: first paid registration refused'; end if;
  if (select payment_status from public.panel_registrations where id = r1) <> 'pending'
     or (select hold_expires_at from public.panel_registrations where id = r1) <= now() + interval '35 minutes' then
    raise exception 'FAIL B3: paid registration is not pending with a ~36 minute hold';
  end if;
  r2 := public.register_panel_seat(v_paid, 'ZZ second', 'zz-080-7@example.com', null, null, 'patron', 36);
  if r2 is not null then raise exception 'FAIL B3: a second paid seat was sold while the first hold is live'; end if;
  update public.panel_registrations set hold_expires_at = now() - interval '1 second' where id = r1;
  r3 := public.register_panel_seat(v_paid, 'ZZ third', 'zz-080-8@example.com', null, null, 'patron', 36);
  if r3 is null then raise exception 'FAIL B3: an expired hold did not free its seat'; end if;
  update public.panel_registrations set payment_status = 'paid', hold_expires_at = null where id = r3;
  if public.panel_seats_taken(v_paid) <> 1 then raise exception 'FAIL B3: a paid seat is not counted once'; end if;
  raise notice 'PASS B3: live hold blocks the next buyer, expired hold frees the seat, paid counts';

  -- B4. refusals that must be errors, not silent NULLs
  begin
    perform public.register_panel_seat(v_paid, 'ZZ nohold', 'zz-080-9@example.com');
    raise exception 'FAIL B4: a paid registration without a hold was accepted';
  exception when check_violation then raise notice 'PASS B4a: paid without a hold refused';
  end;
  begin
    update public.panels set hard_cap = true, max_capacity = null where id = v_open;
    raise exception 'FAIL B4: hard_cap without max_capacity was accepted';
  exception when check_violation then raise notice 'PASS B4b: hard_cap needs a max_capacity';
  end;
  update public.panels set is_published = false where id = v_hard;
  if public.panel_seats_remaining(v_hard) is not null then raise exception 'FAIL B4: seats_remaining answers for an unpublished panel'; end if;
  raise notice 'PASS B4c: unpublished panel reports nothing';

  delete from public.panels where title like 'ZZ VERIFY 080%';
  if exists (select 1 from public.panels where title like 'ZZ VERIFY 080%')
     or exists (select 1 from public.panel_registrations where email like 'zz-080-%@example.com') then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;

-- ── C. live panels as the public will see them  (results grid)
select p.title, p.signup_type, p.cost / 100.0 as price, p.max_capacity, p.hard_cap, p.is_published,
       public.panel_seats_taken(p.id) as seats_taken, public.panel_seats_remaining(p.id) as seats_remaining_public
  from public.panels p
 where p.event_id = (select id from public.events where is_active)
 order by p.panel_day, p.title;

-- ── Z. residue  (want zero rows)
select id, title from public.panels where title like 'ZZ VERIFY 080%';
