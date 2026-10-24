-- ============================================================
-- Migration 108: Food Truck Rodeo title-logo slot
--
-- Ryan, 2026-10-24: /events/food-truck-rodeo replaces its "Food Truck Rodeo"
-- heading text with a logo (white on transparent, 2123x507) from the new
-- 'food-truck-rodeo-title' page-images slot. The page keeps a real <h1>: the
-- slot's alt text becomes the heading for screen readers and SEO, and while
-- the slot is empty (or this migration is unapplied) the page falls back to
-- the current text heading, so the apply order is flexible.
--
-- Same shape as 056/058: one slug row, filled later in /admin/page-images
-- (the WHERE map there gains this slug in the same PR). Ryan uploads the
-- logo after merge; the alt should read "All American Food Truck Rodeo".
--
-- POLICIES: none touched. page_images keeps 050's policies; the alt-required
-- CHECK (050) already guards this row once an image is set.
-- ============================================================

insert into public.page_images (slug) values
  ('food-truck-rodeo-title')  -- /events/food-truck-rodeo, in place of the h1 text
on conflict (slug) do nothing;

-- want: 1 row, image_path/alt/caption null, active true.
select slug, image_path, alt, caption, active
  from public.page_images where slug = 'food-truck-rodeo-title';
