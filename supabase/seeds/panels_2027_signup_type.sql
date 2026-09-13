-- ============================================================
-- Open registration on both 2027 seminars, and set their room targets.
--   signup_type: 'none' → 'free_registration'
--   max_capacity: → 150 (planning target; room is the Seminar Room, see note)
--
-- WHAT THIS DOES AND DOES NOT DO.
--   Does:     turns on the registration form, so attendees can sign up in
--             advance and you get names, emails, phones and attendee type.
--   Does NOT: cap, gate, or close anything. Registration stays open no matter
--             how many people sign up. Nobody is ever turned away.
--
-- Seminars are not access-controlled. Registration is for PLANNING and
-- FOLLOW-UP; walk-ins are welcome if there is room. Refusing the 51st signup
-- would turn away someone who would have walked in anyway, and lose both the
-- attendee and the forecast.
--
-- ── The four signup_type values ─────────────────────────────
--   'none'              Listed, but NOT registerable - /api/panel-register
--                       rejects it with a 400. No roster, no contact details.
--   'free_registration' Free, and registrations are collected into
--                       panel_registrations. ← what this sets.
--   'aatc_invoice'      Paid. Creates a Stripe checkout for `cost` (CENTS).
--                       Not applicable - both seminars are is_free, cost 0.
--   'email_host'        Sends people to the host. WARNING: host_email becomes
--                       PUBLIC through panels_public for this value only.
--
-- ── max_capacity is a PLANNING TARGET, not a limit ──────────
-- Nothing enforces it and nothing ever will for these seminars. /admin/panels
-- reads it as "N registered · room seats 150", flags amber at 80% of the target
-- and red once the count passes it, so the room can be changed or chairs added.
-- It is deliberately NOT rendered as "N / 150 max", which reads as a gate.
--
-- Nothing on the public page mentions capacity, remaining spots or fullness.
--
-- ── ROOMS, CORRECTED 2026-09-13 ─────────────────────────────
-- The 2026-08-13 note that stood here put Sunday's seminars in the Ballroom.
-- That was WRONG. Ryan confirmed 2026-09-13: both seminars and the Gold Star
-- VIP Meet & Greet are in the SEMINAR ROOM, and the Ballroom holds only
-- Strongest at the Sideshow. Room names live in ROOMS in
-- src/lib/event-config.ts - one name per space, everywhere.
--
-- max_capacity below is still 150, which was the Ballroom figure. The old
-- note put the Seminar Room at 50 seats, which a turnout like last year's
-- Bookkeeping seminar (~50 people) would fill. The Seminar Room's planning
-- target is NOT confirmed - Ryan to say - so the number is left as it was
-- rather than guessed. At 150 the amber flag fires at 120 registrations; at
-- 50 it would fire at 40.
-- ============================================================

begin;

update panels
   set signup_type  = 'free_registration'::panel_signup_type,
       max_capacity = 150   -- Planning target, not a cap. Room is the Seminar Room; see note.
 where event_id = (select id from events where is_active)
   and title in ('Bookkeeping for Tattoo Industry Professionals',
                 'Tooth Gem Seminar');

-- Expect 2 rows: free_registration, max_capacity 150, is_free true, cost 0,
-- both on 2027-04-18.
select title, signup_type, max_capacity, is_free, cost,
       panel_day, panel_start, is_published
  from panels
 where event_id = (select id from events where is_active)
 order by panel_start;

commit;


-- ============================================================
-- REVERT - closes registration entirely. The seminars stay listed.
-- ============================================================
-- update panels
--    set signup_type = 'none'::panel_signup_type
--  where event_id = (select id from events where is_active)
--    and title in ('Bookkeeping for Tattoo Industry Professionals',
--                  'Tooth Gem Seminar');
