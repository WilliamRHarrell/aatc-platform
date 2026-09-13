-- ============================================================
-- Strongest at the Sideshow starts at 1:00 PM, confirmed by Ryan 2026-09-13.
--
-- The live schedule_items row read 13:30 while the seed, the homepage and
-- the strongman page all said 1:00. The row is the shared source that the
-- schedule page and (from this commit) the tickets page render, so it is the
-- one place the time has to be right. sort_order 1 keeps contest registration
-- (13:00, sort_order 0) listed first, per the seed's editorial tiebreak.
--
-- Paste into the Supabase SQL editor. Idempotent; expect 1 row.
-- ============================================================
begin;

update schedule_items
   set start_time = time '13:00',
       sort_order = 1
 where event_id = (select id from events where is_active)
   and day_date = date '2027-04-17'
   and title    = 'Strongest at the Sideshow';

select day_date, start_time, sort_order, title, location
  from schedule_items
 where event_id = (select id from events where is_active)
   and day_date = date '2027-04-17'
   and start_time = time '13:00'
 order by sort_order;
-- Expect two rows: Tattoo Contest Registration Opens (0), Strongest at the Sideshow (1).

commit;
