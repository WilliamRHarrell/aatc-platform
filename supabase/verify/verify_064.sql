-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass. Block Z is the only select, so it
-- is what the editor displays.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
--
-- WRITES a fixture and removes it. Block D owns its own teardown.
--
-- The point of this file is block C. A and B confirm the two rows were
-- repaired; C confirms the repair actually reaches the page, which is the
-- property that was broken. A null count would not have caught the defect:
-- the failure was a day matching no programme day, not merely a day absent.
-- ============================================================

-- ── A. the two rows carry the right day and start ───────────
do $$
declare
  v_bad int;
begin
  v_bad := (select count(*)
              from public.panels
             where title = 'Bookkeeping for Tattoo Industry Professionals'
               and (panel_day is distinct from date '2027-04-18'
                 or panel_start is distinct from time '13:30'));
  if v_bad <> 0 then
    raise exception 'A FAIL: Bookkeeping seminar is not 2027-04-18 13:30.';
  end if;

  v_bad := (select count(*)
              from public.panels
             where title = 'Tooth Gem Seminar'
               and (panel_day is distinct from date '2027-04-18'
                 or panel_start is distinct from time '15:00'));
  if v_bad <> 0 then
    raise exception 'A FAIL: Tooth Gem Seminar is not 2027-04-18 15:00.';
  end if;

  raise notice 'A PASS: both seminars carry the repaired day and start.';
end $$;


-- ── B. 2027-04-18 really is a Sunday ────────────────────────
-- The seed's day label said 'Sunday' and 047 dropped it. This checks the DATE
-- against the calendar rather than against the string it came from.
do $$
begin
  if (select to_char(panel_day, 'FMDay')
        from public.panels
       where title = 'Tooth Gem Seminar') <> 'Sunday' then
    raise exception 'B FAIL: the repaired panel_day is not a Sunday.';
  end if;
  raise notice 'B PASS: 2027-04-18 is a Sunday.';
end $$;


-- ── C. the repair reaches the rendered page ─────────────────
-- /events/schedule builds its day list from schedule_items and keeps only
-- panels whose panel_day is in it. Before 064 this matched 0 of 2.
--
-- C2 is the same check from the SOLD side, stated as a positive control so an
-- empty result is a FAILURE rather than a silent pass: a presentation credit
-- that lands on no rendered row is money owed and not shown.
do $$
declare
  v_matched  int;
  v_credited int;
begin
  v_matched := (select count(*)
                  from public.panels p
                 where p.is_published
                   and p.panel_day in (select distinct day_date from public.schedule_items));
  if v_matched <> 2 then
    raise exception
      'C FAIL: % of 2 published seminars land on a programme day. They are dropped from /events/schedule.', v_matched;
  end if;

  v_credited := (select count(*)
                   from public.panels p
                  where p.is_published
                    and p.presented_by_fallback is not null
                    and p.panel_day in (select distinct day_date from public.schedule_items));
  if v_credited <> 1 then
    raise exception
      'C2 FAIL: expected the Nomadica credit on exactly 1 rendered seminar, found %.', v_credited;
  end if;

  raise notice 'C PASS: both seminars land on a programme day, Nomadica credit among them.';
end $$;


-- ── D. the constraint bites, and only where it should ───────
-- Tests the BOUNDARY itself, not a point safely either side. The interesting
-- case is not "published with everything" or "unpublished with nothing" - it
-- is publishing with exactly ONE of the two columns set.
--
-- Each leg raises on the WRONG outcome, so a leg that silently does nothing
-- cannot read as a pass.
do $$
declare
  v_event_id uuid;
  v_id       uuid;
begin
  v_event_id := (select id from public.events where is_active);

  -- Leg 1, positive control: an unpublished draft with NEITHER column is
  -- accepted. Without this leg a constraint that rejected every row would pass
  -- legs 2 and 3 and look correct.
  insert into public.panels (event_id, title, is_published)
       values (v_event_id, 'verify_064 fixture', false)
    returning id into v_id;

  -- Leg 2: publishing with neither column is rejected.
  begin
    update public.panels set is_published = true where id = v_id;
    raise exception 'D FAIL leg 2: published a panel with no day and no start time.';
  exception
    when check_violation then null;
  end;

  -- Leg 3, THE BOUNDARY: day set, start still null. Rejected.
  begin
    update public.panels
       set panel_day = date '2027-04-18', is_published = true
     where id = v_id;
    raise exception 'D FAIL leg 3: published a panel with a day but no start time.';
  exception
    when check_violation then null;
  end;

  -- Leg 4: with both set, publishing succeeds. The constraint must not block
  -- the ordinary case it exists to protect.
  update public.panels
     set panel_day = date '2027-04-18', panel_start = time '16:00', is_published = true
   where id = v_id;

  if not exists (select 1 from public.panels where id = v_id and is_published) then
    raise exception 'D FAIL leg 4: a complete panel could not be published.';
  end if;

  -- Teardown belongs with the last leg that needs the fixture, and asserts
  -- rather than merely deleting.
  delete from public.panels where id = v_id;

  if exists (select 1 from public.panels where title = 'verify_064 fixture') then
    raise exception 'D FAIL: fixture survived cleanup.';
  end if;

  raise notice 'D PASS: all four legs, fixture removed.';
end $$;


-- ── E. nothing published is left without a slot ─────────────
-- The standing form of verify_046 line 49, which reported this defect and was
-- not acted on. Now it aborts instead of printing.
do $$
declare
  v_orphans int;
begin
  v_orphans := (select count(*)
                  from public.panels
                 where is_published
                   and (panel_day is null or panel_start is null));
  if v_orphans <> 0 then
    raise exception 'E FAIL: % published panel(s) have no day or no start time.', v_orphans;
  end if;
  raise notice 'E PASS: every published panel has a place in the programme.';
end $$;


-- ── Z. what the editor displays ─────────────────────────────
-- want: 2 rows, both 2027-04-18, at 13:30 and 15:00, both published,
-- Bookkeeping carrying the Nomadica credit.
select title, panel_day, panel_start, is_published, presented_by_fallback as credit
  from public.panels
 order by panel_start;
