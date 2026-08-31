-- ============================================================
-- HOW TO RUN: paste the whole file and run it. Block by block is not required.
-- Read the MESSAGES / NOTICES pane. A failure RAISES and aborts, so a clean
-- finish IS a pass. The whole file is one transaction.
--
-- STYLE NOTE: variables are assigned with `v := (select ...)`, never
-- `select ... into v` - outside plpgsql that reads as CREATE TABLE AS and the
-- editor warns about a table that does not exist.
--
-- ⚠  WRITES fixture rows. Block D owns the teardown; block Z only LOOKS.
-- ============================================================

-- ── A. columns and constraint
--    want: likeness_release boolean NOT NULL default false,
--          likeness_release_at timestamptz NULL.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema='public' and table_name='pinup_entries'
   and column_name like 'likeness%'
 order by column_name;

-- ── B. exactly ONE register_pinup_entry, now with 10 arguments
--    want: 1 row. Two would make a named-argument call ambiguous at runtime.
select p.oid::regprocedure as signature, p.pronargs as arg_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='register_pinup_entry';

-- ── C. the anon insert policy now requires the release too
--    want: with_check mentioning likeness_release.
select policyname, with_check
  from pg_policies
 where schemaname='public' and tablename='pinup_entries' and cmd='INSERT';

-- ── D. behaviour: required to enter, stamped server-side  (NOTICE pane)
--    want: four PASS notices.
do $$
declare v_event uuid; v_id uuid; v_rel boolean; v_at timestamptz; n int;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);
  delete from public.pinup_entries where email like 'zz-likeness-%@example.com';

  -- 1. the function refuses an entry without the release
  begin
    perform public.register_pinup_entry(
      v_event, 'ZZ Likeness No', 'zz-likeness-no@example.com', '(910) 555-0701',
      null, null, null, 25, false, false);
    raise exception 'FAIL: an entry was accepted without the likeness release';
  exception
    when check_violation then raise notice 'PASS: entry without the release is refused';
  end;

  n := (select count(*) from public.pinup_entries where email = 'zz-likeness-no@example.com');
  if n <> 0 then raise exception 'FAIL: the refused entry was stored anyway'; end if;
  raise notice 'PASS: the refused entry was not stored';

  -- 2. with the release, it is accepted and stamped
  v_id := (select r.id from public.register_pinup_entry(
    v_event, 'ZZ Likeness Yes', 'zz-likeness-yes@example.com', '(910) 555-0702',
    null, null, null, 25, false, true) r);

  v_rel := (select likeness_release    from public.pinup_entries where id = v_id);
  v_at  := (select likeness_release_at from public.pinup_entries where id = v_id);

  if v_rel is not true then raise exception 'FAIL: release not recorded'; end if;
  if v_at is null then raise exception 'FAIL: release has no timestamp'; end if;
  if v_at < now() - interval '5 minutes' or v_at > now() + interval '5 minutes' then
    raise exception 'FAIL: timestamp % is not from the database clock', v_at;
  end if;
  raise notice 'PASS: release recorded with a server-side timestamp';

  -- 3. the constraint refuses a release with no timestamp
  begin
    update public.pinup_entries
       set likeness_release = true, likeness_release_at = null
     where id = v_id;
    raise exception 'FAIL: a release was stored with a null timestamp';
  exception
    when check_violation then raise notice 'PASS: release without a timestamp refused';
  end;

  -- D owns the fixture, so D removes it.
  delete from public.pinup_entries where email like 'zz-likeness-%@example.com';
end $$;

-- ── E. anon cannot post an entry that skips the release  (NOTICE pane)
--    Control first: a compliant anon insert must succeed, or the rejection
--    below would pass while proving nothing.
do $$
declare v_event uuid; n int;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);
  delete from public.pinup_entries where email like 'zz-likeness-%@example.com';

  set local role anon;
  insert into public.pinup_entries (event_id, full_name, email, phone, age_confirmed, likeness_release, likeness_release_at, status)
  values (v_event, 'ZZ Likeness Anon OK', 'zz-likeness-anonok@example.com', '(910) 555-0703', true, true, now(), 'pending');
  reset role;
  raise notice 'PASS: a compliant anon insert succeeds (control)';

  begin
    set local role anon;
    insert into public.pinup_entries (event_id, full_name, email, phone, age_confirmed, likeness_release, status)
    values (v_event, 'ZZ Likeness Anon Bad', 'zz-likeness-anonbad@example.com', '(910) 555-0704', true, false, 'pending');
    reset role;
    raise exception 'FAIL: anon inserted an entry without the release';
  exception
    when insufficient_privilege then raise notice 'PASS: anon cannot skip the release';
  end;
  reset role;

  delete from public.pinup_entries where email like 'zz-likeness-%@example.com';
end $$;

-- ── Z. residue check - run LAST. want: 1 row, count 0. No cleanup here.
select 'pinup_entries' as tbl, count(*)
  from public.pinup_entries where email like 'zz-likeness-%@example.com';
