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

-- ── A. contests gained its two columns
--    want: is_kids_category boolean NOT NULL default false,
--          active boolean NOT NULL default true.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema='public' and table_name='contests'
   and column_name in ('is_kids_category','active')
 order by column_name;

-- ── B. pinup_entries gained the three consent columns
--    want: marketing_opt_in boolean NOT NULL default false,
--          marketing_opt_in_at timestamptz NULL,
--          marketing_opt_in_source text NULL.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema='public' and table_name='pinup_entries'
   and column_name like 'marketing%'
 order by column_name;

-- ── C. exactly ONE register_pinup_entry remains
--    want: 1 row, 9 arguments. TWO rows means the 8 argument version survived
--    the drop, and a named-argument call could then match either - Postgres
--    raises an ambiguity error at runtime, on the intake path, in front of a
--    contestant.
select p.oid::regprocedure as signature, p.pronargs as arg_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='register_pinup_entry'
 order by p.pronargs;

-- ── D. consent defaults to FALSE and is never assumed  (NOTICE pane)
--    want: two PASS notices. The control comes first: a row must exist and be
--    readable, or "opt_in is false" would pass against an empty table.
do $$
declare v_event uuid; v_id uuid; v_optin boolean; v_at timestamptz;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);
  delete from public.pinup_entries where email like 'zz-consent-%@example.com';

  -- Two statements, deliberately. Joining the function to pinup_entries in ONE
  -- statement does not work: the row is inserted by the function during that
  -- statement, and the outer scan uses the snapshot taken at statement start,
  -- so the join finds nothing. The failure would surface as 'no row created',
  -- blaming the function for a defect in the test.
  v_id := (select r.id from public.register_pinup_entry(
    v_event, 'ZZ Consent Off', 'zz-consent-off@example.com', '(910) 555-0501') r);

  v_optin := (select marketing_opt_in    from public.pinup_entries where id = v_id);
  v_at    := (select marketing_opt_in_at from public.pinup_entries where id = v_id);

  if v_optin is null then raise exception 'FAIL: no row created - the assertions below would be vacuous'; end if;
  raise notice 'PASS: control row created and readable';

  if v_optin is not false or v_at is not null then
    raise exception 'FAIL: consent defaulted to % with timestamp % - it must default to false/null', v_optin, v_at;
  end if;
  raise notice 'PASS: marketing_opt_in defaults to false with no timestamp';
end $$;

-- ── E. opting in stamps the timestamp SERVER-SIDE  (NOTICE pane)
--    want: three PASS notices. The timestamp is the part that matters if the
--    consent is ever questioned, so it must come from the database clock and
--    not from anything a caller supplied.
do $$
declare v_event uuid; v_id uuid; v_optin boolean; v_at timestamptz; v_src text;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);

  -- Split for the same snapshot reason as block D.
  v_id := (select r.id from public.register_pinup_entry(
    v_event, 'ZZ Consent On', 'zz-consent-on@example.com', '(910) 555-0502',
    null, null, null, 25, true) r);

  v_optin := (select marketing_opt_in        from public.pinup_entries where id = v_id);
  v_at    := (select marketing_opt_in_at     from public.pinup_entries where id = v_id);
  v_src   := (select marketing_opt_in_source from public.pinup_entries where id = v_id);

  if v_optin is not true then raise exception 'FAIL: opt-in was not recorded'; end if;
  raise notice 'PASS: marketing_opt_in stored as true';

  if v_at is null then raise exception 'FAIL: opt-in has no timestamp'; end if;
  if v_at < now() - interval '5 minutes' or v_at > now() + interval '5 minutes' then
    raise exception 'FAIL: timestamp % is not from the database clock', v_at;
  end if;
  raise notice 'PASS: timestamp set server-side, within tolerance of now()';

  if v_src is distinct from 'pinup-entry' then
    raise exception 'FAIL: source was %, expected pinup-entry', v_src;
  end if;
  raise notice 'PASS: source recorded as pinup-entry';
end $$;

-- ── F. consent WITHOUT a timestamp is impossible  (NOTICE pane)
--    want: PASS. Consent with no timestamp is not evidence of consent, so the
--    constraint refuses it rather than trusting the application to remember.
do $$
begin
  begin
    update public.pinup_entries
       set marketing_opt_in = true, marketing_opt_in_at = null
     where email = 'zz-consent-off@example.com';
    raise exception 'FAIL: opt-in was stored with a null timestamp';
  exception
    when check_violation then raise notice 'PASS: opt-in without a timestamp rejected';
  end;

  -- F is the last block that needs the rows D and E created, so F removes them.
  -- Cleanup belongs with the last user, not in whichever block happens to run
  -- afterwards - that is what left two live rows for the capacity block to count.
  delete from public.pinup_entries where email like 'zz-consent-%@example.com';
end $$;

-- ── G. the replaced function still behaves  (NOTICE pane)
--    want: two PASS notices. 052 rewrites register_pinup_entry() wholesale, so
--    the capacity branch and the returned shape are re-asserted here rather
--    than trusted from verify_051 - that file tested a DIFFERENT definition.
do $$
declare v_event uuid; r1 record; r2 record; n int;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);
  -- ENSURE the precondition, then ASSERT it. This block sets capacity to 1 and
  -- expects the first entry to be confirmed at position 1, which is only true
  -- against an empty entry list for this event. It previously deleted just its
  -- own zz-cap52- rows and INHERITED the rest of the state: blocks D and E each
  -- leave a row behind, so register_pinup_entry counted 2 and returned
  -- 'waitlist at position 3'. The assertion was correct; the precondition was
  -- assumed rather than established.
  --
  -- Asserted as well as ensured, because the delete only covers fixtures. A real
  -- entry for this event would produce the same confusing off-by-N, and this
  -- says so plainly instead.
  delete from public.pinup_entries where email like 'zz-%@example.com';

  n := (select count(*) from public.pinup_entries
         where event_id = v_event and status in ('pending','confirmed'));
  if n <> 0 then
    raise exception 'FAIL: cannot test capacity - % live entr(y/ies) already exist for this event. This block needs an empty entry list; clear them or run it against a clean database.', n;
  end if;

  for r1 in select * from public.register_pinup_entry(
    v_event, 'ZZ Cap52 One', 'zz-cap52-1@example.com', '(910) 555-0601',
    null, null, null, 1) as t loop exit; end loop;
  if r1.status <> 'confirmed' or r1.queue_position <> 1 then
    raise exception 'FAIL: first entry was % at position %', r1.status, r1.queue_position;
  end if;
  raise notice 'PASS: first entry confirmed at queue_position 1';

  for r2 in select * from public.register_pinup_entry(
    v_event, 'ZZ Cap52 Two', 'zz-cap52-2@example.com', '(910) 555-0602',
    null, null, null, 1) as t loop exit; end loop;
  if r2.status <> 'waitlist' or r2.queue_position <> 2 then
    raise exception 'FAIL: second entry was % at position %', r2.status, r2.queue_position;
  end if;
  raise notice 'PASS: entry past capacity waitlisted at queue_position 2';

  delete from public.pinup_entries where email like 'zz-%@example.com';
end $$;

-- ── Z. residue check - run LAST
--    want: 0 rows.
select id, full_name, email, status
  from public.pinup_entries
 where email like 'zz-%@example.com' or full_name like 'ZZ %';
