-- ============================================================
-- Room names, confirmed by Ryan 2026-09-13. One name per space, everywhere:
--   Seminar Room - the seminars, and the Gold Star VIP Meet & Greet
--   Ballroom     - Strongest at the Sideshow
-- "Front Room" and "Crown Ballroom" were earlier names for the same two
-- spaces. Code reads the names from ROOMS in src/lib/event-config.ts; these
-- rows are the database copy and must match it.
--
-- Applied to the live project 2026-09-13 through the REST API (service role):
-- schedule_items had one 'Front Room' row (the meet and greet) and panels had
-- one (Tooth Gem Seminar). Kept here so the rename is tracked and re-runnable.
-- Idempotent.
-- ============================================================
begin;

update schedule_items set location = 'Seminar Room' where location = 'Front Room';
update schedule_items set location = 'Ballroom'     where location = 'Crown Ballroom';
update panels         set location = 'Seminar Room' where location = 'Front Room';
update panels         set location = 'Ballroom'     where location = 'Crown Ballroom';

-- Expect zero rows.
select 'schedule_items' as t, location, count(*) from schedule_items
 where location in ('Front Room', 'Crown Ballroom') group by 1, 2
union all
select 'panels', location, count(*) from panels
 where location in ('Front Room', 'Crown Ballroom') group by 1, 2;

commit;
