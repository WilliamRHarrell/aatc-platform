-- ============================================================
-- SEED: the two 2027 seminars, as `panels` rows. Run AFTER migration 044.
--
-- These are the first real production rows this platform has held. Read the
-- three notes below before running - two of them are decisions, not defaults.
--
-- WHY panels AND NOT schedule_items: panels owns registration, capacity and
-- payment (panel_registrations, signup_type, cost). The schedule page merges
-- panels in at render, so these appear in the programme without a second copy.
--
-- ALREADY RUN - 2026-08-13. Kept as the record of what was inserted. Both
-- notes below have since been superseded; read them for history, not for
-- instruction.
--
-- NOTE 1 - SUPERSEDED BY MIGRATION 046. panel_date/panel_time were free text,
--   and the schedule matched panel_date against a generated day label, so a
--   mismatch silently dropped the seminar from the programme. They are now real
--   `panel_day date` / `panel_start time` columns and the join is a date
--   equality. 047 drops the text pair. Do not re-run this seed as written after
--   047 - the columns it inserts into will not exist.
--
-- NOTE 2 - SUPERSEDED. signup_type was set to 'none' here, and both seminars
--   move to 'free_registration' via panels_2027_signup_type.sql. Note that the
--   original wording below called free_registration "capped by max_capacity",
--   which was wrong in two ways: nothing enforced max_capacity then, and
--   nothing enforces it now BY DESIGN. Seminars are open, walk-ins welcome, and
--   max_capacity is a planning target only. See CUTOVER §E2.
--
-- NOTE 3 - description AND panelists ARE DELIBERATELY EMPTY.
--   No speaker names or session blurbs were given, and inventing them puts
--   fabricated names on a live page in front of the artist community. Fill
--   them in /admin/panels when the real details land; both render as
--   optional, so empty is a clean state rather than a broken one.
-- ============================================================

begin;

-- Idempotent: clear these two by title for the active event before inserting,
-- so the seed can be re-run after an edit. Scoped by title AND event so it
-- cannot touch any other panel.
delete from panels
 where event_id = (select id from events where is_active)
   and title in ('Bookkeeping for Tattoo Industry Professionals',
                 'Tooth Gem Seminar');

insert into panels
  (event_id, title, description, panel_date, panel_time, location, panelists,
   is_free, cost, signup_type, host_email, max_capacity, is_published,
   presented_by_sponsorship_id, presented_by_fallback)
select e.id, v.title, v.description, v.panel_date, v.panel_time, v.location,
       v.panelists, v.is_free, v.cost, v.signup_type::panel_signup_type,
       v.host_email, v.max_capacity, v.is_published,
       v.presented_by_sponsorship_id, v.presented_by_fallback
  from events e
 cross join (values

  -- Sunday 1:30 PM - presented by Nomadica. The FK stays NULL until a
  -- Nomadica sponsorship row exists; the fallback carries the credit as plain
  -- text until then, and the FK takes over automatically once linked.
  ('Bookkeeping for Tattoo Industry Professionals',
   '', 'Sunday, April 18', '1:30 PM', 'Seminar Room', '',
   true, 0, 'none', null::text, null::int, true,
   null::uuid, 'Nomadica'),

  -- Sunday 3:00 PM - no presentation credit sold.
  ('Tooth Gem Seminar',
   '', 'Sunday, April 18', '3:00 PM', 'Seminar Room', '',
   true, 0, 'none', null::text, null::int, true,
   null::uuid, null::text)

) as v(title, description, panel_date, panel_time, location, panelists,
       is_free, cost, signup_type, host_email, max_capacity, is_published,
       presented_by_sponsorship_id, presented_by_fallback)
 where e.is_active;

-- Expect 2, both is_published = true.
select title, panel_date, panel_time, signup_type, is_published, presented_by_fallback
  from panels
 where event_id = (select id from events where is_active)
 order by panel_time;

commit;


-- ============================================================
-- TEARDOWN - uncomment to remove. Deletes registrations first: the FK on
-- panel_registrations is ON DELETE CASCADE, so this is belt and braces, but
-- it makes the row count visible before anything is destroyed.
-- ============================================================
-- select count(*) as registrations_that_will_be_deleted
--   from panel_registrations r
--   join panels p on p.id = r.panel_id
--  where p.event_id = (select id from events where is_active)
--    and p.title in ('Bookkeeping for Tattoo Industry Professionals',
--                    'Tooth Gem Seminar');
--
-- delete from panels
--  where event_id = (select id from events where is_active)
--    and title in ('Bookkeeping for Tattoo Industry Professionals',
--                  'Tooth Gem Seminar');
