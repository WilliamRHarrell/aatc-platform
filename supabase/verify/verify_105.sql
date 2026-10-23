-- ============================================================
-- HOW TO RUN: after 104 AND 105 are applied, paste the whole file in a fresh
-- session. Read the MESSAGES pane. A failure RAISES and aborts (the failing
-- block rolls back). Nothing here writes storage tables (rules.md).
--
-- Needs an admin profile. Blocks B and C each use their own INACTIVE event
-- "ZZ VERIFY 105 (DELETE ME)" with a PAST start_date (2001) and delete it.
-- Nothing on the live event is written.
--
-- Supersedes verify_104 C1 (an inactive event's entry is now public, by
-- design) and C4 (the column list is pinned here, with event_year).
-- ============================================================

-- ── A. view shape, grants, new columns  (NOTICE pane)
do $$
declare v_cols text;
begin
  if to_regclass('public.wall_of_honor_public') is null then raise exception 'FAIL A: wall_of_honor_public missing'; end if;
  -- The pinned list, in order (rules.md "replacing a view").
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_public';
  if v_cols is distinct from 'id,honoree_name,honoree_rank,branch,unit,service_years,tribute,photo_paths,published_at,event_year' then
    raise exception 'FAIL A: wall_of_honor_public columns are %', v_cols;
  end if;
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_public'
       and column_name = 'event_year') is distinct from 'integer' then
    raise exception 'FAIL A: event_year is not integer';
  end if;
  -- No submitter column (allow-list above already excludes it; named for the reader).
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_public' and column_name like 'submitter%') then
    raise exception 'FAIL A: wall_of_honor_public exposes a submitter column';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.wall_of_honor_public'::regclass
                  and reloptions @> array['security_barrier=true'] and not (reloptions @> array['security_invoker=true'])) then
    raise exception 'FAIL A: wall_of_honor_public options are %', (select reloptions from pg_class where oid = 'public.wall_of_honor_public'::regclass);
  end if;
  if not has_table_privilege('anon', 'public.wall_of_honor_public', 'select') then raise exception 'FAIL A: anon cannot read wall_of_honor_public'; end if;
  if not has_table_privilege('authenticated', 'public.wall_of_honor_public', 'select') then raise exception 'FAIL A: authenticated cannot read wall_of_honor_public'; end if;
  if has_table_privilege('anon', 'public.wall_of_honor_entries', 'select') then raise exception 'FAIL A: anon can read wall_of_honor_entries'; end if;
  if has_function_privilege('anon', 'public.wall_of_honor_guard()', 'execute') then raise exception 'FAIL A: anon can execute wall_of_honor_guard'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'wall_of_honor_entries'
       and column_name in ('imported_at', 'published_email_sent_at') and data_type = 'timestamp with time zone' and is_nullable = 'YES') <> 2 then
    raise exception 'FAIL A: imported_at / published_email_sent_at missing or not nullable timestamptz';
  end if;
  raise notice 'PASS A: view has exactly the ten pinned columns (event_year integer, no submitter), security barrier, anon/authenticated read it, anon has no table access, both new columns exist';
end $$;

-- ── B. behaviour  (NOTICE pane; fixtures on an inactive ZZ event, year 2001)
do $$
declare v_admin uuid; v_nonadmin uuid := gen_random_uuid(); v_event uuid; v_pub uuid := gen_random_uuid(); v_sib uuid;
        n int; v_year int; v_stamp timestamptz; r record;
begin
  v_admin := (select id from public.profiles where role::text = 'admin' order by created_at limit 1);
  if v_admin is null then raise exception 'ABORT: no admin profile'; end if;
  if exists (select 1 from public.profiles where id = v_nonadmin) then raise exception 'ABORT: random uuid collided with a profile'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 105 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2001-03-01', date '2001-03-02', false) returning id into v_event;

  insert into public.wall_of_honor_entries (id, event_id, status, public_photo_paths, honoree_name, branch, tribute,
                                            submitter_name, submitter_relationship, submitter_email)
  values (v_pub, v_event, 'approved', array[v_pub::text || '/photo-0-x.jpg'], 'ZZ VERIFY 105 Honoree (DELETE ME)', 'ZZ Branch', 'ZZ tribute',
          'ZZ Submitter', 'ZZ Relation', 'zz-105-a@example.com');
  insert into public.wall_of_honor_entries (event_id, honoree_name, branch, tribute, submitter_name, submitter_relationship, submitter_email)
  values (v_event, 'ZZ VERIFY 105 Sibling (DELETE ME)', 'ZZ Branch', 'ZZ tribute', 'ZZ Submitter', 'ZZ Relation', 'zz-105-b@example.com')
  returning id into v_sib;

  -- B1. publish (trusted update, no published_at supplied) on the INACTIVE event: in the view, with its year
  update public.wall_of_honor_entries set is_published = true where id = v_pub;
  n := (select count(*) from public.wall_of_honor_public where id = v_pub);
  if n <> 1 then raise exception 'FAIL B1: a published entry of an inactive (past) event is not in the view (% rows)', n; end if;
  v_year := (select event_year from public.wall_of_honor_public where id = v_pub);
  if v_year is distinct from 2001 or v_year is distinct from (select extract(year from start_date)::int from public.events where id = v_event) then
    raise exception 'FAIL B1: event_year is %, expected 2001', v_year;
  end if;
  raise notice 'PASS B1: a published entry of an inactive past event is public with event_year 2001';

  -- B2. the unpublished sibling stays out
  if exists (select 1 from public.wall_of_honor_public where id = v_sib) then raise exception 'FAIL B2: an unpublished entry is in the view'; end if;
  raise notice 'PASS B2: an unpublished sibling stays out of the view';

  -- B3. the publish supplied no published_at: stamped, recent
  v_stamp := (select published_at from public.wall_of_honor_entries where id = v_pub);
  if v_stamp is null or v_stamp < now() - interval '1 minute' then
    raise exception 'FAIL B3: published_at after the first publish is %', v_stamp;
  end if;
  -- also when the writer supplies NULL explicitly on a fresh publish (sibling: approve, photo, publish with published_at = null)
  update public.wall_of_honor_entries set status = 'approved', public_photo_paths = array[v_sib::text || '/photo-0-x.jpg'] where id = v_sib;
  update public.wall_of_honor_entries set is_published = true, published_at = null where id = v_sib;
  if (select published_at from public.wall_of_honor_entries where id = v_sib) is null then
    raise exception 'FAIL B3: a publish supplying published_at = null left it null';
  end if;
  update public.wall_of_honor_entries set is_published = false where id = v_sib;
  raise notice 'PASS B3: the first publish stamps published_at';

  -- B4. unpublish then republish keeps the first publish time. Inside one
  -- transaction now() is constant, so the stamp is first moved to a sentinel
  -- (an admin edit while published: no arm fires) or a re-stamp would be
  -- invisible. The unpublish also tries to clear it.
  update public.wall_of_honor_entries set published_at = timestamptz '2001-03-01 12:00+00' where id = v_pub;
  v_stamp := (select published_at from public.wall_of_honor_entries where id = v_pub);
  if v_stamp is distinct from timestamptz '2001-03-01 12:00+00' then raise exception 'FAIL B4: setup could not move published_at (%)', v_stamp; end if;
  update public.wall_of_honor_entries set is_published = false, published_at = null where id = v_pub;
  if (select published_at from public.wall_of_honor_entries where id = v_pub) is distinct from v_stamp then
    raise exception 'FAIL B4: unpublish changed published_at to %', (select published_at from public.wall_of_honor_entries where id = v_pub);
  end if;
  update public.wall_of_honor_entries set is_published = true where id = v_pub;
  if (select published_at from public.wall_of_honor_entries where id = v_pub) is distinct from v_stamp then
    raise exception 'FAIL B4: republish changed published_at to %', (select published_at from public.wall_of_honor_entries where id = v_pub);
  end if;
  raise notice 'PASS B4: unpublish keeps published_at and a republish does not re-stamp it';

  -- B5. imported_at / published_email_sent_at: admin may set them; a non-admin identity cannot.
  -- B5a. signed-in admin (104 B3 harness): lands
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update public.wall_of_honor_entries set imported_at = timestamptz '2001-01-01', published_email_sent_at = timestamptz '2001-01-02' where id = v_pub;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select imported_at, published_email_sent_at into r from public.wall_of_honor_entries where id = v_pub;
  if r.imported_at is distinct from timestamptz '2001-01-01' or r.published_email_sent_at is distinct from timestamptz '2001-01-02' then
    raise exception 'FAIL B5a: the admin update did not land (%)', row_to_json(r);
  end if;
  -- B5b. non-admin authenticated session: RLS hides the row, nothing changes
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role', 'authenticated')::text, true);
  update public.wall_of_honor_entries set imported_at = null, published_email_sent_at = null where id = v_pub;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select imported_at, published_email_sent_at into r from public.wall_of_honor_entries where id = v_pub;
  if r.imported_at is distinct from timestamptz '2001-01-01' or r.published_email_sent_at is distinct from timestamptz '2001-01-02' then
    raise exception 'FAIL B5b: a non-admin authenticated session changed the columns (%)', row_to_json(r);
  end if;
  -- B5c. the guard itself (the belt behind RLS): the table owner bypasses RLS,
  -- so with a non-admin identity in the claims the UPDATE reaches the row and
  -- only wall_of_honor_guard can revert it.
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role', 'authenticated')::text, true);
  update public.wall_of_honor_entries set imported_at = null, published_email_sent_at = null, honoree_rank = 'ZZ Rank B5c' where id = v_pub;
  perform set_config('request.jwt.claims', '', true);
  select imported_at, published_email_sent_at, honoree_rank into r from public.wall_of_honor_entries where id = v_pub;
  if r.honoree_rank is distinct from 'ZZ Rank B5c' then raise exception 'FAIL B5c: the control update did not reach the row'; end if;
  if r.imported_at is distinct from timestamptz '2001-01-01' or r.published_email_sent_at is distinct from timestamptz '2001-01-02' then
    raise exception 'FAIL B5c: the guard let a non-admin identity change imported_at / published_email_sent_at (%)', row_to_json(r);
  end if;
  raise notice 'PASS B5: an admin sets imported_at / published_email_sent_at; a non-admin identity cannot (RLS, and the guard behind it)';

  delete from public.wall_of_honor_entries where event_id = v_event;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 105 (DELETE ME)')
     or exists (select 1 from public.wall_of_honor_entries where submitter_email ilike 'zz-105-%@example.com') then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS B: fixtures removed';
end $$;

-- ── C. the public view, as anon  (NOTICE pane)
do $$
declare v_event uuid; v_id uuid := gen_random_uuid(); r record; n int; v_ok boolean; v_active_year int;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.events (name, venue, city, state, start_date, end_date, is_active)
  values ('ZZ VERIFY 105 (DELETE ME)', 'ZZ', 'ZZ', 'ZZ', date '2001-03-01', date '2001-03-02', false) returning id into v_event;
  v_active_year := (select extract(year from start_date)::int from public.events where is_active limit 1);
  if v_active_year = 2001 then raise exception 'ABORT C: the active event is in 2001; the fixture year would not be distinct'; end if;
  insert into public.wall_of_honor_entries (id, event_id, status, honoree_name, honoree_rank, branch, unit, service_years,
                                            tribute, tribute_display, public_photo_paths, submitter_name, submitter_relationship, submitter_email, submitter_phone)
  values (v_id, v_event, 'approved', 'ZZ VERIFY 105 Honoree (DELETE ME)', 'ZZ Rank', 'ZZ Branch', 'ZZ Unit', 'ZZ Years',
          'ZZ original tribute', 'ZZ display tribute', array[v_id::text || '/photo-0-x.jpg'], 'ZZ Submitter', 'ZZ Relation', 'zz-105-c@example.com', '000-000-0000');
  update public.wall_of_honor_entries set is_published = true where id = v_id;

  -- C1. anon sees the published row of an INACTIVE past event, with its year
  set local role anon;
  n := (select count(*) from public.wall_of_honor_public where id = v_id);
  select * into r from public.wall_of_honor_public where id = v_id;
  reset role;
  if n <> 1 then raise exception 'FAIL C1: anon sees % rows for a published entry of an inactive event, expected 1', n; end if;
  if r.event_year is distinct from 2001 or r.tribute is distinct from 'ZZ display tribute' or r.published_at is null
     or r.photo_paths is distinct from array[v_id::text || '/photo-0-x.jpg'] then
    raise exception 'FAIL C1: unexpected public row %', row_to_json(r);
  end if;
  if row_to_json(r)::text like '%zz-105-c@example.com%' or row_to_json(r)::text like '%ZZ Submitter%' or row_to_json(r)::text like '%000-000-0000%' then
    raise exception 'FAIL C1: submitter data is public';
  end if;
  raise notice 'PASS C1: anon sees the published entry of an inactive 2001 event (event_year 2001), no submitter data';

  -- C2. positive control: anon reading the table is permission denied, not an empty set
  v_ok := false;
  begin
    set local role anon;
    perform 1 from public.wall_of_honor_entries limit 1;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  if not v_ok then raise exception 'FAIL C2: anon read wall_of_honor_entries without a permission error'; end if;
  raise notice 'PASS C2: anon reading the table is permission denied';

  delete from public.wall_of_honor_entries where id = v_id;
  delete from public.events where id = v_event;
  if exists (select 1 from public.events where name = 'ZZ VERIFY 105 (DELETE ME)')
     or exists (select 1 from public.wall_of_honor_entries where submitter_email ilike 'zz-105-%@example.com') then
    raise exception 'FAIL: fixtures not removed';
  end if;
  raise notice 'PASS C: fixtures removed';
end $$;
