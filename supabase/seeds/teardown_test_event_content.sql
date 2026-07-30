-- ============================================================
-- TEST CONTENT TEARDOWN — the March 2026 test data on the inactive event
--
-- Scope: 5 panels, 2 contests (+6 entries, +5 votes), the inactive event's 267
-- duplicate booths. Food trucks are in PART 2 and cannot be in this
-- transaction — see the note there.
--
-- The inactive event ROW ITSELF is left in place with is_active = false, as a
-- rollback anchor.
--
-- ── WHY THIS IS WORTH DOING ─────────────────────────────────
-- All 5 panels are is_published = true, with content including "TAX Shit",
-- panelist "Joe Momma", and a description reading "theskch kdhsfkjhasdf". The
-- only thing keeping that off the public site is every query filtering
-- correctly by active event — and the stranded-event episode established that
-- assumption is not safe. Likewise the duplicate 267 booths: harmless only
-- while no query counts booths without an event filter; an unfiltered count
-- reports 534 available.
--
-- ── PROTECTED, WITH AN ABORT ────────────────────────────────
--   sponsorship  32ef207d  Tattoo Goo ($3,000, confirmed)
--   invoice      d5f1c5f3  its invoice
--   invoice      ceafa9f6  Jazz N Soul    ($160)
--   invoice      dec6dda8  Tacos Snacks   ($160)
-- Nothing in PART 1 can reach any of them — no statement below touches
-- sponsorships or invoices at all — and the assertions confirm all four
-- survive. If any is missing the transaction rolls back.
--
-- ── FK BEHAVIOUR ────────────────────────────────────────────
--   contest_entries.contest_id  -> ON DELETE CASCADE
--   contest_votes.entry_id      -> ON DELETE CASCADE
--   panel_registrations.panel_id-> ON DELETE CASCADE   (0 rows)
-- Deleting contests therefore removes entries and votes on its own. They are
-- deleted explicitly first anyway so the counts are measured, not inferred.
--
-- RESTORE: these rows are test data and are NOT reconstructible from SQL — the
-- panel/contest text and the entry photos are not recorded anywhere else.
-- Restore is the 29 Jul 09:47 UTC daily snapshot. PITR is not enabled, so
-- granularity is daily. Snapshot-based restore is the only rollback for PART 1;
-- there is no in-band undo, which is why the inactive event row is retained.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- PART 1 — panels, contests, entries, votes, duplicate booths
-- ════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_inactive uuid;
  n_panels int; n_contests int; n_entries int; n_votes int; n_preg int;
  n_booths_in int; n_booths_act int; n_booths_all int;
  n_goo int; n_goo_inv int; n_ft_inv int;
begin
  select id into v_inactive from events where is_active = false and name = 'AATC Fayetteville 2027';
  if v_inactive is null then
    raise exception 'ABORT — inactive event "AATC Fayetteville 2027" not found. Wrong database, or it has been renamed/removed.';
  end if;

  select count(*) into n_panels     from panels    where event_id = v_inactive;
  select count(*) into n_contests   from contests  where event_id = v_inactive;
  select count(*) into n_entries    from contest_entries;
  select count(*) into n_votes      from contest_votes;
  select count(*) into n_preg       from panel_registrations;
  select count(*) into n_booths_in  from booths    where event_id = v_inactive;
  select count(*) into n_booths_act from booths    where event_id <> v_inactive;
  select count(*) into n_booths_all from booths;
  select count(*) into n_goo        from sponsorships where sponsor_name = 'Tattoo Goo';
  select count(*) into n_goo_inv    from invoices i join sponsorships s on s.id = i.sponsorship_id where s.sponsor_name = 'Tattoo Goo';
  select count(*) into n_ft_inv     from invoices where food_truck_id is not null;

  raise notice '';
  raise notice '════ BEFORE ════';
  raise notice '  inactive event id           : %', v_inactive;
  raise notice '  panels     (inactive event) : %', n_panels;
  raise notice '  contests   (inactive event) : %', n_contests;
  raise notice '  contest_entries (all)       : %', n_entries;
  raise notice '  contest_votes   (all)       : %', n_votes;
  raise notice '  panel_registrations (all)   : %', n_preg;
  raise notice '  booths on inactive event    : %', n_booths_in;
  raise notice '  booths on active event      : %', n_booths_act;
  raise notice '  booths TOTAL                : %', n_booths_all;
  raise notice '  -- protected --';
  raise notice '  Tattoo Goo sponsorship      : %', n_goo;
  raise notice '  Tattoo Goo invoice          : %', n_goo_inv;
  raise notice '  food-truck invoices         : %', n_ft_inv;

  if n_goo <> 1 or n_goo_inv <> 1 or n_ft_inv <> 2 then
    raise exception
      'ABORT — protected rows not as expected (Tattoo Goo=%, its invoice=%, food-truck invoices=%; wanted 1/1/2).',
      n_goo, n_goo_inv, n_ft_inv;
  end if;

  -- Any booth on the inactive event still holding an assignment would mean a
  -- real exhibitor is attached; refuse rather than orphan them.
  if exists (select 1 from booths where event_id = v_inactive and application_id is not null) then
    raise exception 'ABORT — inactive-event booths still have application assignments.';
  end if;
end $$;


-- 1. Votes, then entries, then contests (explicit, though cascade would do it).
delete from contest_votes
 where entry_id in (
   select e.id from contest_entries e
     join contests c on c.id = e.contest_id
    join events ev on ev.id = c.event_id
   where ev.is_active = false
 );

delete from contest_entries
 where contest_id in (
   select c.id from contests c join events ev on ev.id = c.event_id where ev.is_active = false
 );

delete from contests
 where event_id in (select id from events where is_active = false);

-- 2. Panels (panel_registrations cascade; 0 rows today).
delete from panel_registrations
 where panel_id in (
   select p.id from panels p join events ev on ev.id = p.event_id where ev.is_active = false
 );

delete from panels
 where event_id in (select id from events where is_active = false);

-- 3. The inactive event's duplicate 267 booths. booths.application_id is NULL
--    for all of them (asserted above), so nothing is orphaned.
delete from booths
 where event_id in (select id from events where is_active = false);


do $$
declare
  n_panels int; n_contests int; n_entries int; n_votes int;
  n_booths_all int; n_booths_act int;
  n_goo int; n_goo_inv int; n_ft_inv int; n_events int;
  problems text := '';
begin
  select count(*) into n_panels   from panels   p join events e on e.id = p.event_id where e.is_active = false;
  select count(*) into n_contests from contests c join events e on e.id = c.event_id where e.is_active = false;
  select count(*) into n_entries  from contest_entries;
  select count(*) into n_votes    from contest_votes;
  select count(*) into n_booths_all from booths;
  select count(*) into n_booths_act from booths b join events e on e.id = b.event_id where e.is_active = true;
  select count(*) into n_goo      from sponsorships where sponsor_name = 'Tattoo Goo';
  select count(*) into n_goo_inv  from invoices i join sponsorships s on s.id = i.sponsorship_id where s.sponsor_name = 'Tattoo Goo';
  select count(*) into n_ft_inv   from invoices where food_truck_id is not null;
  select count(*) into n_events   from events;

  raise notice '';
  raise notice '════ AFTER ════';
  raise notice '  panels on inactive event    : %  (want 0)', n_panels;
  raise notice '  contests on inactive event  : %  (want 0)', n_contests;
  raise notice '  contest_entries             : %  (want 0)', n_entries;
  raise notice '  contest_votes               : %  (want 0)', n_votes;
  raise notice '  booths TOTAL                : %  (want 267)', n_booths_all;
  raise notice '  booths on active event      : %  (want 267)', n_booths_act;
  raise notice '  events rows                 : %  (want 2 — inactive row retained)', n_events;
  raise notice '  -- protected --';
  raise notice '  Tattoo Goo sponsorship      : %  (want 1)', n_goo;
  raise notice '  Tattoo Goo invoice          : %  (want 1)', n_goo_inv;
  raise notice '  food-truck invoices         : %  (want 2)', n_ft_inv;

  if n_panels   <> 0   then problems := problems || ' panels remain;'; end if;
  if n_contests <> 0   then problems := problems || ' contests remain;'; end if;
  if n_entries  <> 0   then problems := problems || ' contest entries remain;'; end if;
  if n_votes    <> 0   then problems := problems || ' contest votes remain;'; end if;
  if n_booths_all <> 267 then problems := problems || ' booth total is not 267;'; end if;
  if n_booths_act <> 267 then problems := problems || ' active event does not have 267 booths;'; end if;
  if n_events   <> 2   then problems := problems || ' an events row was lost;'; end if;
  if n_goo      <> 1   then problems := problems || ' TATTOO GOO LOST;'; end if;
  if n_goo_inv  <> 1   then problems := problems || ' TATTOO GOO INVOICE LOST;'; end if;
  if n_ft_inv   <> 2   then problems := problems || ' FOOD-TRUCK INVOICES LOST;'; end if;

  if problems <> '' then
    raise exception 'PART 1 FAILED —%  Rolled back, nothing removed.', problems;
  end if;

  raise notice '';
  raise notice '  OK — test panels/contests/booths gone. Protected rows intact.';
  raise notice '  Food trucks NOT touched; see PART 2.';
  raise notice '';
end $$;

commit;


-- ════════════════════════════════════════════════════════════
-- PART 2 — food trucks. READ THIS BEFORE RUNNING.
--
-- You asked to delete the 2 test food trucks while EXCLUDING their invoices.
-- Those two requirements are mutually exclusive, so this is deliberately
-- separate and left commented out for you to decide.
--
--   invoices.food_truck_id references food_trucks(id) ON DELETE SET NULL
--
-- So deleting a food truck does not leave its invoice alone — it NULLs the
-- link. And once migration 033 is applied, that invoice then has zero parents
-- and violates invoices_exactly_one_parent, so the DELETE errors outright.
-- Before 033 it would instead succeed and leave two genuinely parentless
-- invoices — the exact state 033 exists to prevent.
--
-- Three options:
--   (a) Delete trucks AND their invoices. They are $160 test invoices against
--       test trucks with a 555 phone number; consistent with the rest of the
--       teardown. Uncomment below.
--   (b) Keep the food trucks. They are not published anywhere near as visibly
--       as the panels, so leaving them is defensible.
--   (c) Re-point the invoices to a real parent first — not applicable, there
--       is no real food truck to point them at.
--
-- Recommend (a).
-- ════════════════════════════════════════════════════════════
/*
begin;

do $$
declare n_ft int; n_ft_inv int;
begin
  select count(*) into n_ft from food_trucks;
  select count(*) into n_ft_inv from invoices where food_truck_id is not null;
  raise notice 'BEFORE — food_trucks: %, their invoices: %', n_ft, n_ft_inv;
  if n_ft <> 2 or n_ft_inv <> 2 then
    raise exception 'ABORT — expected 2 food trucks and 2 invoices, found %/%.', n_ft, n_ft_inv;
  end if;
end $$;

-- Invoices first: deleting the trucks would otherwise SET NULL and break the
-- exactly-one-parent constraint.
delete from invoices where food_truck_id is not null;
delete from food_trucks;

do $$
declare n_ft int; n_inv int; n_goo_inv int;
begin
  select count(*) into n_ft from food_trucks;
  select count(*) into n_inv from invoices;
  select count(*) into n_goo_inv from invoices i join sponsorships s on s.id = i.sponsorship_id where s.sponsor_name = 'Tattoo Goo';
  raise notice 'AFTER — food_trucks: % (want 0), invoices: % (want 2), Tattoo Goo invoice: % (want 1)', n_ft, n_inv, n_goo_inv;
  if n_ft <> 0 or n_goo_inv <> 1 then
    raise exception 'PART 2 FAILED — food_trucks=%, Tattoo Goo invoice=%. Rolled back.', n_ft, n_goo_inv;
  end if;
end $$;

commit;
*/


-- ════════════════════════════════════════════════════════════
-- HELD — Tattoo Goo re-point. Run ONLY after your team confirms they are a
-- genuine 2027 sponsor. Grandfathered at the $3,000 pre-July Gold price.
-- Moves the sponsorship and its invoice to the active event.
--
-- The invoice carries no event_id — it follows its sponsorship — so only the
-- sponsorship row needs re-pointing. The second statement is a no-op safety
-- check that the invoice is still correctly attached afterwards.
-- ════════════════════════════════════════════════════════════
/*
begin;

update sponsorships
   set event_id = (select id from events where is_active = true),
       updated_at = now()
 where sponsor_name = 'Tattoo Goo'
   and event_id = (select id from events where is_active = false);

do $$
declare n int; v_inv int;
begin
  select count(*) into n from sponsorships s join events e on e.id = s.event_id
   where s.sponsor_name = 'Tattoo Goo' and e.is_active = true;
  select count(*) into v_inv from invoices i join sponsorships s on s.id = i.sponsorship_id
   where s.sponsor_name = 'Tattoo Goo';
  if n <> 1 or v_inv <> 1 then
    raise exception 'Tattoo Goo re-point FAILED — on active event: %, invoice attached: %. Rolled back.', n, v_inv;
  end if;
  raise notice 'Tattoo Goo re-pointed to the active event; invoice still attached.';
  raise notice 'It will NOT appear publicly until featured_footer or show_on_homepage is set.';
end $$;

commit;
*/
