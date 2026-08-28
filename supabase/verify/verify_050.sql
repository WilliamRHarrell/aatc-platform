-- ============================================================
-- ⚠  RUN ONE LETTERED BLOCK AT A TIME - DO NOT RUN THIS FILE WHOLE.
--
-- The Supabase SQL Editor displays only the LAST statement's result. Running
-- the whole file returns the final query and silently discards every check
-- above it, which looks exactly like a file that only ever had one check in
-- it. Nothing errors; the other results simply never appear.
-- ============================================================

-- ============================================================
-- VERIFY 050 - run after the migration. Nothing mutates.
-- ============================================================

-- ── A. bucket exists, public, 10 MB, three MIME types
--    want: page-images | t | 10485760 | {image/jpeg,image/png,image/webp}
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets
 where id = 'page-images';

-- ── B. the three slugs exist and are EMPTY
--    want: 3 rows, image_path/alt/caption all null, active = t.
--    Any non-null content here means something seeded copy that nobody wrote.
select slug, image_path, alt, caption, active
  from public.page_images
 order by slug;

-- ── C. the alt constraint actually bites (2 queries)
--    C1 of 2 - want: ERROR 23514 page_images_alt_required_with_image.
--    If this INSERTS instead of failing, the constraint is not doing its job
--    and an image with no alt text can reach the site.
insert into public.page_images (slug, image_path, alt)
values ('zz-constraint-probe', 'probe.webp', '   ');

--    C2 of 2 - want: 0 rows. Cleans up if C1 wrongly succeeded.
delete from public.page_images where slug = 'zz-constraint-probe'
returning slug;

-- ── D. alt WITHOUT an image is still allowed (2 queries)
--    D1 of 2 - want: 1 row. A slug may be prepared before the upload.
insert into public.page_images (slug, alt) values ('zz-altonly-probe', 'prepared')
returning slug, image_path, alt;

--    D2 of 2 - want: 1 row deleted.
delete from public.page_images where slug = 'zz-altonly-probe' returning slug;

-- ── E. RLS is on and the policies are the two expected ones
--    want: rowsecurity = t, then exactly 2 policies:
--          "admins write page images" (ALL)  and
--          "anyone reads active page images" (SELECT)
select relrowsecurity as rowsecurity
  from pg_class where oid = 'public.page_images'::regclass;

-- ── F. policy list
--    want: 2 rows as described in E.
select policyname, cmd, roles::text
  from pg_policies
 where schemaname = 'public' and tablename = 'page_images'
 order by policyname;

-- ── G. public read is narrowed to active rows
--    Run as the ANON role. want: 0 rows - an inactive row must be invisible to
--    anon, not merely hidden in the UI.
--    (Deactivate one first, then re-activate; both statements below.)
--    G1 of 3
update public.page_images set active = false where slug = 'schedule-hero'
returning slug, active;

--    G2 of 3 - want: 0 rows.
set local role anon;
select slug from public.page_images where slug = 'schedule-hero';
reset role;

--    G3 of 3 - restore. want: active = t.
update public.page_images set active = true where slug = 'schedule-hero'
returning slug, active;

-- ── H. updated_at trigger is wired to the shared function, not a second one
--    want: 1 row, page_images_updated_at -> handle_updated_at
select t.tgname, p.proname
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.page_images'::regclass
   and not t.tgisinternal;

-- ── I. storage policies mirror 018
--    want: 4 rows for page-images (read/insert/update/delete).
select policyname, cmd
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname ilike '%page images%'
 order by policyname;
