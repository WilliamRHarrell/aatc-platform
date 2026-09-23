-- ============================================================
-- DATA CHANGE: 'Whole Life Aftercare' -> 'WholeLife Aftercare'
--
-- Ryan directed 2026-09-23 that the sponsor's name is spelled "WholeLife
-- Aftercare" (one word, capital L) everywhere. TATTOO_BATTLE_PRESENTER in
-- src/lib/event-config.ts already says so; these are the rows that must agree
-- with it.
--
-- KNOWN HOMES (updated here, each guarded):
--   sponsorships.sponsor_name            expected exactly 1 row
--   schedule_items.presented_by_fallback expected exactly 3 rows
--   presentation_credits.buyer_name      0 or more (the first run aborted on 1)
--   exclusivity_grants.buyer_name        0 or more
-- buyer_name is DISPLAY ONLY in code (admin/credits, placement-check finding
-- text, the 065 coalesce in the schedule view); nothing joins or looks up by
-- it, so renaming cannot break a lookup. Checked 2026-09-23.
--
-- EVERY OTHER HOME: block 2 scans every text, varchar and jsonb column of
-- every table in `public` for the old spelling (case-insensitive), BEFORE the
-- updates, and prints a NOTICE per hit. After the updates block 3 rescans;
-- any hit left outside the four known columns ABORTS the whole transaction
-- with the list, so nothing partial lands and the leftover homes get added
-- here before the next run. Audit/log tables that legitimately keep history
-- are listed in v_history and reported, not treated as failures.
--
-- Paste into the Supabase SQL editor. Not applied by anyone but Ryan.
-- ============================================================

do $$
declare
  v_old constant text := 'Whole Life Aftercare';
  v_new constant text := 'WholeLife Aftercare';
  -- Tables whose rows are history, not live copy. Reported, never updated,
  -- never a reason to abort.
  v_history constant text[] := array['profile_edits', 'aatc_log', 'placement_check_runs'];
  n_sp int; n_sched int; n_cred int; n_grant int; n int;
  r record; v_hits text := ''; v_left text := '';
begin
  -- ── 1. guards on the known homes ────────────────────────
  n_sp    := (select count(*) from public.sponsorships         where sponsor_name = v_old);
  n_sched := (select count(*) from public.schedule_items       where presented_by_fallback = v_old);
  n_cred  := (select count(*) from public.presentation_credits where buyer_name = v_old);
  n_grant := (select count(*) from public.exclusivity_grants   where buyer_name = v_old);
  if n_sp <> 1 then
    raise exception 'ABORT: expected exactly 1 sponsorship named %, found %.', v_old, n_sp;
  end if;
  if n_sched <> 3 then
    raise exception 'ABORT: expected exactly 3 schedule rows credited to %, found %.', v_old, n_sched;
  end if;
  raise notice 'before: sponsorships=% schedule_items=% presentation_credits=% exclusivity_grants=%', n_sp, n_sched, n_cred, n_grant;

  -- ── 2. scan EVERY text-bearing column in public for the old spelling ──
  for r in
    select c.table_name, c.column_name, c.data_type
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and t.table_type = 'BASE TABLE'
       and c.data_type in ('text', 'character varying', 'jsonb', 'json')
     order by c.table_name, c.column_name
  loop
    execute format('select count(*) from public.%I where %I::text ilike %L', r.table_name, r.column_name, '%whole life%') into n;
    if n > 0 then
      v_hits := v_hits || format(' %s.%s(%s)', r.table_name, r.column_name, n);
    end if;
  end loop;
  raise notice 'pre-scan hits (table.column(rows)):%', coalesce(nullif(v_hits, ''), ' none');

  -- ── 3. the updates ──────────────────────────────────────
  update public.sponsorships         set sponsor_name          = v_new where sponsor_name          = v_old;
  update public.schedule_items       set presented_by_fallback = v_new where presented_by_fallback = v_old;
  update public.presentation_credits set buyer_name            = v_new where buyer_name            = v_old;
  update public.exclusivity_grants   set buyer_name            = v_new where buyer_name            = v_old;

  if (select count(*) from public.sponsorships   where sponsor_name = v_new) <> 1
  or (select count(*) from public.schedule_items where presented_by_fallback = v_new) <> 3
  or (select count(*) from public.presentation_credits where buyer_name = v_old) <> 0
  or (select count(*) from public.exclusivity_grants   where buyer_name = v_old) <> 0 then
    raise exception 'ABORT: post-update counts are not what this seed expects - nothing has been committed.';
  end if;

  -- ── 4. rescan: anything left outside the known homes aborts ──
  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and t.table_type = 'BASE TABLE'
       and c.data_type in ('text', 'character varying', 'jsonb', 'json')
  loop
    execute format('select count(*) from public.%I where %I::text ilike %L', r.table_name, r.column_name, '%whole life%') into n;
    if n > 0 then
      if r.table_name = any(v_history) then
        raise notice 'history (left as-is): %.% has % row(s) with the old spelling', r.table_name, r.column_name, n;
      else
        v_left := v_left || format(' %s.%s(%s)', r.table_name, r.column_name, n);
      end if;
    end if;
  end loop;
  if v_left <> '' then
    raise exception 'ABORT: the old spelling remains in:% - add these columns to supabase/seeds/wholelife_spelling.sql and re-run. Nothing has been committed.', v_left;
  end if;

  raise notice 'PASS: % now reads % in sponsorships (1), schedule_items (3), presentation_credits (%), exclusivity_grants (%); no other live column carries the old spelling',
    v_old, v_new, n_cred, n_grant;
end $$;

-- want: 1 row, 'WholeLife Aftercare'
select id, sponsor_name, status from public.sponsorships where sponsor_name ilike '%life%aftercare%';
-- want: 3 rows, all 'WholeLife Aftercare'
select day_date, start_time, title, presented_by_fallback from public.schedule_items
 where title ilike '%Battle%' order by day_date, start_time;
-- want: 0 rows
select 'presentation_credits' as source, id::text, buyer_name from public.presentation_credits where buyer_name ilike '%whole life%'
union all
select 'exclusivity_grants', id::text, buyer_name from public.exclusivity_grants where buyer_name ilike '%whole life%';
