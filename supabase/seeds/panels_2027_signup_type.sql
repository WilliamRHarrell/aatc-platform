-- ============================================================
-- Open registration on both 2027 seminars: signup_type 'none' → 'free_registration'.
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
--   'none'              Listed, but NOT registerable — /api/panel-register
--                       rejects it with a 400. No roster, no contact details.
--                       This is what both seminars are set to now.
--   'free_registration' Free, and registrations are collected into
--                       panel_registrations. ← what this migration sets.
--   'aatc_invoice'      Paid. Creates a Stripe checkout for `cost` (CENTS).
--                       Not applicable — both seminars are is_free, cost 0.
--   'email_host'        Sends people to the host. WARNING: host_email becomes
--                       PUBLIC through panels_public for this value only.
--
-- ── max_capacity is a PLANNING TARGET, not a limit ──────────
-- Nothing enforces it and nothing ever will for these seminars. /admin/panels
-- reads it as "42 registered · room seats 50" and flags amber at 80% and red
-- when the count passes it, so you can move rooms or add chairs. It is
-- deliberately NOT rendered as "42 / 50 max", which reads as a gate.
--
-- Nothing on the public page mentions capacity, remaining spots or fullness.
--
-- SET THE SEAT COUNTS when you know the rooms — leave them null until then,
-- rather than guessing. A wrong target is worse than none: it will flag red on
-- a room that is actually fine.
-- ============================================================

begin;

update panels
   set signup_type = 'free_registration'::panel_signup_type
 where event_id = (select id from events where is_active)
   and title in ('Bookkeeping for Tattoo Industry Professionals',
                 'Tooth Gem Seminar');

-- Expect 2 rows, both free_registration, is_free true, cost 0.
-- max_capacity stays as it is — set it separately below once the rooms are known.
select title, signup_type, is_free, cost, max_capacity, is_published
  from panels
 where event_id = (select id from events where is_active)
 order by panel_start;

commit;


-- ============================================================
-- ROOM SIZES — run when you know them. Planning targets only.
-- The Bookkeeping seminar drew roughly 50 last year, so a room seating fewer
-- than that is worth knowing about early.
-- ============================================================
-- update panels set max_capacity = 60
--  where event_id = (select id from events where is_active)
--    and title = 'Bookkeeping for Tattoo Industry Professionals';
--
-- update panels set max_capacity = 40
--  where event_id = (select id from events where is_active)
--    and title = 'Tooth Gem Seminar';


-- ============================================================
-- REVERT — closes registration entirely. The seminars stay listed.
-- ============================================================
-- update panels
--    set signup_type = 'none'::panel_signup_type
--  where event_id = (select id from events where is_active)
--    and title in ('Bookkeeping for Tattoo Industry Professionals',
--                  'Tooth Gem Seminar');
