-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
--
-- ⚠  WRITES fixtures and removes them. Block D owns teardown; Z only looks.
--
-- The point of this file is block C. Everything else confirms the table works;
-- C confirms it cannot LEAK, which is the property that actually matters.
-- ============================================================

-- ── A. shape and the index that does the work
--    want: uq_exclusivity_category_per_event, UNIQUE on (event_id, category).
select indexname, indexdef
  from pg_indexes
 where schemaname='public' and tablename='exclusivity_grants'
 order by indexname;

-- ── B. one buyer per category per event  (NOTICE pane)
--    want: three PASS notices. The control comes first: if the first insert
--    failed, the duplicate rejection below would pass while proving nothing.
do $$
declare v_event uuid; n int;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);
  delete from public.exclusivity_grants where buyer_name like 'ZZ %';

  insert into public.exclusivity_grants (event_id, category, buyer_name)
  values (v_event, 'tattoo_battle', 'ZZ First Buyer');
  raise notice 'PASS: an exclusive can be granted (control)';

  begin
    insert into public.exclusivity_grants (event_id, category, buyer_name)
    values (v_event, 'tattoo_battle', 'ZZ Second Buyer');
    raise exception 'FAIL: the same exclusive was sold twice';
  exception
    when unique_violation then raise notice 'PASS: selling the same exclusive twice is refused by the index';
  end;

  -- A different category to the same event is fine; the constraint is per
  -- category, not per event.
  insert into public.exclusivity_grants (event_id, category, buyer_name)
  values (v_event, 'on_site_supplier', 'ZZ Other Buyer');
  n := (select count(*) from public.exclusivity_grants where buyer_name like 'ZZ %');
  if n <> 2 then raise exception 'FAIL: expected 2 grants, found %', n; end if;
  raise notice 'PASS: a different category is unaffected';
end $$;

-- ── C. IT CANNOT REACH A PUBLIC READ  (NOTICE pane)
--    want: four PASS notices.
--    Verified rather than assumed, because the reason it is safe is structural
--    and structural claims are exactly the ones that get asserted without being
--    checked. sponsors_public publishes every column of every confirmed
--    sponsorship, which is what a column on that table would have inherited.
do $$
declare n int; v_leak int; declare_denied boolean;
begin
  -- CONTROL: rows exist and are visible as postgres. Without this the anon
  -- checks below pass against an empty table and prove nothing.
  n := (select count(*) from public.exclusivity_grants where buyer_name like 'ZZ %');
  if n = 0 then raise exception 'FAIL: no rows to hide - block C would be vacuous'; end if;
  raise notice 'PASS: % grant(s) exist and are readable as postgres (control)', n;

  -- ⚠  IF THIS BLOCK ERRORS, POSTGRES WILL HINT:
  --       GRANT SELECT ON public.exclusivity_grants TO anon;
  --    DO NOT RUN THAT. It would 'fix' the error by handing anon the table and
  --    defeating the entire purpose of this migration - negotiated contractual
  --    terms would become readable with the public key. The hint appears every
  --    time this block runs and it is the exact wrong action.
  --
  --    TWO REFUSAL MODES ARE BOTH CORRECT and this accepts either:
  --      42501 insufficient_privilege - no table grant at all (today's state)
  --      zero rows                    - a grant exists and RLS filters it out
  --
  --    The assertion is that anon CANNOT SEE THE ROWS, not that a particular
  --    error fires. Asserting the error would fail this test if someone later
  --    added a harmless grant while leaving RLS correct - a pass that should
  --    still be a pass. Caught by NAME, never `when others`, which would
  --    swallow an unrelated failure and print PASS.
  declare_denied := false;
  begin
    set local role anon;
    n := (select count(*) from public.exclusivity_grants);
    reset role;
  exception
    when insufficient_privilege then
      declare_denied := true;
      n := 0;
  end;
  reset role;

  if not declare_denied and n <> 0 then
    raise exception 'FAIL: anon read % exclusivity row(s) - a negotiated term is readable with the public key', n;
  end if;
  raise notice 'PASS: anon cannot see exclusivity_grants (%)',
    case when declare_denied then 'no table grant, 42501' else 'grant exists, RLS filtered to 0 rows' end;

  -- No view anywhere selects from it. This is the check that would have caught
  -- an is_exclusive column on sponsorships being swept into sponsors_public.
  v_leak := (
    select count(*) from pg_views
     where schemaname = 'public'
       and definition ilike '%exclusivity_grants%'
  );
  if v_leak <> 0 then
    raise exception 'FAIL: % view(s) reference exclusivity_grants - a view is how this reaches anon', v_leak;
  end if;
  raise notice 'PASS: no view references the table';

  -- And confirm the thing it was kept OUT of really is as permissive as
  -- claimed: sponsors_public selects from sponsorships with no column filter,
  -- so anything added there is published.
  if not exists (
    select 1 from pg_views
     where schemaname='public' and viewname='sponsors_public'
       and definition ilike '%from sponsorships%'
  ) then
    raise exception 'FAIL: sponsors_public is not shaped as expected - re-check the reasoning for keeping this separate';
  end if;
  raise notice 'PASS: sponsors_public confirmed to select from sponsorships, which is why this table is separate';
end $$;

-- ── D. the controlled list is enforced  (NOTICE pane)
--    want: PASS. An unknown category is a typo, not a new exclusive.
do $$
declare v_event uuid;
begin
  v_event := (select id from public.events where is_active order by start_date limit 1);
  begin
    insert into public.exclusivity_grants (event_id, category, buyer_name)
    values (v_event, 'vip_lounge_naming', 'ZZ Typo Buyer');
    raise exception 'FAIL: an uncontrolled category was accepted';
  exception
    when check_violation then raise notice 'PASS: an unknown category is refused - add it to the check constraint, see HANDOFF';
  end;

  delete from public.exclusivity_grants where buyer_name like 'ZZ %';
end $$;

-- ── Z. FIXTURE RESIDUE CHECK - run LAST
--
--    ⚠  THESE ARE NOT TABLE ROW COUNTS. Every number below counts only rows
--    this script created, matched on the zz- / ZZ prefix. A clean run is ALL
--    ZEROS. It says nothing about your real data - `contests` really does hold
--    49 categories while this reports 0.
--
--    A non-zero here means a block failed to clean up after itself, which is
--    information worth having rather than something to tidy away.
select 'exclusivity_grants matching ZZ %'       as fixtures_looked_for,
       count(*)                                    as fixtures_remaining
  from public.exclusivity_grants where buyer_name like 'ZZ %';
