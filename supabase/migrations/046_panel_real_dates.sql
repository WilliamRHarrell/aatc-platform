-- Migration 046: give panels a real date and time. Phase 1 of 2 — ADDITIVE.
-- Phase 2 (dropping the text columns) is 047_drop_panel_text_dates.sql, and it
-- must NOT run until the deploy that reads the new columns is live.
-- Verification: supabase/verify/verify_046.sql
--
-- WHY. panels.panel_date is `text not null default ''` holding a DISPLAY STRING
-- ('Sunday, April 18' — no year). Three consequences, all of them real:
--
--   1. /events/tattoo-panels rendered the literal string "Invalid Date" as its
--      day heading, because it did new Date('Sunday, April 18' + 'T00:00:00').
--      Live on the public site.
--   2. The public schedule joins panels to the programme by MATCHING THAT
--      STRING against a label it generates. verify_044.sql query D exists for
--      no other reason than to catch a mismatch, because a mismatch does not
--      error — the seminar is silently absent from the schedule.
--   3. Nothing can sort, filter or range-query panels by date.
--
-- A free-text date on a page people plan travel around will misfire again. Two
-- rows exist today, so the backfill risk is as low as it will ever be.
--
-- ZERO-DOWNTIME BY DESIGN. This migration only ADDS. panel_date and panel_time
-- keep working, so the currently-deployed code is unaffected and there is no
-- window in which any page breaks. Order: run 046 → deploy → confirm → run 047.
begin;

alter table panels
  add column if not exists panel_day   date,
  add column if not exists panel_start time;

comment on column panels.panel_day is
  'Real date. Replaces the free-text panel_date, which held a display string and could not be sorted, compared or joined on.';
comment on column panels.panel_start is
  'Real start time. Replaces the free-text panel_time. Ranges like "1:30 PM - 3:00 PM" collapse to their start; end times were never stored separately.';

-- ── Backfill: match the display string against the schedule's own day labels ──
-- Reuses the exact format the public page generates, so anything that WAS
-- matching before matches here. Anything that was not is reported below and is
-- precisely the set that query D was written to find.
--
-- lc_time is pinned for the duration of this transaction. to_char's day and
-- month names are locale-dependent, and the stored strings are English
-- ('Sunday, April 18'). On a database with a non-English lc_time this join
-- would match NOTHING and the backfill would silently do nothing — leaving
-- panel_day null on every row, which reads identically to "there was nothing
-- to migrate". SET LOCAL reverts at commit.
set local lc_time = 'C';

update panels p
   set panel_day = s.day_date
  from (select distinct day_date,
               to_char(day_date, 'FMDay, FMMonth FMDD') as label
          from schedule_items) s
 where p.panel_date = s.label
   and p.panel_day is null;

-- '1:30 PM' or '1:30 PM - 3:00 PM' → 13:30. Start only; no end time was ever
-- stored in a separate column, so nothing is lost that was not already lost.
update panels
   set panel_start = to_timestamp(btrim(split_part(panel_time, '-', 1)), 'HH12:MI AM')::time
 where panel_start is null
   and btrim(split_part(panel_time, '-', 1)) ~ '^\d{1,2}:\d{2}\s*(AM|PM)$';

-- ── Expose BOTH on the public view ──────────────────────────
-- Old columns stay so the live deploy keeps working; new columns are there for
-- the deploy that follows. 047 removes the old pair from both table and view.
--
-- THE NEW COLUMNS ARE APPENDED AT THE END, AND THAT IS NOT A STYLE CHOICE.
-- `create or replace view` compares the new column list POSITIONALLY against
-- the existing one. It may only ADD columns at the end — it cannot reorder,
-- rename or remove. An earlier draft of this migration put panel_day/panel_start
-- next to panel_date/panel_time, where they read better, and Postgres refused:
--
--   42P16: cannot change name of view column "location" to "panel_day"
--
-- which is Postgres saying "position 7 used to be `location` and now it is
-- `panel_day`", not anything about `location` being wrong.
--
-- Appending keeps this a pure `create or replace`: no DROP, so the GRANT
-- survives, and no dependency on this view can be silently destroyed. Column
-- order in a view is cosmetic — every caller selects by name — and 047
-- restores a tidy order once the old pair is gone, which it can do because it
-- drops and recreates.
create or replace view public.panels_public with (security_invoker = false) as
select p.id, p.event_id, p.title, p.description,
       p.panel_date, p.panel_time,          -- deprecated, dropped by 047
       p.location, p.panelists, p.is_free, p.cost, p.signup_type,
       p.max_capacity, p.image_url,
       case when p.signup_type = 'email_host' then p.host_email end as host_email,
       coalesce(sp.sponsor_name, p.presented_by_fallback) as presented_by,
       sp.website  as presented_by_website,
       sp.logo_url as presented_by_logo_url,
       (sp.id is not null) as presented_by_linked,
       -- Appended. Must stay last until 047 drops the deprecated pair.
       p.panel_day, p.panel_start
  from panels p
  left join sponsorships sp
    on sp.id = p.presented_by_sponsorship_id
   and sp.status = 'confirmed'
 where p.is_published = true;

grant select on public.panels_public to anon, authenticated;

commit;


-- ── READ THIS OUTPUT — anything listed did not backfill ─────
-- A row here has a panel_date that matches no schedule day, which means it was
-- ALREADY invisible on /events/schedule before this migration. Fix it in
-- /admin/panels (the new date field) rather than by editing the text.
select id, title, panel_date, panel_time, panel_day, panel_start
  from panels
 where panel_day is null or panel_start is null;
