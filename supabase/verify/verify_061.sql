-- ============================================================
-- HOW TO RUN: paste the whole file and run it. Read the MESSAGES pane.
-- A failure RAISES and aborts, so a clean finish IS a pass.
--
-- STYLE NOTE: variables are assigned with `v := (select ...)`, never
-- `select ... into v` - outside plpgsql that reads as CREATE TABLE AS.
--
-- ⚠  WRITES fixtures and moves the event's voting window while it runs, then
-- RESTORES both. Block E owns the teardown; block Z only looks.
--
-- THE BOUNDARIES TESTED ARE THE REAL ONES, not round numbers:
--   2027-04-20T12:00:00  before open   -> refused
--   2027-04-21T12:00:01  one second in -> allowed
--   2027-05-21T23:59:59  last moment   -> allowed
--   2027-05-22T00:00:00  the bound     -> refused (exclusive)
-- Testing 'some time in the middle' would pass against a window off by a month.
-- ============================================================

-- ── A. columns and constraint exist
--    want: voting_opens_at and voting_closes_at, both timestamptz, nullable.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='events' and column_name like 'voting%'
 order by column_name;

-- ── B. the half-configured window is impossible  (NOTICE pane)
--    want: two PASS notices. A window with only one end set is the state that
--    would silently leave voting open forever.
do $$
declare v_event uuid;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);
  begin
    update public.events set voting_opens_at = now(), voting_closes_at = null where id = v_event;
    raise exception 'FAIL: a half-configured window was accepted';
  exception
    when check_violation then raise notice 'PASS: open-without-close refused';
  end;
  begin
    update public.events set voting_opens_at = now() + interval '1 day', voting_closes_at = now() where id = v_event;
    raise exception 'FAIL: a window closing before it opens was accepted';
  exception
    when check_violation then raise notice 'PASS: close-before-open refused';
  end;
end $$;

-- ── C. voting_state reports all four states  (NOTICE pane)
--    want: four PASS notices. Moves the window to put now() on each side.
do $$
declare v_event uuid; v_o timestamptz; v_c timestamptz; v_state text;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);
  v_o := (select voting_opens_at from public.events where id = v_event);
  v_c := (select voting_closes_at from public.events where id = v_event);

  update public.events set voting_opens_at = null, voting_closes_at = null where id = v_event;
  v_state := (select public.voting_state(v_event));
  if v_state <> 'unscheduled' then raise exception 'FAIL: unset window reported %', v_state; end if;
  raise notice 'PASS: no window reports unscheduled';

  update public.events set voting_opens_at = now() + interval '10 days', voting_closes_at = now() + interval '40 days' where id = v_event;
  v_state := (select public.voting_state(v_event));
  if v_state <> 'before' then raise exception 'FAIL: future window reported %', v_state; end if;
  raise notice 'PASS: future window reports before';

  update public.events set voting_opens_at = now() - interval '1 day', voting_closes_at = now() + interval '29 days' where id = v_event;
  v_state := (select public.voting_state(v_event));
  if v_state <> 'open' then raise exception 'FAIL: current window reported %', v_state; end if;
  raise notice 'PASS: current window reports open';

  update public.events set voting_opens_at = now() - interval '40 days', voting_closes_at = now() - interval '10 days' where id = v_event;
  v_state := (select public.voting_state(v_event));
  if v_state <> 'closed' then raise exception 'FAIL: past window reported %', v_state; end if;
  raise notice 'PASS: past window reports closed';

  update public.events set voting_opens_at = v_o, voting_closes_at = v_c where id = v_event;
end $$;

-- ── D. THE REAL BOUNDARIES  (NOTICE pane)
--    want: five PASS notices, including the control.
--    Each case sets the window so that now() sits exactly where the named
--    instant would sit relative to the 2027 dates, then attempts a real vote.
do $$
declare
  v_event uuid; v_contest uuid; v_entry uuid; v_user uuid; n int;
  v_o constant timestamptz := '2027-04-21T12:00:00-04:00';
  v_c constant timestamptz := '2027-05-21T23:59:59-04:00';
  v_save_o timestamptz; v_save_c timestamptz;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);
  v_save_o := (select voting_opens_at from public.events where id = v_event);
  v_save_c := (select voting_closes_at from public.events where id = v_event);

  insert into auth.users (id, email, instance_id, aud, role)
  values (gen_random_uuid(), 'zz-window@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  returning id into v_user;
  insert into public.profiles (id, email, full_name, role)
  values (v_user, 'zz-window@example.com', 'ZZ Window', 'public')
  on conflict (id) do update set email = excluded.email;

  insert into public.contests (event_id, name, "order") values (v_event, 'ZZ Window Contest', 9997) returning id into v_contest;
  insert into public.contest_entries (contest_id, collector_name) values (v_contest, 'ZZ Window Entry') returning id into v_entry;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role','authenticated')::text, true);

  -- CONTROL FIRST. Window open around now: a vote must SUCCEED, or every
  -- refusal below would pass for the wrong reason.
  update public.events set voting_opens_at = now() - interval '1 hour', voting_closes_at = now() + interval '1 hour' where id = v_event;
  set local role authenticated;
  insert into public.contest_votes (entry_id, contest_id, voter_id) values (v_entry, v_contest, v_user);
  reset role;
  n := (select count(*) from public.contest_votes where voter_id = v_user);
  if n <> 1 then raise exception 'FAIL: control vote did not land (got %)', n; end if;
  raise notice 'PASS: a vote inside the window succeeds (control)';
  delete from public.contest_votes where voter_id = v_user;

  -- 2027-04-20T12:00:00 : one day BEFORE open -> refused
  update public.events set voting_opens_at = now() + interval '1 day', voting_closes_at = now() + interval '31 days' where id = v_event;
  begin
    set local role authenticated;
    insert into public.contest_votes (entry_id, contest_id, voter_id) values (v_entry, v_contest, v_user);
    reset role;
    raise exception 'FAIL: a vote was accepted BEFORE the window opened (2027-04-20 case)';
  exception
    when insufficient_privilege then raise notice 'PASS: 2027-04-20 equivalent refused (before open)';
  end;
  reset role;

  -- 2027-04-21T12:00:01 : ONE SECOND after open -> allowed
  update public.events set voting_opens_at = now() - interval '1 second', voting_closes_at = now() + interval '30 days' where id = v_event;
  set local role authenticated;
  insert into public.contest_votes (entry_id, contest_id, voter_id) values (v_entry, v_contest, v_user);
  reset role;
  n := (select count(*) from public.contest_votes where voter_id = v_user);
  if n <> 1 then raise exception 'FAIL: a vote one second AFTER opening was refused'; end if;
  raise notice 'PASS: 2027-04-21T12:00:01 equivalent allowed (one second inside)';
  delete from public.contest_votes where voter_id = v_user;

  -- 2027-05-21T23:59:59 : the last accepted instant -> allowed
  update public.events set voting_opens_at = now() - interval '30 days', voting_closes_at = now() + interval '1 second' where id = v_event;
  set local role authenticated;
  insert into public.contest_votes (entry_id, contest_id, voter_id) values (v_entry, v_contest, v_user);
  reset role;
  n := (select count(*) from public.contest_votes where voter_id = v_user);
  if n <> 1 then raise exception 'FAIL: a vote one second before the closing bound was refused'; end if;
  raise notice 'PASS: 2027-05-21T23:59:59 equivalent allowed (inside the exclusive bound)';
  delete from public.contest_votes where voter_id = v_user;

  -- 2027-05-22T00:00:00 : the bound itself -> refused, because it is EXCLUSIVE.
  -- Set the bound to exactly now() rather than a second ago: a <= comparison
  -- would accept this and a < refuses it, so this case is what distinguishes
  -- the two. A bound in the past would pass either way and prove nothing.
  update public.events set voting_opens_at = now() - interval '31 days', voting_closes_at = now() where id = v_event;
  begin
    set local role authenticated;
    insert into public.contest_votes (entry_id, contest_id, voter_id) values (v_entry, v_contest, v_user);
    reset role;
    raise exception 'FAIL: a vote was accepted AT the closing bound - the comparison is <= when it must be <';
  exception
    when insufficient_privilege then raise notice 'PASS: 2027-05-22T00:00:00 equivalent refused (bound is exclusive)';
  end;
  reset role;

  -- NULL window must refuse, not permit.
  update public.events set voting_opens_at = null, voting_closes_at = null where id = v_event;
  begin
    set local role authenticated;
    insert into public.contest_votes (entry_id, contest_id, voter_id) values (v_entry, v_contest, v_user);
    reset role;
    raise exception 'FAIL: an unscheduled window ACCEPTED a vote - absence of a window must mean closed';
  exception
    when insufficient_privilege then raise notice 'PASS: unscheduled window refuses votes';
  end;
  reset role;

  -- teardown, and restore the real window
  delete from public.contest_votes where voter_id = v_user;
  delete from public.contest_entries where contest_id = v_contest;
  delete from public.contests where id = v_contest;
  delete from public.profiles where id = v_user;
  delete from auth.users where id = v_user;
  update public.events set voting_opens_at = v_save_o, voting_closes_at = v_save_c where id = v_event;
end $$;

-- ── Z. residue check - run LAST. want: 4 rows, all count 0, and the window
--    restored to whatever it was before this file ran.
select 'contests' as tbl, count(*) from public.contests where name like 'ZZ Window%'
union all select 'entries', count(*) from public.contest_entries where collector_name like 'ZZ Window%'
union all select 'users',   count(*) from auth.users where email = 'zz-window@example.com'
union all select 'votes',   count(*) from public.contest_votes
                             where voter_id in (select id from auth.users where email = 'zz-window@example.com');
