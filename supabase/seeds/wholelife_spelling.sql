-- ============================================================
-- DATA CHANGE: 'Whole Life Aftercare' -> 'WholeLife Aftercare'
--
-- Ryan directed 2026-09-23 that the sponsor's name is spelled "WholeLife
-- Aftercare" (one word, capital L) everywhere. TATTOO_BATTLE_PRESENTER in
-- src/lib/event-config.ts already says so; these are the rows that must agree
-- with it: the sponsorships row and the three Battle schedule_items fallbacks.
--
-- Paste into the Supabase SQL editor. Not applied by anyone but Ryan.
-- Guarded: aborts unless the before-state is exactly what this was written
-- against (1 sponsorship, 3 schedule rows). A different count means someone
-- changed the rows since - check before running.
-- ============================================================

do $$
declare
  v_old constant text := 'Whole Life Aftercare';
  v_new constant text := 'WholeLife Aftercare';
  n_sp int; n_sched int;
begin
  n_sp    := (select count(*) from public.sponsorships   where sponsor_name = v_old);
  n_sched := (select count(*) from public.schedule_items where presented_by_fallback = v_old);
  if n_sp <> 1 then
    raise exception 'ABORT: expected exactly 1 sponsorship named %, found %.', v_old, n_sp;
  end if;
  if n_sched <> 3 then
    raise exception 'ABORT: expected exactly 3 schedule rows credited to %, found %.', v_old, n_sched;
  end if;

  update public.sponsorships   set sponsor_name = v_new          where sponsor_name = v_old;
  update public.schedule_items set presented_by_fallback = v_new where presented_by_fallback = v_old;

  n_sp    := (select count(*) from public.sponsorships   where sponsor_name = v_new);
  n_sched := (select count(*) from public.schedule_items where presented_by_fallback = v_new);
  if n_sp <> 1 or n_sched <> 3 then
    raise exception 'ABORT: after update expected 1 and 3, found % and %.', n_sp, n_sched;
  end if;
  if exists (select 1 from public.presentation_credits where buyer_name = v_old) then
    raise notice 'NOTE: presentation_credits also carries the old spelling - not touched here, report it.';
  end if;
  raise notice 'PASS: sponsorships and 3 schedule rows now read %', v_new;
end $$;

-- want: 1 row, 'WholeLife Aftercare'
select id, sponsor_name, status from public.sponsorships where sponsor_name ilike '%life%aftercare%';
-- want: 3 rows, all 'WholeLife Aftercare'
select day_date, start_time, title, presented_by_fallback from public.schedule_items
 where title ilike '%Battle%' order by day_date, start_time;
