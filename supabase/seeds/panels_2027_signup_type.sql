-- ============================================================
-- Open registration on both 2027 seminars, and set their room targets.
--   signup_type: 'none' → 'free_registration'
--   max_capacity: → 150 (Ballroom)
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
-- ── ROOMS, CONFIRMED 2026-08-13 ─────────────────────────────
-- Both seminars are on SUNDAY, and Sunday's sessions are in the BALLROOM -
-- 150 seats. That is what this sets.
--
-- The 50-seat SEMINAR ROOM is Friday and Saturday only, and nothing is
-- scheduled in it. **If a Friday or Saturday seminar is ever added, its
-- max_capacity is 50** - and that is the room where a turnout like last year's
-- Bookkeeping seminar (~50 people) would actually be tight.
--
-- At 150 the amber flag does not fire until 120 registrations, which is the
-- intended behaviour: no false alarm on a turnout like last year's.
-- ============================================================

begin;

update panels
   set signup_type  = 'free_registration'::panel_signup_type,
       max_capacity = 150   -- Ballroom. Planning target, not a cap.
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
