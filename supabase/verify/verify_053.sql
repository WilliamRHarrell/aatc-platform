-- ============================================================
-- HOW TO RUN: paste the whole file and run it. Block by block is not required.
--
-- Read the MESSAGES / NOTICES pane, not the results grid. Most checks here
-- report through RAISE NOTICE, and Messages accumulates across a whole-file
-- run, so every PASS is visible at the end.
--
-- A failure RAISES, which aborts the run. So a clean finish IS a pass - no news
-- is good news. It also means the whole file is one transaction: an abort rolls
-- back every test row along with it, which is why a failed run leaves nothing
-- behind.
--
-- The results grid shows only the LAST statement's output. So the blocks that
-- return ROWS rather than notices - the shape and policy listings near the top -
-- are the only ones that need selecting and running individually, and only if
-- you want to read them. They assert nothing on their own; the notice blocks do
-- the asserting.
--
-- STYLE NOTE: variables are assigned with `v := (select ...)`, never with
-- `select ... into v`. Both are valid plpgsql and mean the same thing, but the
-- SQL Editor's pre-flight analyzer reads the file without knowing it is inside
-- a DO block, and in plain SQL `SELECT ... INTO name` is CREATE TABLE AS. It
-- was reporting "creates a table without enabling RLS" against DECLARE
-- variables like v_event, on a script that creates no tables at all. Renaming
-- the variables would not have helped - the trigger is the INTO syntax, not
-- the name. Please do not convert these back.
-- ============================================================

-- ── A. shape
--    want: voter_id uuid NOT NULL, vote_date date NOT NULL, and NO voter_token.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='contest_votes'
 order by ordinal_position;

-- ── B. constraints and policies
--    want: contest_votes_one_per_day UNIQUE (contest_id, voter_id, vote_date),
--          and exactly two policies - own insert (INSERT), own read (SELECT).
select conname, pg_get_constraintdef(oid)
  from pg_constraint where conrelid='public.contest_votes'::regclass order by conname;

select policyname, cmd, roles::text, qual, with_check
  from pg_policies where schemaname='public' and tablename='contest_votes' order by policyname;

-- ── C. an authenticated user can vote once  (NOTICE pane)
--    This is the CONTROL for every negative below. If a signed-in user cannot
--    vote at all, the rejections in D, E and F would pass while proving nothing.
do $$
declare v_event uuid; v_contest uuid; v_entry uuid; v_user uuid; n int;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);

  insert into auth.users (id, email, instance_id, aud, role)
  values (gen_random_uuid(), 'zz-voter-a@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  returning id into v_user;

  insert into public.contests (event_id, name, scheduled_time, "order")
  values (v_event, 'ZZ Verify Contest', now(), 999) returning id into v_contest;

  insert into public.contest_entries (contest_id, collector_name)
  values (v_contest, 'ZZ Verify Collector') returning id into v_entry;

  insert into public.contest_votes (entry_id, contest_id, voter_id)
  values (v_entry, v_contest, v_user);

  n := (select count(*) from public.contest_votes where voter_id = v_user);
  if n <> 1 then raise exception 'FAIL: expected 1 vote, found %', n; end if;
  raise notice 'PASS: an authenticated user can vote (control)';

  -- vote_date must have been set by the trigger, not left null or defaulted
  perform 1 from public.contest_votes
   where voter_id = v_user
     and vote_date = (now() at time zone 'America/New_York')::date;
  if not found then raise exception 'FAIL: vote_date was not set to the New York date'; end if;
  raise notice 'PASS: vote_date stamped by the trigger, America/New_York';
end $$;

-- ── D. a SECOND vote the same day is rejected  (NOTICE pane)
do $$
declare v_contest uuid; v_entry uuid; v_user uuid;
begin
  v_contest := (select id from public.contests where name='ZZ Verify Contest');
  v_entry := (select id from public.contest_entries where contest_id=v_contest limit 1);
  v_user := (select id from auth.users where email='zz-voter-a@example.com');

  begin
    insert into public.contest_votes (entry_id, contest_id, voter_id)
    values (v_entry, v_contest, v_user);
    raise exception 'FAIL: the same user voted twice in one category on one day';
  exception
    when unique_violation then raise notice 'PASS: second vote same day rejected';
  end;
end $$;

-- ── E. the NEXT day is allowed  (NOTICE pane)
--    Inserted then back-dated, because the trigger always stamps today. This is
--    the row the constraint must tolerate.
do $$
declare v_contest uuid; v_entry uuid; v_user uuid; v_id uuid; n int;
begin
  v_contest := (select id from public.contests where name='ZZ Verify Contest');
  v_entry := (select id from public.contest_entries where contest_id=v_contest limit 1);
  v_user := (select id from auth.users where email='zz-voter-a@example.com');

  update public.contest_votes set vote_date = vote_date - 1 where voter_id = v_user;

  insert into public.contest_votes (entry_id, contest_id, voter_id)
  values (v_entry, v_contest, v_user) returning id into v_id;

  n := (select count(*) from public.contest_votes where voter_id = v_user);
  if n <> 2 then raise exception 'FAIL: expected 2 votes across 2 days, found %', n; end if;
  raise notice 'PASS: the same user may vote again the following day';
end $$;

-- ── F. anon cannot vote at all  (NOTICE pane)
--    Control first: postgres can still see the rows, so a zero result below is
--    the policy and not an empty table.
do $$
declare v_contest uuid; v_entry uuid; v_user uuid; n int;
begin
  v_contest := (select id from public.contests where name='ZZ Verify Contest');
  v_entry := (select id from public.contest_entries where contest_id=v_contest limit 1);
  v_user := (select id from auth.users where email='zz-voter-a@example.com');

  n := (select count(*) from public.contest_votes where voter_id = v_user);
  if n = 0 then raise exception 'FAIL: no rows to hide - the checks below would be vacuous'; end if;
  raise notice 'PASS: % rows exist and are visible as postgres (control)', n;

  begin
    set local role anon;
    insert into public.contest_votes (entry_id, contest_id, voter_id)
    values (v_entry, v_contest, v_user);
    reset role;
    raise exception 'FAIL: anon inserted a vote';
  exception
    when insufficient_privilege then raise notice 'PASS: anon cannot vote';
  end;
  reset role;

  set local role anon;
  n := (select count(*) from public.contest_votes);
  reset role;
  if n <> 0 then raise exception 'FAIL: anon read % vote row(s)', n; end if;
  raise notice 'PASS: anon cannot read votes';
end $$;

-- ── G. a user cannot post ANOTHER user's voter_id  (NOTICE pane)
--    The whole point of the policy. Without it voter_id is decorative.
do $$
declare v_contest uuid; v_entry uuid; v_a uuid; v_b uuid;
begin
  v_contest := (select id from public.contests where name='ZZ Verify Contest');
  v_entry := (select id from public.contest_entries where contest_id=v_contest limit 1);
  v_a := (select id from auth.users where email='zz-voter-a@example.com');

  insert into auth.users (id, email, instance_id, aud, role)
  values (gen_random_uuid(), 'zz-voter-b@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  returning id into v_b;

  -- Impersonate user B, then try to cast a vote as user A.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b::text, 'role','authenticated')::text, true);
  begin
    set local role authenticated;
    insert into public.contest_votes (entry_id, contest_id, voter_id)
    values (v_entry, v_contest, v_a);
    reset role;
    raise exception 'FAIL: user B cast a vote under user A''s id';
  exception
    when insufficient_privilege then raise notice 'PASS: a user cannot vote as somebody else';
  end;
  reset role;
end $$;

-- ── Z. FIXTURE RESIDUE CHECK - run LAST
--
--    ⚠  THESE ARE NOT TABLE ROW COUNTS. Every number below counts only rows
--    this script created, matched on the zz- / ZZ prefix. A clean run is ALL
--    ZEROS. It says nothing about your real data - `contests` really does hold
--    49 categories while this reports 0.
--
--    A non-zero here means a block failed to clean up after itself, which is
--    information worth having rather than something to tidy away.
delete from public.contest_votes
 where voter_id in (select id from auth.users where email like 'zz-voter-%@example.com');
delete from public.contest_entries where collector_name like 'ZZ %';
delete from public.contests where name like 'ZZ %';
delete from auth.users where email like 'zz-voter-%@example.com';

select 'contests matching ZZ %'                as fixtures_looked_for,
       count(*)                                    as fixtures_remaining
  from public.contests where name like 'ZZ %'
union all select 'contest_entries matching ZZ %', count(*)
  from public.contest_entries where collector_name like 'ZZ %'
union all select 'auth.users matching zz-voter-%', count(*)
  from auth.users where email like 'zz-voter-%@example.com';
