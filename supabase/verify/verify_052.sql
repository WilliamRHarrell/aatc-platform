-- ============================================================
-- ⚠  RUN ONE LETTERED BLOCK AT A TIME - DO NOT RUN THIS FILE WHOLE.
--    The SQL Editor shows only the LAST statement's result.
--
-- ⚠  BLOCKS D THROUGH G REPORT VIA `RAISE NOTICE`. Read the Messages pane.
--
-- 052 does two things that verify_051 cannot cover: it adds columns, and it
-- REPLACES register_pinup_entry() with a nine argument version. The replacement
-- is a full copy of the definition, so it can drift from the original and it
-- carried both of the original's defects until they were fixed in both places.
-- A verify that only checked the new columns would miss that entirely.
--
-- ⚠  BLOCKS E, F AND G WRITE TEST ROWS, then delete them. Block Z re-checks.
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
declare v_event uuid; v_optin boolean; v_at timestamptz;
begin
  select id into v_event from public.events where is_active order by start_date limit 1;
  delete from public.pinup_entries where email like 'zz-consent-%@example.com';

  select marketing_opt_in, marketing_opt_in_at into v_optin, v_at
    from public.register_pinup_entry(
      v_event, 'ZZ Consent Off', 'zz-consent-off@example.com', '(910) 555-0501') r
    join public.pinup_entries e on e.id = r.id;

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
declare v_event uuid; v_optin boolean; v_at timestamptz; v_src text;
begin
  select id into v_event from public.events where is_active order by start_date limit 1;

  select marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source
    into v_optin, v_at, v_src
    from public.register_pinup_entry(
      v_event, 'ZZ Consent On', 'zz-consent-on@example.com', '(910) 555-0502',
      null, null, null, 25, true) r
    join public.pinup_entries e on e.id = r.id;

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
end $$;

-- ── G. the replaced function still behaves  (NOTICE pane)
--    want: two PASS notices. 052 rewrites register_pinup_entry() wholesale, so
--    the capacity branch and the returned shape are re-asserted here rather
--    than trusted from verify_051 - that file tested a DIFFERENT definition.
do $$
declare v_event uuid; r1 record; r2 record;
begin
  select id into v_event from public.events where is_active order by start_date limit 1;
  delete from public.pinup_entries where email like 'zz-cap52-%@example.com';

  select * into r1 from public.register_pinup_entry(
    v_event, 'ZZ Cap52 One', 'zz-cap52-1@example.com', '(910) 555-0601',
    null, null, null, 1) as t;
  if r1.status <> 'confirmed' or r1.queue_position <> 1 then
    raise exception 'FAIL: first entry was % at position %', r1.status, r1.queue_position;
  end if;
  raise notice 'PASS: first entry confirmed at queue_position 1';

  select * into r2 from public.register_pinup_entry(
    v_event, 'ZZ Cap52 Two', 'zz-cap52-2@example.com', '(910) 555-0602',
    null, null, null, 1) as t;
  if r2.status <> 'waitlist' or r2.queue_position <> 2 then
    raise exception 'FAIL: second entry was % at position %', r2.status, r2.queue_position;
  end if;
  raise notice 'PASS: entry past capacity waitlisted at queue_position 2';

  delete from public.pinup_entries where email like 'zz-cap52-%@example.com';
  delete from public.pinup_entries where email like 'zz-consent-%@example.com';
end $$;

-- ── Z. residue check - run LAST
--    want: 0 rows.
select id, full_name, email, status
  from public.pinup_entries
 where email like 'zz-%@example.com' or full_name like 'ZZ %';
