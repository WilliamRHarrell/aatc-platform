-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
--
-- ⚠  WRITES fixtures (a ZZ venue, ZZ schedule rows on 2027-04-14, a ZZ
-- pending sponsorship and a ZZ contest) and removes them in block F. Z only
-- looks. Run BEFORE or AFTER seeds/070_after_parties_data.sql; neither order
-- matters to these blocks.
-- ============================================================

-- ── A. policies  (results grid)
--    want: venues: "venues: public read" {anon,authenticated} SELECT and
--    "venues: editorial write" {authenticated} ALL. Nothing else on venues.
select tablename, policyname, cmd, roles::text
  from pg_policies
 where schemaname = 'public' and tablename = 'venues'
 order by policyname;

-- ── B. grants and columns  (NOTICE pane)
do $$
begin
  if not has_table_privilege('anon', 'public.venues', 'select') then raise exception 'FAIL: anon cannot read venues'; end if;
  if has_table_privilege('anon', 'public.venues', 'insert') then raise exception 'FAIL: anon holds INSERT on venues'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='schedule_items' and column_name='venue_id') then
    raise exception 'FAIL: schedule_items.venue_id missing'; end if;
  if (select is_nullable from information_schema.columns where table_schema='public' and table_name='schedule_items' and column_name='start_time') <> 'YES' then
    raise exception 'FAIL: schedule_items.start_time is still NOT NULL'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='contests' and column_name='sponsor_id') then
    raise exception 'FAIL: contests.sponsor_id missing'; end if;
  if not exists (select 1 from public.page_images where slug = 'after-party-sunday') then
    raise exception 'FAIL: page_images slot after-party-sunday missing'; end if;
  raise notice 'PASS: grants, venue_id, nullable start_time, contests.sponsor_id, sunday slot';
end $$;

-- ── C. a published row must have a time; an unpublished one may not  (NOTICE pane)
do $$
declare v_event uuid; v_venue uuid;
begin
  v_event := (select id from public.events where is_active limit 1);
  delete from public.schedule_items where title like 'ZZ %';
  delete from public.venues where slug like 'zz-%';

  insert into public.venues (event_id, name, slug) values (v_event, 'ZZ Venue', 'zz-venue') returning id into v_venue;

  -- control: an unpublished row with no time is allowed
  insert into public.schedule_items (event_id, day_date, start_time, title, kind, venue_id, is_published)
  values (v_event, date '2027-04-14', null, 'ZZ Draft Party', 'after_party', v_venue, false);
  raise notice 'PASS: control - unpublished row with no time inserted';

  begin
    update public.schedule_items set is_published = true where title = 'ZZ Draft Party';
    raise exception 'FAIL: a row with no time was published';
  exception
    when check_violation then raise notice 'PASS: publishing with no time is refused (check constraint)';
  end;
  begin
    insert into public.schedule_items (event_id, day_date, start_time, title, kind, is_published)
    values (v_event, date '2027-04-14', null, 'ZZ Published No Time', 'after_party', true);
    raise exception 'FAIL: a published row with no time was inserted';
  exception
    when check_violation then raise notice 'PASS: inserting published with no time is refused';
  end;
  begin
    insert into public.schedule_items (event_id, day_date, start_time, title, kind, is_published)
    values (v_event, date '2027-04-14', time '20:00', 'ZZ Bad Kind', 'rave', true);
    raise exception 'FAIL: an unknown kind was accepted';
  exception
    when check_violation then raise notice 'PASS: kind is still constrained (after_party added, rave refused)';
  end;
  update public.schedule_items set start_time = time '21:00', is_published = true where title = 'ZZ Draft Party';
  if (select count(*) from public.schedule_items_public where title = 'ZZ Draft Party') <> 1 then
    raise exception 'FAIL: a published after_party row with a time is not in the public view';
  end if;
  raise notice 'PASS: once timed and published the row appears in the public view with kind after_party';
end $$;

-- ── D. anon reads venues, cannot write  (NOTICE pane)
do $$
declare n int;
begin
  set local role anon;
  n := (select count(*) from public.venues where slug = 'zz-venue');
  if n <> 1 then raise exception 'FAIL: anon cannot read the fixture venue'; end if;
  begin
    update public.venues set blurb = 'hacked' where slug = 'zz-venue';
    raise exception 'FAIL: anon updated a venue';
  exception
    when insufficient_privilege then raise notice 'PASS: anon update on venues refused (42501)';
  end;
  reset role;
  raise notice 'PASS: anon reads venues';
end $$;

-- ── E. the view's column list, pinned  (NOTICE pane)
--    HANDOFF: row counts do not check SHAPE. 14 columns, venue_id last.
do $$
declare v_cols text;
begin
  v_cols := (select string_agg(column_name, ',' order by ordinal_position)
               from information_schema.columns
              where table_schema = 'public' and table_name = 'schedule_items_public');
  if v_cols <> 'id,event_id,day_date,start_time,sort_order,title,location,note,kind,presented_by,presented_by_website,presented_by_logo_url,presented_by_linked,venue_id' then
    raise exception 'FAIL: schedule_items_public columns are: %', v_cols;
  end if;
  raise notice 'PASS: schedule_items_public has the 13 prior columns in order plus venue_id';
end $$;

-- ── F. contest sponsor renders only when confirmed; teardown  (NOTICE pane)
do $$
declare v_event uuid; v_sp uuid; v_contest uuid; n int;
begin
  v_event := (select id from public.events where is_active limit 1);
  delete from public.contests where name like 'ZZ %';
  delete from public.sponsorships where sponsor_name like 'ZZ Verify070%';

  insert into public.sponsorships (event_id, sponsor_name, tier, amount, status)
  values (v_event, 'ZZ Verify070 Pending Sponsor', 'brass', 0, 'pending') returning id into v_sp;
  insert into public.contests (event_id, name, "order", sponsor_id)
  values (v_event, 'ZZ Sponsored Contest', 9999, v_sp) returning id into v_contest;

  n := (select count(*) from public.contests c join public.sponsors_public sp on sp.id = c.sponsor_id where c.id = v_contest);
  if n <> 0 then raise exception 'FAIL: a PENDING sponsor reached sponsors_public through contests.sponsor_id'; end if;
  raise notice 'PASS: an unconfirmed contest sponsor does not resolve through sponsors_public';

  update public.sponsorships set status = 'confirmed' where id = v_sp;
  n := (select count(*) from public.contests c join public.sponsors_public sp on sp.id = c.sponsor_id where c.id = v_contest);
  if n <> 1 then raise exception 'FAIL: a confirmed contest sponsor did not resolve'; end if;
  raise notice 'PASS: a confirmed contest sponsor resolves (control)';

  delete from public.contests where name like 'ZZ %';
  delete from public.sponsorships where sponsor_name like 'ZZ Verify070%';
  delete from public.schedule_items where title like 'ZZ %';
  delete from public.venues where slug like 'zz-%';
  raise notice 'PASS: fixtures removed';
end $$;

-- ── Z. FIXTURE RESIDUE CHECK - run LAST. A clean run is ALL ZEROS.
select 'venues zz-%' as fixtures_looked_for, count(*) as fixtures_remaining from public.venues where slug like 'zz-%'
union all
select 'schedule_items ZZ %', count(*) from public.schedule_items where title like 'ZZ %'
union all
select 'contests ZZ %', count(*) from public.contests where name like 'ZZ %'
union all
select 'sponsorships ZZ Verify070%', count(*) from public.sponsorships where sponsor_name like 'ZZ Verify070%';
