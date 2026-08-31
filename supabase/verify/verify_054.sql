-- ============================================================
-- HOW TO RUN: paste the whole file and run it. Block by block is not required.
--
-- Read the MESSAGES / NOTICES pane, not the results grid. A failure RAISES,
-- which aborts the run, so a clean finish IS a pass. The whole file is one
-- transaction, so an abort rolls back every test row with it.
--
-- STYLE NOTE: variables are assigned with `v := (select ...)`, never
-- `select ... into v`. Outside plpgsql that reads as CREATE TABLE AS and the
-- editor's pre-flight analyzer warns about a table that does not exist.
--
-- ⚠  CREATES two auth users and test rows, then removes them. Block Z checks.
-- ============================================================

-- ── A. every editorial table now names has_role, and none names is_admin
--    want: 6 rows, all qual mentioning has_role.
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and policyname like '%editorial write%'
 order by tablename;

-- ── B. WITH CHECK is stated, not inherited
--    want: with_check NOT NULL on all six. An omitted WITH CHECK falls back to
--    USING, which is correct but invisible - that fallback is why
--    contest_entries refuses anon inserts for a reason nobody wrote down.
select tablename, policyname,
       (with_check is not null) as with_check_explicit
  from pg_policies
 where schemaname = 'public' and policyname like '%editorial write%'
 order by tablename;

-- ── C. contest_entries was NOT widened
--    want: its write policy still requires admin, and does NOT mention
--    content_editor. These rows are competition records.
select policyname, cmd, qual
  from pg_policies
 where schemaname = 'public' and tablename = 'contest_entries'
 order by policyname;

-- ── D. a content_editor CAN write editorial content  (NOTICE pane)
--    The control for block E. If content_editor could not write at all, E's
--    rejections would pass while proving nothing.
do $$
declare v_uid uuid; v_event uuid; v_cid uuid; n int;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);

  insert into auth.users (id, email, instance_id, aud, role)
  values (gen_random_uuid(), 'zz-editor@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  returning id into v_uid;
  insert into public.profiles (id, role) values (v_uid, 'content_editor')
  on conflict (id) do update set role = 'content_editor';

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role','authenticated')::text, true);
  set local role authenticated;

  insert into public.contests (event_id, name, "order")
  values (v_event, 'ZZ Editor Contest', 9998) returning id into v_cid;
  reset role;

  n := (select count(*) from public.contests where id = v_cid);
  if n <> 1 then raise exception 'FAIL: content_editor could not create a contest'; end if;
  raise notice 'PASS: content_editor can write contests (control)';

  -- and update, which is the operation that used to fail silently
  set local role authenticated;
  update public.contests set name = 'ZZ Editor Contest v2' where id = v_cid;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'FAIL: content_editor update affected % rows', n; end if;
  raise notice 'PASS: content_editor update affected 1 row, not 0';
end $$;

-- ── E. a content_editor CANNOT touch money, identity or results  (NOTICE pane)
--    Each is asserted on the ROW COUNT, not on an exception. An UPDATE filtered
--    out by USING raises nothing at all - it succeeds against zero rows. That is
--    the whole reason this class of bug was invisible.
do $$
declare v_uid uuid; v_cid uuid; v_eid uuid; n int;
begin
  v_uid := (select id from auth.users where email = 'zz-editor@example.com');
  v_cid := (select id from public.contests where name like 'ZZ Editor Contest%');

  -- a real entry to attempt against, created as postgres
  insert into public.contest_entries (contest_id, collector_name)
  values (v_cid, 'ZZ Editor Entry') returning id into v_eid;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role','authenticated')::text, true);

  set local role authenticated;
  delete from public.contest_entries where id = v_eid;
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'FAIL: content_editor deleted a contest entry'; end if;
  raise notice 'PASS: content_editor cannot delete contest entries';

  n := (select count(*) from public.contest_entries where id = v_eid);
  if n <> 1 then raise exception 'FAIL: the entry is gone despite a 0 row count'; end if;
  raise notice 'PASS: the entry genuinely survived';

  set local role authenticated;
  update public.sponsorships set amount = 1 where sponsor_name like 'ZZ TEST%';
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'FAIL: content_editor updated % sponsorship row(s)', n; end if;
  raise notice 'PASS: content_editor cannot update sponsorships';

  delete from public.contest_entries where id = v_eid;
end $$;

-- ── Z. cleanup and residue - run LAST. want: 0 rows.
delete from public.contest_entries where collector_name like 'ZZ Editor%';
delete from public.contests where name like 'ZZ Editor%';
delete from public.profiles where id in (select id from auth.users where email = 'zz-editor@example.com');
delete from auth.users where email = 'zz-editor@example.com';

select 'contests' as tbl, count(*) from public.contests where name like 'ZZ Editor%'
union all select 'users', count(*) from auth.users where email = 'zz-editor@example.com';
