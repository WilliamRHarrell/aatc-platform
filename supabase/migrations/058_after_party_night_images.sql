-- ============================================================
-- Migration 058: one image slot per after-party night
--
-- Ryan confirmed the nights on 2026-08-31: THURSDAY, FRIDAY, SATURDAY.
-- Thursday April 15 is a kickoff BEFORE the convention opens; the show itself
-- runs Friday to Sunday, April 16-18. There is no Sunday after party.
--
-- 056 deliberately created only a page-level slug, because naming per-party
-- slots would have meant inventing party names while the nights were unknown.
-- These are named after NIGHTS, not venues, so nothing is invented - Thursday
-- is a fact whether or not a venue is ever booked.
--
-- A SEPARATE MIGRATION rather than an edit to 056, because 056 may already have
-- been pasted into the SQL editor. Editing a migration someone is midway
-- through running is how you end up with a database that matches neither
-- version of the file.
--
-- Venues, acts, door prices and times remain UNCONFIRMED and are not stored
-- anywhere. The previous set of those on that page was invented and removed.
-- ============================================================

insert into public.page_images (slug) values
  ('after-party-thursday'),   -- /events/after-parties, Thursday card
  ('after-party-friday'),     -- /events/after-parties, Friday card
  ('after-party-saturday')    -- /events/after-parties, Saturday card
on conflict (slug) do nothing;

-- want: 4 rows - the three nights plus after-parties-hero from 056 - all with
-- image_path, alt and caption null, and active true.
select slug, image_path, alt, caption, active
  from public.page_images
 where slug like 'after-part%'
 order by slug;
