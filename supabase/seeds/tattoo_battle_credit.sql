-- ============================================================
-- DATA CHANGE: presentation credit on all three Tattoo Battle rows
--
-- Ryan confirmed 2026-08-31 that Whole Life Aftercare presents the Tattoo
-- Battle and the credit belongs on every row of it, not only the first.
--
-- Paste into the Supabase SQL editor. Not applied by anyone but Ryan.
-- These are schedule_items rows - data, not schema, so there is no migration.
--
-- Currently 1 of the 3 rows is credited. The Begins row has carried it since
-- migration 044; Ends and Champion Crowned have not. On /events/schedule that
-- reads as a sponsor presenting the start of an event and not its conclusion.
--
-- WORDING: the string stored here is the sponsor NAME only. The page renders
-- the "Presented by" prefix, exactly as the four code placements do via
-- TATTOO_BATTLE_PRESENTER in src/lib/event-config.ts. Storing "Presented by
-- Whole Life Aftercare" here would double the prefix on the schedule page and
-- would be the fifth wording of a credit that has one.
-- ============================================================

do $$
declare
  v_expected constant text := 'Whole Life Aftercare';
  v_before int;
  v_after  int;
begin
  select count(*) into v_before
    from public.schedule_items
   where title ilike '%Battle%' and presented_by_fallback is not null;

  if v_before <> 1 then
    raise exception
      'ABORT: expected exactly 1 Battle row already credited, found %. Someone has changed these rows since this was written - check before running.', v_before;
  end if;

  update public.schedule_items
     set presented_by_fallback = v_expected
   where title ilike '%Battle%'
     and presented_by_fallback is null;

  select count(*) into v_after
    from public.schedule_items
   where title ilike '%Battle%' and presented_by_fallback = v_expected;

  if v_after <> 3 then
    raise exception 'ABORT: expected 3 credited Battle rows after the update, found %.', v_after;
  end if;

  raise notice 'PASS: all 3 Tattoo Battle rows credited to %', v_expected;
end $$;

-- want: 3 rows, all 'Whole Life Aftercare'.
select day_date, start_time, title, presented_by_fallback
  from public.schedule_items
 where title ilike '%Battle%'
 order by day_date, start_time;

-- want: 0 rows. No credit anywhere should carry the prefix - the page adds it.
select id, title, presented_by_fallback
  from public.schedule_items
 where presented_by_fallback ilike 'presented by%';
