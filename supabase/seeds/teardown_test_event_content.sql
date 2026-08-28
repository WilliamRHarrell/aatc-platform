-- ============================================================
-- TEST CONTENT TEARDOWN - the March 2026 test data on the inactive event
--
-- ONE transaction. Scope:
--   5 panels (all is_published = true)
--   2 contests + 6 entries + 5 votes
--   2 food trucks + their 2 invoices
--   the inactive event's 267 duplicate booths
--
-- The inactive event ROW ITSELF is retained, is_active = false, as an anchor.
--
-- ── WHY ─────────────────────────────────────────────────────
-- All 5 panels are published, with content including "TAX Shit", panelist
-- "Joe Momma", and a description reading "theskch kdhsfkjhasdf". The only thing
-- keeping that off the public site is every query filtering correctly by active
-- event, and the stranded-event episode established that assumption is not
-- safe. Same for the duplicate booths: harmless only while no query counts
-- booths without an event filter; an unfiltered count reports 534 available.
--
-- ── FOOD TRUCK ORDERING ─────────────────────────────────────
-- invoices.food_truck_id is ON DELETE SET NULL. Deleting the invoices FIRST
-- means SET NULL never fires and nothing is momentarily parentless, so this
-- behaves identically before or after migration 033's exactly-one-parent
-- constraint. Deleting the trucks first would either error (post-033) or leave
-- two parentless invoices (pre-033).
--
-- ── PROTECTED, WITH ABORTS ──────────────────────────────────
--   sponsorship  32ef207d  Tattoo Goo ($3,000, confirmed) - real
--   invoice      d5f1c5f3  its invoice
--   sponsorship  8a7cd934  ZZ TEST - RLS Harness Pending
--   sponsorship  f2a007e0  ZZ TEST - RLS Harness (confirmed, homepage)
--   invoice      2ef5dc4e  the harness invoice
-- No statement below touches sponsorships. Invoice deletes are restricted to
-- `food_truck_id is not null`, which cannot match a sponsorship invoice. The
-- assertions confirm all five survive; anything missing rolls the whole thing
-- back.
--
-- ── FK BEHAVIOUR RELIED ON ──────────────────────────────────
--   contest_entries.contest_id   CASCADE
--   contest_votes.entry_id       CASCADE
--   panel_registrations.panel_id CASCADE   (0 rows)
--   invoices.food_truck_id       SET NULL  <- avoided by delete order
--   booths.application_id        SET NULL  <- asserted all NULL before delete
--
-- ── RESTORE ─────────────────────────────────────────────────
-- Deliberately no restore INSERTs: the panel/contest text and entry photos are
-- not recorded anywhere else, so reconstruction from SQL is not possible and a
-- fake safety net would be worse than none. Rollback is the daily snapshot -
-- but note that snapshot predates the end-date fix and migrations 027-030, so
-- restoring it would revert those too. The assertions below are the real
-- protection.
-- ============================================================

begin;

-- ── Guards ──────────────────────────────────────────────────
do $$
declare
  v_target   uuid := 'b3630abd-62a4-4e4c-b4b8-c6c31dbf947c';  -- the inactive event
  v_active   uuid;
  v_name     text;
  v_is_act   boolean;
  n_panels int; n_contests int; n_entries int; n_votes int; n_preg int;
  n_ft int; n_ft_inv int; n_inv_all int;
  n_booths_t int; n_booths_a int; n_booths_all int;
  n_goo int; n_goo_inv int; n_harness_sp int; n_harness_inv int;
begin
  -- Identity of the literal UUID: it must exist, be inactive, be the expected
  -- row, and NOT be the active event.
  select name, is_active into v_name, v_is_act from events where id = v_target;
  if v_name is null then
    raise exception 'ABORT - target event % not found. Wrong database?', v_target;
  end if;
  if v_is_act then
    raise exception 'ABORT - target event % is ACTIVE. Refusing to touch it.', v_target;
  end if;
  if v_name <> 'AATC Fayetteville 2027' then
    raise exception 'ABORT - target event % is named "%", expected "AATC Fayetteville 2027".', v_target, v_name;
  end if;

  select id into v_active from events where is_active = true;
  if v_active is null then
    raise exception 'ABORT - no active event. Refusing to run.';
  end if;
  if v_active = v_target then
    raise exception 'ABORT - target equals the active event.';
  end if;

  select count(*) into n_panels   from panels   where event_id = v_target;
  select count(*) into n_contests from contests where event_id = v_target;
  select count(*) into n_entries  from contest_entries;
  select count(*) into n_votes    from contest_votes;
  select count(*) into n_preg     from panel_registrations;
  select count(*) into n_ft       from food_trucks;
  select count(*) into n_ft_inv   from invoices where food_truck_id is not null;
  select count(*) into n_inv_all  from invoices;
  select count(*) into n_booths_t from booths where event_id = v_target;
  select count(*) into n_booths_a from booths where event_id = v_active;
  select count(*) into n_booths_all from booths;
  select count(*) into n_goo      from sponsorships where sponsor_name = 'Tattoo Goo';
  select count(*) into n_goo_inv  from invoices i join sponsorships s on s.id = i.sponsorship_id
                                  where s.sponsor_name = 'Tattoo Goo';
  select count(*) into n_harness_sp  from sponsorships where sponsor_name like 'ZZ TEST - RLS Harness%';
  select count(*) into n_harness_inv from invoices i join sponsorships s on s.id = i.sponsorship_id
                                     where s.sponsor_name like 'ZZ TEST - RLS Harness%';

  raise notice '';
  raise notice '════════ BEFORE ════════';
  raise notice '  target (inactive) event   : %  "%"', v_target, v_name;
  raise notice '  active event              : %', v_active;
  raise notice '  panels        on target   : %', n_panels;
  raise notice '  contests      on target   : %', n_contests;
  raise notice '  contest_entries (all)     : %', n_entries;
  raise notice '  contest_votes   (all)     : %', n_votes;
  raise notice '  panel_registrations (all) : %', n_preg;
  raise notice '  food_trucks     (all)     : %', n_ft;
  raise notice '  food-truck invoices       : %', n_ft_inv;
  raise notice '  invoices        (all)     : %', n_inv_all;
  raise notice '  booths on target          : %', n_booths_t;
  raise notice '  booths on active          : %', n_booths_a;
  raise notice '  booths TOTAL              : %', n_booths_all;
  raise notice '  ---- protected ----';
  raise notice '  Tattoo Goo sponsorship    : %', n_goo;
  raise notice '  Tattoo Goo invoice        : %', n_goo_inv;
  raise notice '  harness sponsorships      : %', n_harness_sp;
  raise notice '  harness invoice           : %', n_harness_inv;

  if n_goo <> 1 or n_goo_inv <> 1 or n_harness_sp <> 2 or n_harness_inv <> 1 then
    raise exception
      'ABORT - protected rows not as expected (Goo=%, Goo invoice=%, harness sponsorships=%, harness invoice=%; wanted 1/1/2/1).',
      n_goo, n_goo_inv, n_harness_sp, n_harness_inv;
  end if;

  if n_booths_a <> 267 then
    raise exception 'ABORT - active event has % booths, expected 267.', n_booths_a;
  end if;

  -- A target booth still holding an assignment would mean a real exhibitor is
  -- attached; refuse rather than orphan them.
  if exists (select 1 from booths where event_id = v_target and application_id is not null) then
    raise exception 'ABORT - target-event booths still hold application assignments.';
  end if;
end $$;


-- ── Deletes, child-first ────────────────────────────────────
-- Every predicate is pinned to the LITERAL event UUID rather than
-- `is_active = false`, so nothing here can be redirected by an is_active change
-- and the blast radius is readable at a glance. The guard block above has
-- already proven that UUID's identity.

-- 1. Contest votes -> entries -> contests
delete from contest_votes
 where entry_id in (
   select e.id
     from contest_entries e
     join contests c on c.id = e.contest_id
    where c.event_id = 'b3630abd-62a4-4e4c-b4b8-c6c31dbf947c'
 );

delete from contest_entries
 where contest_id in (
   select id from contests where event_id = 'b3630abd-62a4-4e4c-b4b8-c6c31dbf947c'
 );

delete from contests
 where event_id = 'b3630abd-62a4-4e4c-b4b8-c6c31dbf947c';

-- 2. Panel registrations -> panels
delete from panel_registrations
 where panel_id in (
   select id from panels where event_id = 'b3630abd-62a4-4e4c-b4b8-c6c31dbf947c'
 );

delete from panels
 where event_id = 'b3630abd-62a4-4e4c-b4b8-c6c31dbf947c';

-- 3. Food-truck invoices BEFORE the trucks, so ON DELETE SET NULL never fires.
--    `food_truck_id is not null` cannot match a sponsorship invoice, so neither
--    Tattoo Goo's nor the harness invoice is reachable here.
delete from invoices
 where food_truck_id is not null;

delete from food_trucks
 where event_id = 'b3630abd-62a4-4e4c-b4b8-c6c31dbf947c';

-- 4. The target event's duplicate 267 booths. All have application_id NULL
--    (asserted above), so nothing is orphaned.
delete from booths
 where event_id = 'b3630abd-62a4-4e4c-b4b8-c6c31dbf947c';


-- ── Assertions ──────────────────────────────────────────────
do $$
declare
  v_target uuid := 'b3630abd-62a4-4e4c-b4b8-c6c31dbf947c';
  n_panels int; n_contests int; n_entries int; n_votes int;
  n_ft int; n_ft_inv int; n_inv_all int;
  n_booths_t int; n_booths_a int; n_booths_all int; n_events int;
  n_goo int; n_goo_inv int; n_harness_sp int; n_harness_inv int;
  problems text := '';
begin
  select count(*) into n_panels   from panels   where event_id = v_target;
  select count(*) into n_contests from contests where event_id = v_target;
  select count(*) into n_entries  from contest_entries;
  select count(*) into n_votes    from contest_votes;
  select count(*) into n_ft       from food_trucks;
  select count(*) into n_ft_inv   from invoices where food_truck_id is not null;
  select count(*) into n_inv_all  from invoices;
  select count(*) into n_booths_t from booths where event_id = v_target;
  select count(*) into n_booths_a from booths b join events e on e.id = b.event_id where e.is_active = true;
  select count(*) into n_booths_all from booths;
  select count(*) into n_events   from events;
  select count(*) into n_goo      from sponsorships where sponsor_name = 'Tattoo Goo';
  select count(*) into n_goo_inv  from invoices i join sponsorships s on s.id = i.sponsorship_id
                                  where s.sponsor_name = 'Tattoo Goo';
  select count(*) into n_harness_sp  from sponsorships where sponsor_name like 'ZZ TEST - RLS Harness%';
  select count(*) into n_harness_inv from invoices i join sponsorships s on s.id = i.sponsorship_id
                                     where s.sponsor_name like 'ZZ TEST - RLS Harness%';

  raise notice '';
  raise notice '════════ AFTER ════════';
  raise notice '  panels        on target   : %  (want 0)', n_panels;
  raise notice '  contests      on target   : %  (want 0)', n_contests;
  raise notice '  contest_entries           : %  (want 0)', n_entries;
  raise notice '  contest_votes             : %  (want 0)', n_votes;
  raise notice '  food_trucks               : %  (want 0)', n_ft;
  raise notice '  food-truck invoices       : %  (want 0)', n_ft_inv;
  raise notice '  invoices TOTAL            : %  (want 2 - Tattoo Goo + harness)', n_inv_all;
  raise notice '  booths on target          : %  (want 0)', n_booths_t;
  raise notice '  booths on ACTIVE event    : %  (want 267)', n_booths_a;
  raise notice '  booths TOTAL              : %  (want 267)', n_booths_all;
  raise notice '  events rows               : %  (want 2 - inactive row retained)', n_events;
  raise notice '  ---- protected ----';
  raise notice '  Tattoo Goo sponsorship    : %  (want 1)', n_goo;
  raise notice '  Tattoo Goo invoice        : %  (want 1)', n_goo_inv;
  raise notice '  harness sponsorships      : %  (want 2)', n_harness_sp;
  raise notice '  harness invoice           : %  (want 1)', n_harness_inv;

  if n_panels     <> 0   then problems := problems || ' panels remain;'; end if;
  if n_contests   <> 0   then problems := problems || ' contests remain;'; end if;
  if n_entries    <> 0   then problems := problems || ' contest entries remain;'; end if;
  if n_votes      <> 0   then problems := problems || ' contest votes remain;'; end if;
  if n_ft         <> 0   then problems := problems || ' food trucks remain;'; end if;
  if n_ft_inv     <> 0   then problems := problems || ' food-truck invoices remain;'; end if;
  if n_booths_t   <> 0   then problems := problems || ' target booths remain;'; end if;
  if n_booths_a   <> 267 then problems := problems || ' ACTIVE EVENT NO LONGER HAS 267 BOOTHS;'; end if;
  if n_booths_all <> 267 then problems := problems || ' booth total is not 267;'; end if;
  if n_events     <> 2   then problems := problems || ' an events row was lost;'; end if;
  if n_inv_all    <> 2   then problems := problems || ' invoice total is not 2;'; end if;
  if n_goo        <> 1   then problems := problems || ' TATTOO GOO LOST;'; end if;
  if n_goo_inv    <> 1   then problems := problems || ' TATTOO GOO INVOICE LOST;'; end if;
  if n_harness_sp <> 2   then problems := problems || ' HARNESS SPONSORSHIPS LOST;'; end if;
  if n_harness_inv<> 1   then problems := problems || ' HARNESS INVOICE LOST;'; end if;

  if problems <> '' then
    raise exception 'TEARDOWN FAILED - %  Transaction rolled back, nothing removed.', problems;
  end if;

  raise notice '';
  raise notice '  OK - test content removed. Active event intact at 267 booths.';
  raise notice '  Protected rows all present. Inactive event row retained.';
  raise notice '';
end $$;

commit;


-- ════════════════════════════════════════════════════════════
-- HELD - Tattoo Goo re-point. Run ONE variant, after your team confirms.
--
-- Grandfathered at the $3,000 pre-July Gold price. Only the sponsorship needs
-- moving: invoices carry no event_id, so d5f1c5f3 follows automatically.
--
-- Re-pointing alone does NOT make them visible. A placement flag is required -
-- which is what differs between the two variants below.
-- ════════════════════════════════════════════════════════════

-- ── VARIANT A: paying Gold sponsor ──────────────────────────
-- is_in_kind stays false, so the admin "Featured, unpaid" warning WILL show
-- while the $3,000 invoice is unpaid. That is correct - it is a real receivable
-- and the warning is telling you something true.
/*
begin;
update sponsorships
   set event_id         = (select id from events where is_active = true),
       show_on_homepage = true,
       featured_footer  = true,
       homepage_order   = 1,
       is_in_kind       = false,
       updated_at       = now()
 where sponsor_name = 'Tattoo Goo';

do $$
declare n int; v_inv int;
begin
  select count(*) into n from sponsorships s join events e on e.id = s.event_id
   where s.sponsor_name = 'Tattoo Goo' and e.is_active = true and s.show_on_homepage;
  select count(*) into v_inv from invoices i join sponsorships s on s.id = i.sponsorship_id
   where s.sponsor_name = 'Tattoo Goo';
  if n <> 1 or v_inv <> 1 then
    raise exception 'FAILED - on active event + homepage: %, invoice attached: %. Rolled back.', n, v_inv;
  end if;
  raise notice 'Tattoo Goo live on homepage + footer. Invoice intact. "Featured, unpaid" will show until the $3,000 is recorded.';
end $$;
commit;
*/

-- ── VARIANT B: trade / in-kind arrangement ──────────────────
-- is_in_kind = true suppresses the "Featured, unpaid" warning, because no cash
-- was ever going to arrive. Consider also cancelling the $3,000 invoice so it
-- stops counting as an outstanding receivable - uncomment that line if so.
/*
begin;
update sponsorships
   set event_id         = (select id from events where is_active = true),
       show_on_homepage = true,
       featured_footer  = true,
       homepage_order   = 1,
       is_in_kind       = true,
       updated_at       = now()
 where sponsor_name = 'Tattoo Goo';

-- Optional: stop the invoice showing as money owed.
-- update invoices set status = 'cancelled'
--  where sponsorship_id = (select id from sponsorships where sponsor_name = 'Tattoo Goo');

do $$
declare n int;
begin
  select count(*) into n from sponsorships s join events e on e.id = s.event_id
   where s.sponsor_name = 'Tattoo Goo' and e.is_active = true and s.is_in_kind;
  if n <> 1 then
    raise exception 'FAILED - in-kind on active event: %. Rolled back.', n;
  end if;
  raise notice 'Tattoo Goo live as in-kind. "Featured, unpaid" suppressed.';
end $$;
commit;
*/
