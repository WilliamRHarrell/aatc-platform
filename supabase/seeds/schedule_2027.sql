-- ============================================================
-- SEED: AATC 2027 programme - 25 schedule_items.
-- Source: docs/aatc-2027-schedule-spec.md. Run AFTER migration 044.
--
-- THE TWO SEMINARS ARE NOT HERE. "Bookkeeping for Tattoo Industry
-- Professionals" (Sun 1:30 PM) and "Tooth Gem Seminar" (Sun 3:00 PM) are
-- `panels` rows - panels owns registration, capacity and payment, and the
-- schedule page merges panels in at render. Seeding them here as well would
-- create two copies of the same item that drift the first time one is edited.
-- Their INSERTs are in supabase/seeds/panels_2027.sql.
--
-- MEDIEVAL ARMORED COMBAT IS A NOTE, NOT A ROW. It runs during the Saturday
-- 1:00 PM Team Strongman block, in the breaks between rounds. Every column in
-- this table hangs off `start_time`, and the page sorts and renders by it - a
-- row of its own would have to assert a start time the event does not have,
-- and would sort as though it displaced the Strongman entry rather than
-- running inside it. There is no parent/child column to model a true
-- sub-item. The `note` field renders directly beneath the item title, which is
-- exactly this relationship. /events/medieval-combat keeps its own page and is
-- still linked from the main nav.
--
-- Re-runnable: the DELETE at the top clears only this event's items first.
-- Teardown is at the bottom, commented.
-- ============================================================

begin;

-- Clear this event's programme so the seed can be re-run after a copy fix.
-- Scoped to the active event; does not touch panels.
delete from schedule_items
 where event_id = (select id from events where is_active);

insert into schedule_items
  (event_id, day_date, start_time, sort_order, title, location, kind, note,
   presented_by_fallback)
select e.id, v.day_date, v.start_time, v.sort_order, v.title, v.location,
       v.kind, v.note, v.presented_by_fallback
  from events e
 cross join (values

-- ── Friday, April 16, 2027 ────────────────────────────────
  (date '2027-04-16', time '12:00', 0, 'Doors Open', '', 'programme', '', null),
  -- The Wall of Honor's slot in the programme. Not ambient signage - it is a
  -- scheduled moment of silence. Treat this copy with care.
  (date '2027-04-16', time '12:30', 0, 'Missing Man Table Presentation', 'Main Stage', 'tribute',
   'Fallen Artists Moment of Silence', null),
  (date '2027-04-16', time '13:00', 0, 'All American Tattoo Battle Begins', 'Main Stage', 'contest',
   '', 'Whole Life Aftercare'),
  (date '2027-04-16', time '13:00', 1, 'Tattoo Contest Registration Opens', 'Contest Booth', 'contest', '', null),
  (date '2027-04-16', time '16:00', 0, 'Tattoo Contest Begins', 'Main Stage', 'contest', '', null),
  (date '2027-04-16', time '17:00', 0, 'Tattoo Battle Ends - Voting Opens', 'Main Stage', 'contest', '', null),
  (date '2027-04-16', time '18:00', 0, 'Tattoo Dating Game', 'Main Stage', 'programme', '', null),
  (date '2027-04-16', time '20:00', 0, 'Tattoo Contest Continues', 'Main Stage', 'contest', '', null),
  (date '2027-04-16', time '21:30', 0, 'Tattoo of the Day', 'Main Stage', 'contest', '', null),
  (date '2027-04-16', time '22:00', 0, 'Show Closes', '', 'programme', '', null),

-- ── Saturday, April 17, 2027 ──────────────────────────────
  -- Gold Star refers to the families of fallen service members. This is a
  -- private hosting, not a ticket tier - the wording must not read as one.
  (date '2027-04-17', time '10:00', 0, 'Gold Star VIP Meet & Greet', 'Front Room', 'tribute',
   'A private meet & greet hosted for Gold Star families before doors open.', null),
  (date '2027-04-17', time '12:00', 0, 'Opening Ceremonies', 'Main Stage', 'ceremony', '', null),
  (date '2027-04-17', time '13:00', 0, 'Tattoo Contest Registration Opens', 'Contest Booth', 'contest', '', null),
  -- 2027 is team strongman only. Dead-lift and bench press are dropped.
  -- Medieval armored combat runs INSIDE this block, in the breaks between
  -- rounds - it is a note on this item rather than a row of its own because it
  -- has no start time to assert. See the seed header for the reasoning.
  -- sort_order 1: moving this from 1:30 to 1:00 puts it on the same start time
  -- as contest registration above. Registration leads (attendees act on it
  -- first); this is the editorial tiebreak the column exists for.
  (date '2027-04-17', time '13:00', 1, 'Strongest at the Sideshow', 'Crown Ballroom', 'contest',
   'Team strongman competition. Medieval armored combat demonstrations run between team strongman contest events, starting at 1:00 PM in the Crown Ballroom.', null),
  -- Dating Game runs BOTH Friday and Saturday at 6:00 PM (§10.1). The Friday
  -- row is above; this is the Saturday instance the original seed omitted.
  (date '2027-04-17', time '18:00', 0, 'Tattoo Dating Game', 'Main Stage', 'programme', '', null),
  (date '2027-04-17', time '14:00', 0, 'Miss All American Pin-Up Contest', 'Main Stage', 'contest', '', null),
  (date '2027-04-17', time '16:00', 0, 'Tattoo Contest Begins', 'Main Stage', 'contest', '', null),
  (date '2027-04-17', time '19:00', 0, 'Tattoo Contest Continues', 'Main Stage', 'contest', '', null),
  (date '2027-04-17', time '21:30', 0, 'Tattoo of the Day', 'Main Stage', 'contest', '', null),
  (date '2027-04-17', time '22:00', 0, 'Show Closes', '', 'programme', '', null),

-- ── Sunday, April 18, 2027 ────────────────────────────────
  (date '2027-04-18', time '12:00', 0, 'Opening Ceremonies', 'Main Stage', 'ceremony', '', null),
  (date '2027-04-18', time '13:00', 0, 'Tattoo Contest Registration Opens', 'Contest Booth', 'contest', '', null),
  (date '2027-04-18', time '16:00', 0, 'Tattoo Contest Begins', 'Main Stage', 'contest', '', null),
  (date '2027-04-18', time '18:00', 0, 'All American Tattoo Battle Champion Crowned', 'Main Stage', 'contest', '', null),
  (date '2027-04-18', time '19:00', 0, 'Tattoo of the Day & Best of Show', 'Main Stage', 'contest', '', null),
  (date '2027-04-18', time '20:00', 0, 'Show Closes', '', 'programme', '', null)

) as v(day_date, start_time, sort_order, title, location, kind, note, presented_by_fallback)
 where e.is_active;

-- Expect 25.
select count(*) as seeded_items,
       'want 25' as expected
  from schedule_items
 where event_id = (select id from events where is_active);

commit;


-- ============================================================
-- TEARDOWN - uncomment to remove.
-- ============================================================
-- delete from schedule_items
--  where event_id = (select id from events where is_active);
