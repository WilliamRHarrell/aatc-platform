-- ============================================================
-- HOW TO RUN: after 083 is applied, paste the whole file. Read the MESSAGES
-- pane and the grid. Read-only: no fixtures (the live RLS-harness rows are
-- the positive control).
-- ============================================================

-- ── A. the function excludes test rows, and its numbers match a direct count  (NOTICE pane)
do $$
declare v_event uuid; v_zz int; bad text;
begin
  v_event := (select id from public.events where is_active);
  if v_event is null then raise exception 'ABORT: no active event'; end if;
  if position('not ilike ''ZZ %''' in pg_get_functiondef('public.sponsor_tier_counts(uuid)'::regprocedure)) = 0 then
    raise exception 'FAIL A: sponsor_tier_counts does not exclude ''ZZ %%'' rows - 083 is not applied';
  end if;
  if not has_function_privilege('anon', 'public.sponsor_tier_counts(uuid)', 'execute') then
    raise exception 'FAIL A: anon lost EXECUTE on sponsor_tier_counts (the packages page needs it)';
  end if;

  -- Positive control: test rows exist, so the exclusion is actually being exercised.
  v_zz := (select count(*) from public.sponsorships where event_id = v_event and status in ('confirmed','pending') and sponsor_name ilike 'ZZ %');
  if v_zz = 0 then raise notice 'NOTE A: no ZZ rows on the active event right now - the exclusion is not exercised by this run'; end if;

  -- Every tier: function = direct count of real rows; no tier counts a ZZ row.
  bad := (select string_agg(coalesce(f.tier::text, d.tier::text) || ' fn=' || coalesce(f.taken, 0) || ' real=' || coalesce(d.taken, 0), ', ')
            from public.sponsor_tier_counts(v_event) f
            full join (select s.tier, count(*) as taken from public.sponsorships s
                        where s.event_id = v_event and s.status in ('confirmed','pending') and s.sponsor_name not ilike 'ZZ %'
                        group by s.tier) d on d.tier = f.tier
           where coalesce(f.taken, 0) <> coalesce(d.taken, 0));
  if bad is not null then raise exception 'FAIL A: function and direct count disagree: %', bad; end if;
  raise notice 'PASS A: exclusion present, anon can execute, counts match real rows (% ZZ row(s) excluded)', v_zz;
end $$;

-- ── B. per tier, what the packages page now sees vs. what it saw  (results grid)
select s.tier,
       count(*) filter (where s.sponsor_name not ilike 'ZZ %') as counted_now,
       count(*) as counted_before_083,
       string_agg(s.sponsor_name, ', ' order by s.sponsor_name) filter (where s.sponsor_name ilike 'ZZ %') as excluded_test_rows
  from public.sponsorships s
 where s.event_id = (select id from public.events where is_active) and s.status in ('confirmed','pending')
 group by s.tier order by s.tier;
