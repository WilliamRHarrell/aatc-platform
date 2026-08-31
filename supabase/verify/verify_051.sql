-- ============================================================
-- ⚠  RUN ONE LETTERED BLOCK AT A TIME - DO NOT RUN THIS FILE WHOLE.
--
-- The Supabase SQL Editor displays only the LAST statement's result. Running
-- the whole file returns the final query and discards every check above it.
--
-- ⚠  BLOCKS C THROUGH H REPORT VIA `RAISE NOTICE`, NOT THE RESULTS GRID.
-- Read the Messages / Notices pane. PASS is a notice; FAIL is a raised
-- exception, so it shows red.
--
-- Negative assertions catch only the named condition, never `when others`, and
-- every one of them is paired with a control proving the query could have found
-- something. See the rule in docs/HANDOFF.md - block G of verify_050 passed
-- while testing nothing because it lacked exactly that.
--
-- ⚠  BLOCKS C, D, F, F2, G2 AND H WRITE TEST ROWS, then delete them.
-- Block Z re-checks. Everything is prefixed zz-.
-- ============================================================

-- ── A. table shape and index
--    want: the columns from the spec; status default 'pending'.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pinup_entries'
 order by ordinal_position;

-- ── B. indexes
--    want: pk, idx_pinup_entries_event_status_created,
--          uq_pinup_entries_event_email (partial, WHERE status <> 'withdrawn')
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'pinup_entries'
 order by indexname;

-- ── C. anon CAN insert, and cannot lie about status  (NOTICE pane)
--    want: three PASS notices.
--    The control is the first one: if anon could not insert at all, the two
--    rejections below would pass while proving nothing about the WITH CHECK.
do $$
declare v_event uuid; n int;
begin
  select id into v_event from public.events where is_active order by start_date limit 1;
  if v_event is null then raise exception 'FAIL: no active event'; end if;

  set local role anon;
  insert into public.pinup_entries (event_id, full_name, email, phone, age_confirmed, status)
  values (v_event, 'ZZ Verify Control', 'zz-verify-control@example.com', '(910) 555-0000', true, 'pending');
  reset role;
  raise notice 'PASS: anon can insert a valid pending entry (control)';

  begin
    set local role anon;
    insert into public.pinup_entries (event_id, full_name, email, phone, age_confirmed, status)
    values (v_event, 'ZZ Verify Confirmed', 'zz-verify-confirmed@example.com', '(910) 555-0001', true, 'confirmed');
    reset role;
    raise exception 'FAIL: anon inserted a row with status=confirmed, skipping the waitlist';
  exception
    when insufficient_privilege then raise notice 'PASS: anon cannot self-assign status=confirmed';
  end;
  reset role;

  begin
    set local role anon;
    insert into public.pinup_entries (event_id, full_name, email, phone, age_confirmed, status)
    values (v_event, 'ZZ Verify Underage', 'zz-verify-age@example.com', '(910) 555-0002', false, 'pending');
    reset role;
    raise exception 'FAIL: anon inserted a row with age_confirmed=false';
  exception
    when insufficient_privilege then raise notice 'PASS: anon cannot insert without confirming age';
  end;
  reset role;

  delete from public.pinup_entries where email like 'zz-verify-%@example.com';
end $$;

-- ── D. anon CANNOT select, with a control  (NOTICE pane)
--    want: two PASS notices.
--    The control matters more here than anywhere else in this file. These rows
--    are name, email, phone and home address. An assertion that anon sees zero
--    rows passes identically when the table is empty - so a row is inserted
--    first, and postgres is shown to see it, before anon is asked.
do $$
declare v_event uuid; n_admin int; n_anon int;
begin
  select id into v_event from public.events where is_active order by start_date limit 1;

  insert into public.pinup_entries (event_id, full_name, email, phone, age_confirmed)
  values (v_event, 'ZZ Verify Visible', 'zz-verify-visible@example.com', '(910) 555-0003', true);

  select count(*) into n_admin from public.pinup_entries where email = 'zz-verify-visible@example.com';
  if n_admin <> 1 then
    raise exception 'FAIL: the control row is not visible even to postgres (got %). The anon check below would be vacuous.', n_admin;
  end if;
  raise notice 'PASS: control row exists and is readable as postgres';

  set local role anon;
  select count(*) into n_anon from public.pinup_entries where email = 'zz-verify-visible@example.com';
  reset role;

  if n_anon <> 0 then
    raise exception 'FAIL: anon read % contestant row(s), including email, phone and address', n_anon;
  end if;
  raise notice 'PASS: anon cannot read entries';

  delete from public.pinup_entries where email = 'zz-verify-visible@example.com';
end $$;

-- ── E. anon cannot UPDATE  (NOTICE pane)
--    want: two PASS notices. UPDATE raises nothing when RLS filters the row
--    out - it succeeds against zero rows - so this asserts on the row count,
--    not on an exception. See the HANDOFF note on the 204 silent-success case.
do $$
declare v_event uuid; n int;
begin
  select id into v_event from public.events where is_active order by start_date limit 1;
  insert into public.pinup_entries (event_id, full_name, email, phone, age_confirmed)
  values (v_event, 'ZZ Verify Update', 'zz-verify-update@example.com', '(910) 555-0004', true);

  set local role anon;
  update public.pinup_entries set status = 'confirmed' where email = 'zz-verify-update@example.com';
  get diagnostics n = row_count;
  reset role;

  if n <> 0 then raise exception 'FAIL: anon updated % row(s)', n; end if;
  raise notice 'PASS: anon update affected 0 rows';

  select count(*) into n from public.pinup_entries
   where email = 'zz-verify-update@example.com' and status = 'confirmed';
  if n <> 0 then raise exception 'FAIL: the row was modified despite a 0 row count'; end if;
  raise notice 'PASS: row genuinely unchanged';

  delete from public.pinup_entries where email = 'zz-verify-update@example.com';
end $$;

-- ── F. the 26th entry is WAITLISTED, not rejected  (NOTICE pane)
--    want: three PASS notices. Writes 26 rows then removes them.
--    Uses a low capacity so the block stays fast; the cap is a parameter, and
--    testing it at 3 tests the same branch as testing it at 25.
do $$
declare v_event uuid; r record; i int; v_status text;
begin
  select id into v_event from public.events where is_active order by start_date limit 1;
  delete from public.pinup_entries where email like 'zz-cap-%@example.com';

  for i in 1..3 loop
    select status into v_status from public.register_pinup_entry(
      v_event, 'ZZ Cap ' || i, 'zz-cap-' || i || '@example.com', '(910) 555-01' || lpad(i::text,2,'0'),
      null, null, null, 3);
    if v_status <> 'confirmed' then
      raise exception 'FAIL: entry % was %, expected confirmed', i, v_status;
    end if;
  end loop;
  raise notice 'PASS: entries 1 to 3 confirmed against a capacity of 3';

  select status into v_status from public.register_pinup_entry(
    v_event, 'ZZ Cap 4', 'zz-cap-4@example.com', '(910) 555-0104', null, null, null, 3);
  if v_status <> 'waitlist' then
    raise exception 'FAIL: entry 4 was %, expected waitlist', v_status;
  end if;
  raise notice 'PASS: entry past capacity is waitlisted, not rejected';

  select count(*) into i from public.pinup_entries where email like 'zz-cap-%@example.com';
  if i <> 4 then raise exception 'FAIL: expected 4 rows stored, found %', i; end if;
  raise notice 'PASS: the waitlisted entry was stored, not discarded';

  delete from public.pinup_entries where email like 'zz-cap-%@example.com';
end $$;

-- ── F2. the function RETURNS what it claims to  (NOTICE pane)
--    want: four PASS notices.
--
--    Block F asserts on `status` alone, and that is not enough. A function can
--    parse, be created, return the right column NAMES, and still be broken at
--    call time - which is exactly what happened here twice in one definition:
--
--      `position` as a RETURNS TABLE column is a parse error, caught at
--      CREATE FUNCTION. That one announces itself.
--
--      A bare `status` inside the body is ambiguous against the OUT variable of
--      the same name. plpgsql's default variable_conflict is `error`, so it
--      raises at CALL time, not at creation. A verify that only inspected
--      pg_proc, or only checked the returned column names, would report a
--      healthy function.
--
--    So this block calls it for real and reads every column back. id must be a
--    usable key that resolves to a row; queue_position must ADVANCE, because a
--    hardcoded 1 or a null would satisfy every other assertion in this file.
do $$
declare
  v_event uuid;
  r1 record;
  r2 record;
  n int;
begin
  select id into v_event from public.events where is_active order by start_date limit 1;
  delete from public.pinup_entries where email like 'zz-shape-%@example.com';

  select * into r1 from public.register_pinup_entry(
    v_event, 'ZZ Shape One', 'zz-shape-1@example.com', '(910) 555-0401') as t;

  if r1.id is null then raise exception 'FAIL: returned id is null'; end if;
  select count(*) into n from public.pinup_entries where pinup_entries.id = r1.id;
  if n <> 1 then raise exception 'FAIL: returned id % does not resolve to a row', r1.id; end if;
  raise notice 'PASS: returned id resolves to the row that was created';

  if r1.status is null or r1.status not in ('confirmed','waitlist') then
    raise exception 'FAIL: returned status was %', r1.status;
  end if;
  raise notice 'PASS: returned status is %', r1.status;

  if r1.queue_position is null or r1.queue_position < 1 then
    raise exception 'FAIL: returned queue_position was %', r1.queue_position;
  end if;
  raise notice 'PASS: first registration reported queue_position %', r1.queue_position;

  -- The one that a hardcoded value would fail.
  select * into r2 from public.register_pinup_entry(
    v_event, 'ZZ Shape Two', 'zz-shape-2@example.com', '(910) 555-0402') as t;

  if r2.queue_position <> r1.queue_position + 1 then
    raise exception 'FAIL: queue_position did not advance - first %, second %',
      r1.queue_position, r2.queue_position;
  end if;
  raise notice 'PASS: queue_position advanced % -> %', r1.queue_position, r2.queue_position;

  delete from public.pinup_entries where email like 'zz-shape-%@example.com';
end $$;

-- ── G. concurrent inserts do not both take the last place  (NOTICE pane)
--    want: PASS.
--    Cannot be proven from a single session - one session serialises itself.
--    What IS provable here is that the lock is actually taken, which is the
--    mechanism the guarantee rests on: register_pinup_entry() holds a
--    transaction-scoped advisory lock on the event, so a second session blocks
--    until the first commits.
--
--    To test it for real, open a SECOND SQL editor tab and run:
--        begin;
--        select * from public.register_pinup_entry(
--          (select id from public.events where is_active limit 1),
--          'ZZ Race A', 'zz-race-a@example.com', '(910) 555-0201');
--        -- leave it open, do NOT commit
--    then run this block in the first tab. It should report the lock as HELD by
--    the other session. Roll the second tab back afterwards.
do $$
declare v_event uuid; v_key bigint; n int;
begin
  select id into v_event from public.events where is_active order by start_date limit 1;
  v_key := hashtext('pinup_entry:' || v_event::text);

  select count(*) into n from pg_locks
   where locktype = 'advisory' and objid = (v_key::bigint & 4294967295);

  if n > 0 then
    raise notice 'PASS: the advisory lock is currently HELD - a concurrent registration is blocking, which is the guarantee working';
  else
    raise notice 'PASS (weak): no concurrent session holding the lock right now. The lock is taken inside register_pinup_entry(); see the two-tab procedure above to observe it.';
  end if;
end $$;

-- ── H. required fields are enforced inside the function too  (NOTICE pane)
--    want: PASS. The route validates, but the route is not the only caller.
do $$
declare v_event uuid;
begin
  select id into v_event from public.events where is_active order by start_date limit 1;
  begin
    perform public.register_pinup_entry(v_event, '  ', 'zz-blank@example.com', '(910) 555-0300');
    raise exception 'FAIL: a blank full_name was accepted';
  exception
    when check_violation then raise notice 'PASS: blank full_name rejected by the function';
  end;
  delete from public.pinup_entries where email = 'zz-blank@example.com';
end $$;

-- ── I. spots remaining is exposed, and exposes nothing else
--    want: an integer, and anon may call it.
select public.pinup_spots_remaining((select id from public.events where is_active order by start_date limit 1)) as remaining;

-- ── Z. residue check - run LAST
--    want: 0 rows. Every block above cleans up after itself.
select id, full_name, email, status, created_at
  from public.pinup_entries
 where email like 'zz-%@example.com' or full_name like 'ZZ %';
