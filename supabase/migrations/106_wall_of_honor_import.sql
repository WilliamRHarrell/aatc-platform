-- Migration 106: Wall of Honor WordPress import (PR 3 of 3), schema side.
--
-- Ryan, 2026-10-23/24 (docs/superpowers/plans/2026-10-23-wall-of-honor-import.md):
-- the entries collected on WordPress before the new form are imported. Those
-- rows often lack the branch and the submitter's name, relationship and
-- email: WordPress did not ask for them every year. The import stores the
-- empty string for a field it does not have (never an invented value), so no
-- column type or nullability changes and the view stays as 105 left it. Ryan
-- fills the branch in the admin console before he publishes an imported row.
--
-- APPLY ORDER: 104 and 105 must be applied first (this file drops and
-- recreates 104's constraints by name and reads 105's imported_at column).
--
-- BEFORE APPLYING: submitter_relationship is newly required at the database
-- for form rows (104 did not CHECK it), so one live form row with it empty
-- would roll this whole file back. Run this first and fix any rows it returns:
--   select id, honoree_name from public.wall_of_honor_entries
--   where imported_at is null and btrim(submitter_relationship) = '';
-- branch, submitter_name and submitter_email need no check: 104 already
-- enforced them, so no live row can be empty there.
--
-- This changes:
--   1. wall_of_honor_entries_nonempty (104), dropped and recreated by name:
--      honoree_name and tribute stay required for EVERY row, imported or not.
--   2. Four new CHECKs, one per relaxed column: branch, submitter_name,
--      submitter_relationship and submitter_email must be nonempty unless the
--      row is imported (imported_at is not null). A form row (imported_at
--      null) is exactly as strict as before for branch, submitter_name and
--      submitter_email; submitter_relationship is newly required for it too
--      (the form already requires it: src/lib/wall-of-honor-submission.ts).
--      imported_at itself is guard-protected from non-admins (105), so a
--      signed-in non-admin cannot relax a row by setting it.
--      104's partial unique index (event_id, lower(submitter_email),
--      lower(btrim(honoree_name))) on pending/approved rows still covers
--      imported rows: two imports on one event with the same honoree name and
--      an empty email collide (the Task 3 importer relies on this).
--   3. wall_of_honor_entries_publish_check (104), dropped and recreated by
--      name: published also requires a nonempty branch, so an imported row
--      cannot go public with the branch unknown.
--   4. Three past events the imported entries belong to, inactive, inserted
--      only when no event of that name exists. Only the named columns are
--      set; registration_open_date stays null and every other column keeps
--      its default.
--
-- Constraints replaced, enumerated before changing (replay of 001-105, `npm
-- run verify:local -- --dump-schema`, 2026-10-23):
--   wall_of_honor_entries_nonempty CHECK (((btrim(honoree_name) <> ''::text)
--     AND (btrim(branch) <> ''::text) AND (btrim(tribute) <> ''::text)
--     AND (btrim(submitter_name) <> ''::text) AND (btrim(submitter_email) <> ''::text)))
--   wall_of_honor_entries_publish_check CHECK (((NOT is_published) OR
--     ((status = 'approved'::text) AND (cardinality(public_photo_paths) >= 1))))
-- Untouched: wall_of_honor_entries_status_check, _photos_max,
-- _public_photos_max, _photo_paths_in_own_folder. No policy, function, view
-- or column is added, dropped or changed.
--
-- Delivered, not applied: Ryan runs this file after 105, then
-- supabase/verify/verify_106.sql.

begin;

-- ── 1-3. the CHECKs ─────────────────────────────────────────
alter table public.wall_of_honor_entries
  drop constraint if exists wall_of_honor_entries_nonempty,
  drop constraint if exists wall_of_honor_entries_branch_nonempty,
  drop constraint if exists wall_of_honor_entries_submitter_name_nonempty,
  drop constraint if exists wall_of_honor_entries_submitter_relationship_nonempty,
  drop constraint if exists wall_of_honor_entries_submitter_email_nonempty,
  drop constraint if exists wall_of_honor_entries_publish_check;

alter table public.wall_of_honor_entries
  -- every row, imported or not
  add constraint wall_of_honor_entries_nonempty check (
    btrim(honoree_name) <> '' and btrim(tribute) <> ''),
  -- a form row needs them; an imported WordPress row may not have them ('')
  add constraint wall_of_honor_entries_branch_nonempty check (
    imported_at is not null or btrim(branch) <> ''),
  add constraint wall_of_honor_entries_submitter_name_nonempty check (
    imported_at is not null or btrim(submitter_name) <> ''),
  add constraint wall_of_honor_entries_submitter_relationship_nonempty check (
    imported_at is not null or btrim(submitter_relationship) <> ''),
  add constraint wall_of_honor_entries_submitter_email_nonempty check (
    imported_at is not null or btrim(submitter_email) <> ''),
  -- published only while approved, with a public photo and a known branch
  add constraint wall_of_honor_entries_publish_check check (
    not is_published or (status = 'approved' and cardinality(public_photo_paths) >= 1 and btrim(branch) <> ''));

-- ── 4. the past events the imported entries belong to ───────
-- Values from Ryan, 2026-10-23/24, verbatim. Inactive: the 2027 event stays the active one.
insert into public.events (name, venue, city, state, start_date, end_date, registration_open_date, is_active)
select 'AATC 2025 East', 'Crown Complex', 'Fayetteville', 'NC', date '2025-04-11', date '2025-04-13', null, false
where not exists (select 1 from public.events where name = 'AATC 2025 East');

insert into public.events (name, venue, city, state, start_date, end_date, registration_open_date, is_active)
select 'AATC 2025 West', 'Greater Tacoma Convention Center', 'Tacoma', 'WA', date '2025-09-12', date '2025-09-14', null, false
where not exists (select 1 from public.events where name = 'AATC 2025 West');

insert into public.events (name, venue, city, state, start_date, end_date, registration_open_date, is_active)
select 'AATC 2026 East', 'Crown Complex', 'Fayetteville', 'NC', date '2026-04-17', date '2026-04-19', null, false
where not exists (select 1 from public.events where name = 'AATC 2026 East');

commit;
