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

  -- Every NOT NULL column is supplied explicitly. profiles.email is NOT NULL
  -- (migration 001) and the fixture previously omitted it, relying on the
  -- on_auth_user_created trigger to have inserted the row first so that
  -- ON CONFLICT would take the update branch. It did not fire here, so the
  -- insert branch ran with a null email and aborted the whole file before a
  -- single assertion executed.
  --
  -- The fixture no longer depends on whether that trigger runs. If the trigger
  -- did create the row, ON CONFLICT updates it; if it did not, the insert
  -- carries everything the table requires. The conflict branch sets email too,
  -- so both paths converge on the same row rather than one of them leaving a
  -- half-populated one.
  --
  -- Nullable and deliberately left null: full_name, marketing_opt_in_at,
  -- marketing_opt_in_source. marketing_opt_in is NOT NULL but defaults to false.
  insert into auth.users (id, email, instance_id, aud, role)
  values (gen_random_uuid(), 'zz-editor@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  returning id into v_uid;

  insert into public.profiles (id, email, full_name, role)
  values (v_uid, 'zz-editor@example.com', 'ZZ Verify Editor', 'content_editor')
  on conflict (id) do update
    set role = 'content_editor',
        email = excluded.email,
        full_name = excluded.full_name;

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

  -- Control FIRST. This assertion targets the ZZ TEST harness sponsorships, and
  -- if they are absent the update affects zero rows and prints PASS while
  -- proving nothing - the same shape recorded four times in HANDOFF. The
  -- harness is also scheduled for removal at cutover, so this would have gone
  -- vacuous on its own, later, with nobody watching.
  n := (select count(*) from public.sponsorships where sponsor_name like 'ZZ TEST%');
  if n = 0 then
    raise exception 'FAIL: no sponsorship rows to attempt against - the check below would be vacuous. If the RLS harness has been removed at cutover, point this block at another sponsorship row.';
  end if;
  raise notice 'PASS: % sponsorship row(s) exist to attempt against (control)', n;

  set local role authenticated;
  update public.sponsorships set amount = 1 where sponsor_name like 'ZZ TEST%';
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'FAIL: content_editor updated % sponsorship row(s)', n; end if;
  raise notice 'PASS: content_editor cannot update sponsorships';

  delete from public.contest_entries where id = v_eid;

  -- E is the last block that needs the editor fixture, so E removes it. Per the
  -- rule in 6e78fed: cleanup belongs with the last USER, not with whichever
  -- block happens to run afterwards. Block Z is left as a pure residue check.
  -- profiles cascades from auth.users, but both are deleted explicitly so the
  -- teardown does not depend on the FK action staying as it is.
  delete from public.contests where name like 'ZZ Editor%';
  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;
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
select 'contests matching ZZ Editor%'          as fixtures_looked_for,
       count(*)                                    as fixtures_remaining
  from public.contests where name like 'ZZ Editor%'
union all select 'contest_entries matching ZZ Editor%', count(*)
  from public.contest_entries where collector_name like 'ZZ Editor%'
union all select 'profiles for zz-editor@example.com', count(*)
  from public.profiles where email = 'zz-editor@example.com'
union all select 'auth.users for zz-editor@example.com', count(*)
  from auth.users where email = 'zz-editor@example.com';
