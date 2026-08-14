-- ============================================================
-- Change the two 2027 seminars from signup_type 'none' to 'free_registration'.
--
-- RUN THIS ONLY IF THE SEATING IS LIMITED. If both seminars are open, walk-in,
-- sit-where-you-like, then 'none' is already correct and you should not run it.
--
-- ── The four values, and what each actually does ────────────
--
--   'none'              Listed on the schedule and the panels page. NOT
--                       registerable — /api/panel-register REJECTS it outright
--                       (400, "Registration is not available for this panel").
--                       No roster, no headcount, no attendee emails. Correct
--                       for an open, walk-in session.
--
--   'free_registration' Free, and registrations are collected into
--                       panel_registrations. You get names, emails, phones and
--                       attendee type. THIS is the value for limited seating.
--
--   'aatc_invoice'      Paid. Creates a Stripe checkout for `cost` (CENTS).
--                       Wrong here — both seminars are is_free = true, cost 0.
--
--   'email_host'        Sends people to the host by email. NOTE: host_email is
--                       exposed PUBLICLY through panels_public for this value
--                       and only this value. Wrong here — host_email is null.
--
-- ── READ THIS BEFORE ASSUMING IT CAPS ATTENDANCE ────────────
--
-- **max_capacity IS NOT ENFORCED ANYWHERE.** /api/panel-register never counts
-- existing registrations against it — it inserts unconditionally. The column is
-- stored, shown in the /admin/panels list as "N / M max", and typed on the
-- public page, but nothing stops the N+1th signup.
--
-- So 'free_registration' buys you a ROSTER, not a CAP. You will know you are
-- oversubscribed; the form will not stop it, and the admin list will cheerfully
-- read "45 / 30 max". If a hard cap is needed before the show, that is a code
-- change in /api/panel-register, logged in CUTOVER §E2.
--
-- Setting max_capacity is still worth doing — it is the number to compare the
-- roster against, and it is what a future enforcement check would read.
-- ============================================================

begin;

update panels
   set signup_type  = 'free_registration'::panel_signup_type,
       -- Set the real seat counts, or drop these two lines to leave them null.
       -- Remember: this records intent, it does not enforce anything.
       max_capacity = case title
                        when 'Bookkeeping for Tattoo Industry Professionals' then 30
                        when 'Tooth Gem Seminar'                             then 30
                      end
 where event_id = (select id from events where is_active)
   and title in ('Bookkeeping for Tattoo Industry Professionals',
                 'Tooth Gem Seminar');

-- Expect 2 rows, both free_registration, is_free true, cost 0.
select title, signup_type, is_free, cost, max_capacity, is_published
  from panels
 where event_id = (select id from events where is_active)
 order by panel_time;

commit;


-- ============================================================
-- REVERT — back to 'none' if the seminars turn out to be walk-in.
-- ============================================================
-- update panels
--    set signup_type = 'none'::panel_signup_type, max_capacity = null
--  where event_id = (select id from events where is_active)
--    and title in ('Bookkeeping for Tattoo Industry Professionals',
--                  'Tooth Gem Seminar');
