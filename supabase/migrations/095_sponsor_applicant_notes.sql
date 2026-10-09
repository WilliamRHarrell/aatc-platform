-- Migration 095: keep what a sponsor writes on /apply/sponsor apart from staff notes.
--
-- Found in the 2026-10-09 form audit: the public form's "notes" were saved
-- into sponsorships.notes, the same field /admin/sponsorships edits as
-- "Internal notes...". Applicant text and staff notes mixed, and an admin
-- edit overwrote what the sponsor wrote. Ryan, 2026-10-09: separate them.
--
-- sponsorships.applicant_notes: written once by /api/sponsor-apply (service
-- role), shown read-only in admin. sponsorships.notes stays the internal note.
--
-- NO DATA IS MOVED. Ryan's rule: rows submitted through the public form move
-- their notes to applicant_notes; rows created in admin keep theirs. Read
-- from production 2026-10-09: 12 sponsorships, all created on or before
-- 2026-09-01; none since /api/sponsor-apply became the form's only writer
-- (2026-09-25). The 4 with notes (Tattoo Goo, Nomadica, two ZZ RLS-harness
-- fixtures) are staff-written. So the "move" group is empty; all keep notes.
--
-- Existing policies, enumerated before changing: none change. The column is
-- protected from sponsor edits by default: 049's sponsorships_protect_
-- commercial_columns is an ALLOW-list (contact, website, socials, logo), so a
-- new column is restored from OLD for any non-admin update. It is not added
-- to sponsors_public.

begin;

alter table public.sponsorships
  add column if not exists applicant_notes text;
comment on column public.sponsorships.applicant_notes is
  'What the sponsor wrote on /apply/sponsor (095). Read-only in admin; staff notes stay in notes.';

commit;
