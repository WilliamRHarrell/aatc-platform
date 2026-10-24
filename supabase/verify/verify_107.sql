-- ============================================================
-- HOW TO RUN: after 104, 105, 106 AND 107 are applied, paste the whole file
-- in a fresh session. Read the MESSAGES pane. A failure RAISES and aborts
-- (the failing block rolls back). Nothing here writes storage tables
-- (rules.md).
--
-- Needs an admin profile. Blocks B and C each use their own INACTIVE event
-- "ZZ VERIFY 107 (DELETE ME)" with a PAST start_date (2001) and delete it.
-- Nothing on the live event is written.
--
-- Supersedes verify_105 A's ten-column view list (the view now ends with
-- photo_focus, appended by design).
-- ============================================================

-- ── A. view shape, grants, column, function, constraint  (NOTICE pane)
do $$
declare v_cols text; v_null text; v_def text;
begin
  if to_regclass('public.wall_of_honor_public') is null then raise exception 'FAIL A: wall_of_honor_public missing'; end if;
  -- A1. The pinned list, in order (rules.md "replacing a view"): 105's ten, then photo_focus.
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_public';
  if v_cols is distinct from 'id,honoree_name,honoree_rank,branch,unit,service_years,tribute,photo_paths,published_at,event_year,photo_focus' then
    raise exception 'FAIL A1: wall_of_honor_public columns are %', v_cols;
  end if;
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_public'
       and column_name = 'photo_focus') is distinct from 'jsonb' then
    raise exception 'FAIL A1: the view''s photo_focus is not jsonb';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.wall_of_honor_public'::regclass
                  and reloptions @> array['security_barrier=true'] and not (reloptions @> array['security_invoker=true'])) then
    raise exception 'FAIL A1: wall_of_honor_public options are %', (select reloptions from pg_class where oid = 'public.wall_of_honor_public'::regclass);
  end if;
  -- A2. grants
  if not has_table_privilege('anon', 'public.wall_of_honor_public', 'select') then raise exception 'FAIL A2: anon cannot read wall_of_honor_public'; end if;
  if not has_table_privilege('authenticated', 'public.wall_of_honor_public', 'select') then raise exception 'FAIL A2: authenticated cannot read wall_of_honor_public'; end if;
  if has_table_privilege('anon', 'public.wall_of_honor_entries', 'select') then raise exception 'FAIL A2: anon can read wall_of_honor_entries'; end if;
  if has_function_privilege('anon', 'public.wall_of_honor_guard()', 'execute') then raise exception 'FAIL A2: anon can execute wall_of_honor_guard'; end if;
  if has_function_privilege('authenticated', 'public.wall_of_honor_guard()', 'execute') then raise exception 'FAIL A2: authenticated can execute wall_of_honor_guard'; end if;
  -- A3. the column
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_entries'
                  and column_name = 'photo_focus' and data_type = 'jsonb' and is_nullable = 'NO' and column_default = '''{}''::jsonb') then
    raise exception 'FAIL A3: photo_focus missing or not jsonb NOT NULL default ''{}''';
  end if;
  -- A4. the function: immutable, anon cannot execute it, authenticated can (a CHECK runs it as the writer)
  if to_regprocedure('public.woh_photo_focus_valid(jsonb)') is null then raise exception 'FAIL A4: woh_photo_focus_valid(jsonb) missing'; end if;
  if (select provolatile from pg_proc where oid = 'public.woh_photo_focus_valid(jsonb)'::regprocedure) <> 'i' then
    raise exception 'FAIL A4: woh_photo_focus_valid is not immutable';
  end if;
  if has_function_privilege('anon', 'public.woh_photo_focus_valid(jsonb)', 'execute') then raise exception 'FAIL A4: anon can execute woh_photo_focus_valid'; end if;
  if not has_function_privilege('authenticated', 'public.woh_photo_focus_valid(jsonb)', 'execute') then raise exception 'FAIL A4: authenticated cannot execute woh_photo_focus_valid'; end if;
  -- A5. the constraint, as Postgres stores it
  v_def := (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.wall_of_honor_entries'::regclass
              and c.conname = 'wall_of_honor_entries_photo_focus_valid' and c.contype = 'c');
  -- pg_get_constraintdef drops "public." when public is on the search_path (it is in the SQL editor).
  if v_def is null or v_def !~ '^CHECK \((public\.)?woh_photo_focus_valid\(photo_focus\)\)$' then
    raise exception 'FAIL A5: wall_of_honor_entries_photo_focus_valid is %', coalesce(v_def, '(missing)');
  end if;
  -- A6. no other column's nullability changed (the replay of 001-106, plus photo_focus NO)
  select string_agg(column_name || ':' || is_nullable, ',' order by column_name) into v_null
    from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_entries';
  if v_null is distinct from
     'admin_notes:YES,branch:NO,consent_at:NO,consent_social:NO,decided_at:YES,decided_by:YES,event_id:NO,honoree_name:NO,'
     'honoree_rank:YES,id:NO,imported_at:YES,include_in_print:NO,is_published:NO,photo_focus:NO,photo_paths:NO,'
     'public_photo_paths:NO,published_at:YES,published_email_sent_at:YES,service_years:YES,status:NO,submitted_at:NO,'
     'submitter_email:NO,submitter_name:NO,submitter_phone:YES,submitter_relationship:NO,tribute:NO,tribute_display:YES,unit:YES' then
    raise exception 'FAIL A6: wall_of_honor_entries columns / nullability are %', v_null;
  end if;
  raise notice 'PASS A: view has exactly the eleven pinned columns ending photo_focus (jsonb), security barrier, grants intact, anon has no table access, photo_focus jsonb NOT NULL default {}, woh_photo_focus_valid immutable (authenticated only) and its CHECK exist, no nullability changed';
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures on an inactive ZZ event, year 2001)
do $$
declare v_admin uuid; v_nonadmin uuid := gen_random_uuid(); v_event uuid; v_pub uuid := gen_random_uuid();
        v_bad jsonb; v_caught boolean; v_con text; r record;
        v_good jsonb := jsonb_build_object(v_pub::text || '/photo-0-x.jpg', jsonb_build_object('x', 40, 'y', 20));
begin
  v_admin := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  if v_admin is null then raise exception 'ABORT: no admin profile'; end if;
  if exists (select 1 from public.profiles where id = v_nonadmin) then raise exception 'ABORT: random uuid collided with a profile'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 107 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2001-03-01', date '2001-03-02', false) returning id into v_event;

  insert into public.wall_of_honor_entries (id, event_id, status, public_photo_paths, honoree_name, branch, tribute,
                                            submitter_name, submitter_relationship, submitter_email)
  values (v_pub, v_event, 'approved', array[v_pub::text || '/photo-0-x.jpg'], 'ZZ VERIFY 107 Honoree (DELETE ME)', 'ZZ Branch', 'ZZ tribute',
          'ZZ Submitter', 'ZZ Relation', 'zz-107-a@example.com');

  -- B1. the default
  if (select photo_focus from public.wall_of_honor_entries where id = v_pub) is distinct from '{}'::jsonb then
    raise exception 'FAIL B1: a new row''s photo_focus is not {}';
  end if;
  raise notice 'PASS B1: a new row defaults photo_focus to {}';

  -- B2. each invalid shape is a check_violation on the photo_focus CHECK (not a cast error, not accepted)
  foreach v_bad in array array[
    '{"p": {"x": 150, "y": 10}}'::jsonb,   -- out of range
    '{"p": {"x": "a", "y": 10}}'::jsonb,   -- non-numeric
    '{"p": 5}'::jsonb,                     -- value not an object
    '{"p": {"x": 1}}'::jsonb               -- y missing
  ] loop
    v_caught := false; v_con := null;
    begin
      update public.wall_of_honor_entries set photo_focus = v_bad where id = v_pub;
    exception when check_violation then
      v_caught := true;
      get stacked diagnostics v_con = constraint_name;
    end;
    if not v_caught then raise exception 'FAIL B2: photo_focus % was accepted', v_bad; end if;
    if v_con is distinct from 'wall_of_honor_entries_photo_focus_valid' then
      raise exception 'FAIL B2: photo_focus % raised check_violation on %, expected wall_of_honor_entries_photo_focus_valid', v_bad, v_con;
    end if;
  end loop;
  raise notice 'PASS B2: out-of-range, non-numeric, non-object and missing-y values each fail the photo_focus CHECK';

  -- B3. valid shapes land: {} and a path-keyed point
  update public.wall_of_honor_entries set photo_focus = '{}' where id = v_pub;
  update public.wall_of_honor_entries set photo_focus = '{"a/photo-0.jpg": {"x": 40, "y": 20}}' where id = v_pub;
  if (select photo_focus from public.wall_of_honor_entries where id = v_pub) is distinct from '{"a/photo-0.jpg": {"x": 40, "y": 20}}'::jsonb then
    raise exception 'FAIL B3: a valid photo_focus did not land';
  end if;
  update public.wall_of_honor_entries set photo_focus = '{}' where id = v_pub;
  if (select photo_focus from public.wall_of_honor_entries where id = v_pub) is distinct from '{}'::jsonb then
    raise exception 'FAIL B3: photo_focus {} did not land';
  end if;
  raise notice 'PASS B3: {} and {"a/photo-0.jpg": {"x": 40, "y": 20}} are accepted';

  -- B4. publish, then edit photo_focus while published (no publish CHECK interference)
  update public.wall_of_honor_entries set is_published = true where id = v_pub;
  if not (select is_published from public.wall_of_honor_entries where id = v_pub) then raise exception 'FAIL B4: setup could not publish the fixture'; end if;
  update public.wall_of_honor_entries set photo_focus = v_good where id = v_pub;
  if (select photo_focus from public.wall_of_honor_entries where id = v_pub) is distinct from v_good then
    raise exception 'FAIL B4: photo_focus could not be edited on a published row';
  end if;
  raise notice 'PASS B4: photo_focus is editable while published';

  -- B5. the guard: a signed-in admin's change lands; a non-admin identity's is reverted.
  -- B5a. signed-in admin (104 B3 / 105 B5a harness; also proves authenticated can EXECUTE the CHECK function)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update public.wall_of_honor_entries set photo_focus = '{"a/photo-0.jpg": {"x": 0, "y": 100}}' where id = v_pub;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select photo_focus from public.wall_of_honor_entries where id = v_pub) is distinct from '{"a/photo-0.jpg": {"x": 0, "y": 100}}'::jsonb then
    raise exception 'FAIL B5a: the admin''s photo_focus update did not land (%)', (select photo_focus from public.wall_of_honor_entries where id = v_pub);
  end if;
  -- B5c. the guard itself (105 B5c pattern): the table owner bypasses RLS, so
  -- with a non-admin identity in the claims the UPDATE reaches the row (the
  -- honoree_rank control proves it) and only wall_of_honor_guard can revert photo_focus.
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role', 'authenticated')::text, true);
  update public.wall_of_honor_entries set photo_focus = v_good, honoree_rank = 'ZZ Rank B5c' where id = v_pub;
  perform set_config('request.jwt.claims', '', true);
  select photo_focus, honoree_rank into r from public.wall_of_honor_entries where id = v_pub;
  if r.honoree_rank is distinct from 'ZZ Rank B5c' then raise exception 'FAIL B5c: the control update did not reach the row'; end if;
  if r.photo_focus is distinct from '{"a/photo-0.jpg": {"x": 0, "y": 100}}'::jsonb then
    raise exception 'FAIL B5c: the guard let a non-admin identity change photo_focus (%)', row_to_json(r);
  end if;
  raise notice 'PASS B5: an admin sets photo_focus; the guard reverts a non-admin identity''s change';

  delete from public.wall_of_honor_entries where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 107 (DELETE ME)')
     or exists (select 1 from public.wall_of_honor_entries where submitter_email ilike 'zz-107-%@example.com') then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;

-- ── C. the public view, as anon  (NOTICE pane)
do $$
declare v_event uuid; v_id uuid := gen_random_uuid(); n int; v_focus jsonb; v_expect jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  v_expect := jsonb_build_object(v_id::text || '/photo-0-x.jpg', jsonb_build_object('x', 40, 'y', 20));
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 107 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2001-03-01', date '2001-03-02', false) returning id into v_event;
  insert into public.wall_of_honor_entries (id, event_id, status, honoree_name, branch, tribute, public_photo_paths, photo_focus,
                                            submitter_name, submitter_relationship, submitter_email)
  values (v_id, v_event, 'approved', 'ZZ VERIFY 107 Honoree (DELETE ME)', 'ZZ Branch', 'ZZ tribute', array[v_id::text || '/photo-0-x.jpg'], v_expect,
          'ZZ Submitter', 'ZZ Relation', 'zz-107-c@example.com');
  update public.wall_of_honor_entries set is_published = true where id = v_id;

  set local role anon;
  n := (select count(*) from public.wall_of_honor_public where id = v_id);
  v_focus := (select photo_focus from public.wall_of_honor_public where id = v_id);
  reset role;
  if n <> 1 then raise exception 'FAIL C1: anon sees % rows for the published fixture, expected 1', n; end if;
  if v_focus is distinct from v_expect then raise exception 'FAIL C1: anon read photo_focus %, expected %', v_focus, v_expect; end if;
  raise notice 'PASS C1: anon reads the published entry''s photo_focus through the view';

  delete from public.wall_of_honor_entries where id = v_id;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 107 (DELETE ME)')
     or exists (select 1 from public.wall_of_honor_entries where submitter_email ilike 'zz-107-%@example.com') then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS C: fixtures removed';
end $$;
