-- ============================================================
-- Migration 078: exhibitors may upload their AATC graphics.
-- Verification: supabase/verify/verify_078.sql and
--               node scripts/verify-graphics-owner.mjs (live, as a non-admin)
--
-- THE BUG (2026-09-25, Ryan, signed in as a non-admin exhibitor): /portal/
-- graphics "new row violates row-level security policy". The page uploads to
-- exhibitor-media/aatc-graphics/<auth.uid()>/<ts>-<tag>.jpg and THEN inserts
-- aatc_submissions. The upload is what fails. Reproduced live with a
-- temporary non-admin user: own-folder upload 403 (RLS), own aatc_submissions
-- insert 201. Pre-existing, not 076: the table policies work; the bucket
-- never had an owner policy for this prefix.
--
-- POLICIES ENUMERATED BEFORE WRITING (storage.objects, bucket exhibitor-media):
--   "exhibitor-media: public read"            SELECT (009)
--   "exhibitor-media: admin insert"           INSERT to authenticated, is_admin (009)
--   "exhibitor-media: admin delete"           DELETE to authenticated, is_admin (009)
--   "exhibitor-media: own profile insert"     INSERT to authenticated, profiles/<uid>/ (048)
--   "exhibitor-media: own profile update"     UPDATE to authenticated, profiles/<uid>/ (048)
--   "exhibitor-media: own profile delete"     DELETE to authenticated, profiles/<uid>/ (048)
-- 048's comment says the owner policy deliberately keeps exhibitors out of
-- `aatc-graphics` - written before /portal/graphics existed. NEW below, same
-- shape as 048: INSERT only, scoped to aatc-graphics/<own uid>/. No update
-- (the page uses upsert: false) and no delete (submissions are reviewed by
-- admins; a withdrawn graphic is an admin action).
-- ============================================================
begin;

drop policy if exists "exhibitor-media: own aatc-graphics insert" on storage.objects;
create policy "exhibitor-media: own aatc-graphics insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'exhibitor-media'
    and (storage.foldername(name))[1] = 'aatc-graphics'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

commit;
