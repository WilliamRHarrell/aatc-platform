-- ============================================================
-- HOW TO RUN: after 084b is applied, paste the whole file, then re-run
-- verify_084.sql (which must now pass block A). Read-only.
-- ============================================================

do $$
declare missing text;
begin
  if not exists (select 1 from public.sponsor_tier_settings where tier = 'bronze' and show_price = false) then
    raise exception 'FAIL: no hidden bronze row - 084b is not applied';
  end if;
  -- Derived from the enum, so a tier added later without a row fails here too.
  missing := (select string_agg(e.enumlabel, ', ' order by e.enumsortorder) from pg_enum e
               where e.enumtypid = 'public.sponsor_tier'::regtype
                 and not exists (select 1 from public.sponsor_tier_settings s where s.tier::text = e.enumlabel));
  if missing is not null then raise exception 'FAIL: enum values with no row: %', missing; end if;
  if exists (select 1 from public.sponsorships where tier = 'bronze') then
    raise notice 'NOTE: a sponsorship now uses bronze - the app has no label or price for it';
  end if;
  raise notice 'PASS: bronze row present and hidden; every sponsor_tier value has a row';
end $$;
