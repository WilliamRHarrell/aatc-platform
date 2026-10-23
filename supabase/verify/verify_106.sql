-- ============================================================
-- HOW TO RUN: after 104, 105 AND 106 are applied, paste the whole file in a
-- fresh session. Read the MESSAGES pane. A failure RAISES and aborts (the
-- failing block rolls back). Nothing here writes storage tables (rules.md).
--
-- Block B uses its own INACTIVE event "ZZ VERIFY 106 (DELETE ME)" with a PAST
-- start_date (2001) and deletes it. Nothing on the live event is written and
-- no admin profile is needed (it runs as the SQL editor role, auth.uid()
-- null, so imported_at is set directly as the import does).
-- ============================================================

-- ── A. constraints and event rows  (NOTICE pane)
do $$
declare v_def text; r record; n int;
begin
  -- A1. the CHECKs, exactly as Postgres stores them
  for r in select * from (values
    ('wall_of_honor_entries_nonempty',
     'CHECK (((btrim(honoree_name) <> ''''::text) AND (btrim(tribute) <> ''''::text)))'),
    ('wall_of_honor_entries_branch_nonempty',
     'CHECK (((imported_at IS NOT NULL) OR (btrim(branch) <> ''''::text)))'),
    ('wall_of_honor_entries_submitter_name_nonempty',
     'CHECK (((imported_at IS NOT NULL) OR (btrim(submitter_name) <> ''''::text)))'),
    ('wall_of_honor_entries_submitter_relationship_nonempty',
     'CHECK (((imported_at IS NOT NULL) OR (btrim(submitter_relationship) <> ''''::text)))'),
    ('wall_of_honor_entries_submitter_email_nonempty',
     'CHECK (((imported_at IS NOT NULL) OR (btrim(submitter_email) <> ''''::text)))'),
    ('wall_of_honor_entries_publish_check',
     'CHECK (((NOT is_published) OR ((status = ''approved''::text) AND (cardinality(public_photo_paths) >= 1) AND (btrim(branch) <> ''''::text))))')
  ) as t(conname, def) loop
    v_def := (select pg_get_constraintdef(c.oid) from pg_constraint c
               where c.conrelid = 'public.wall_of_honor_entries'::regclass and c.conname = r.conname and c.contype = 'c');
    if v_def is distinct from r.def then
      raise exception 'FAIL A1: % is %, expected %', r.conname, coalesce(v_def, '(missing)'), r.def;
    end if;
  end loop;
  -- The untouched 104 CHECKs are still there (nothing dropped by accident).
  n := (select count(*) from pg_constraint where conrelid = 'public.wall_of_honor_entries'::regclass and contype = 'c'
          and conname in ('wall_of_honor_entries_status_check', 'wall_of_honor_entries_photos_max',
                          'wall_of_honor_entries_public_photos_max', 'wall_of_honor_entries_photo_paths_in_own_folder'));
  if n <> 4 then raise exception 'FAIL A1: % of the four untouched 104 CHECKs remain', n; end if;
  -- No column became nullable.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_entries'
              and column_name in ('honoree_name', 'tribute', 'branch', 'submitter_name', 'submitter_relationship', 'submitter_email')
              and is_nullable <> 'NO') then
    raise exception 'FAIL A1: a required wall_of_honor_entries column became nullable';
  end if;
  raise notice 'PASS A1: nonempty (honoree_name, tribute), four imported-or-nonempty CHECKs and the publish CHECK (with branch) are exact; the other 104 CHECKs remain; no column nullable';

  -- A2. the three past events, exactly, inactive
  for r in select * from (values
    ('AATC 2025 East', 'Crown Complex', 'Fayetteville', 'NC', date '2025-04-11', date '2025-04-13'),
    ('AATC 2025 West', 'Greater Tacoma Convention Center', 'Tacoma', 'WA', date '2025-09-12', date '2025-09-14'),
    ('AATC 2026 East', 'Crown Complex', 'Fayetteville', 'NC', date '2026-04-17', date '2026-04-19')
  ) as t(name, venue, city, state, start_date, end_date) loop
    n := (select count(*) from public.events e where e.name = r.name);
    if n <> 1 then raise exception 'FAIL A2: % event rows named %, expected 1', n, r.name; end if;
    if not exists (select 1 from public.events e
                    where e.name = r.name and e.venue = r.venue and e.city = r.city and e.state = r.state
                      and e.start_date = r.start_date and e.end_date = r.end_date
                      and e.is_active = false and e.registration_open_date is null) then
      raise exception 'FAIL A2: % is %', r.name, (select row_to_json(e) from public.events e where e.name = r.name);
    end if;
  end loop;
  raise notice 'PASS A2: AATC 2025 East, AATC 2025 West, AATC 2026 East exist once each, exact venue/city/state/dates, inactive, no registration_open_date';

  -- A3. the active event is still the 2027 one
  n := (select count(*) from public.events where is_active);
  if n <> 1 or (select name from public.events where is_active) is distinct from 'All American Tattoo Convention 2027' then
    raise exception 'FAIL A3: active event(s) are %', (select string_agg(name, ', ') from public.events where is_active);
  end if;
  raise notice 'PASS A3: the only active event is All American Tattoo Convention 2027';
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures on an inactive ZZ event, year 2001)
do $$
declare v_event uuid; v_imp uuid := gen_random_uuid(); v_con text; v_ok boolean; r record; n int;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 106 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2001-03-01', date '2001-03-02', false) returning id into v_event;

  -- B1. form path (imported_at null): each relaxed column empty is still refused,
  -- by that column's own CHECK (Review Focus 1).
  for r in select * from (values
    ('submitter_email',        'wall_of_honor_entries_submitter_email_nonempty'),
    ('submitter_name',         'wall_of_honor_entries_submitter_name_nonempty'),
    ('submitter_relationship', 'wall_of_honor_entries_submitter_relationship_nonempty'),
    ('branch',                 'wall_of_honor_entries_branch_nonempty')
  ) as t(col, conname) loop
    v_ok := false; v_con := null;
    begin
      insert into public.wall_of_honor_entries (event_id, honoree_name, branch, tribute,
                                                submitter_name, submitter_relationship, submitter_email)
      values (v_event, 'ZZ VERIFY 106 Form ' || r.col || ' (DELETE ME)',
              case when r.col = 'branch' then '' else 'ZZ Branch' end, 'ZZ tribute',
              case when r.col = 'submitter_name' then ' ' else 'ZZ Submitter' end,
              case when r.col = 'submitter_relationship' then '' else 'ZZ Relation' end,
              case when r.col = 'submitter_email' then '' else 'zz-106-b1@example.com' end);
    exception when check_violation then
      get stacked diagnostics v_con = constraint_name;
      v_ok := true;
    end;
    if not v_ok then raise exception 'FAIL B1: a form row (imported_at null) with empty % was accepted', r.col; end if;
    if v_con is distinct from r.conname then raise exception 'FAIL B1: empty % refused by %, expected %', r.col, v_con, r.conname; end if;
  end loop;
  -- control: the same form row with every field filled is accepted
  insert into public.wall_of_honor_entries (event_id, honoree_name, branch, tribute, submitter_name, submitter_relationship, submitter_email)
  values (v_event, 'ZZ VERIFY 106 Form control (DELETE ME)', 'ZZ Branch', 'ZZ tribute', 'ZZ Submitter', 'ZZ Relation', 'zz-106-b1@example.com');
  raise notice 'PASS B1: a form row with an empty submitter_email, submitter_name, submitter_relationship or branch is refused (check_violation, its own CHECK); a complete one is accepted';

  -- B2. honoree_name and tribute stay required even for an imported row
  for r in select * from (values ('honoree_name'), ('tribute')) as t(col) loop
    v_ok := false; v_con := null;
    begin
      insert into public.wall_of_honor_entries (event_id, imported_at, honoree_name, branch, tribute,
                                                submitter_name, submitter_relationship, submitter_email)
      values (v_event, now(), case when r.col = 'honoree_name' then ' ' else 'ZZ VERIFY 106 B2 (DELETE ME)' end, '',
              case when r.col = 'tribute' then '' else 'ZZ tribute' end, '', '', '');
    exception when check_violation then
      get stacked diagnostics v_con = constraint_name;
      v_ok := true;
    end;
    if not v_ok then raise exception 'FAIL B2: an imported row with empty % was accepted', r.col; end if;
    if v_con is distinct from 'wall_of_honor_entries_nonempty' then raise exception 'FAIL B2: empty % refused by %', r.col, v_con; end if;
  end loop;
  raise notice 'PASS B2: an imported row with an empty honoree_name or tribute is refused (wall_of_honor_entries_nonempty)';

  -- B3. an imported row with all four unknowns empty is accepted
  insert into public.wall_of_honor_entries (id, event_id, imported_at, status, honoree_name, branch, tribute,
                                            submitter_name, submitter_relationship, submitter_email)
  values (v_imp, v_event, now(), 'approved', 'ZZ VERIFY 106 Imported (DELETE ME)', '', 'ZZ tribute', '', '', '');
  if not exists (select 1 from public.wall_of_honor_entries where id = v_imp and imported_at is not null
                   and branch = '' and submitter_name = '' and submitter_relationship = '' and submitter_email = '') then
    raise exception 'FAIL B3: the imported row did not land as written';
  end if;
  raise notice 'PASS B3: an imported row with empty branch and submitter name, relationship and email is accepted';

  -- B4. publishing it (approved, a public photo) is refused while branch is empty
  v_ok := false; v_con := null;
  begin
    update public.wall_of_honor_entries
       set public_photo_paths = array[v_imp::text || '/photo-0-x.jpg'], is_published = true
     where id = v_imp;
  exception when check_violation then
    get stacked diagnostics v_con = constraint_name;
    v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B4: an imported row with an empty branch was published'; end if;
  if v_con is distinct from 'wall_of_honor_entries_publish_check' then raise exception 'FAIL B4: publish refused by %, expected the publish CHECK', v_con; end if;
  if (select is_published from public.wall_of_honor_entries where id = v_imp) then raise exception 'FAIL B4: the row is published'; end if;
  -- once Ryan fills the branch, the same publish succeeds
  update public.wall_of_honor_entries set branch = 'Army' where id = v_imp;
  update public.wall_of_honor_entries
     set public_photo_paths = array[v_imp::text || '/photo-0-x.jpg'], is_published = true
   where id = v_imp;
  if not (select is_published from public.wall_of_honor_entries where id = v_imp) then raise exception 'FAIL B4: publish after branch = Army did not land'; end if;
  raise notice 'PASS B4: publishing an imported row is refused while branch is empty (publish CHECK) and succeeds once branch = Army';

  -- C. 105 behaviour intact: the published imported row of an INACTIVE past event is public
  set local role anon;
  n := (select count(*) from public.wall_of_honor_public where id = v_imp);
  select * into r from public.wall_of_honor_public where id = v_imp;
  reset role;
  if n <> 1 then raise exception 'FAIL C: anon sees % rows for the published imported entry of an inactive event, expected 1', n; end if;
  if r.branch is distinct from 'Army' or r.event_year is distinct from 2001 then
    raise exception 'FAIL C: unexpected public row %', row_to_json(r);
  end if;
  raise notice 'PASS C: the published imported entry of an inactive 2001 event is in wall_of_honor_public for anon (branch Army, event_year 2001)';

  delete from public.wall_of_honor_entries where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 106 (DELETE ME)')
     or exists (select 1 from public.wall_of_honor_entries where honoree_name like 'ZZ VERIFY 106%') then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;
