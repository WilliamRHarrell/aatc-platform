-- ============================================================
-- Migration 056: after-parties image slot
--
-- ONE page-level slug, not one per party. The per-party slots cannot be created
-- yet: PARTIES in src/app/events/after-parties/page.tsx is an empty array,
-- because the venues that used to be listed were invented and were removed. A
-- slug is named after the thing it illustrates, so naming three of them now
-- would mean inventing three party names - the same fabrication that was taken
-- off that page in the first place.
--
-- When Ryan confirms the 2027 nights and venues, add one slug per party in a
-- follow-up. The admin screen needs no change to handle them; only the WHERE
-- map in src/app/admin/page-images/page.tsx.
-- ============================================================

insert into public.page_images (slug) values
  ('after-parties-hero')   -- /events/after-parties, under the header
on conflict (slug) do nothing;

-- want: 1 row, image_path/alt/caption null, active true.
select slug, image_path, alt, caption, active
  from public.page_images where slug = 'after-parties-hero';
