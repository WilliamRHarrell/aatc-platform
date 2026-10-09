-- Migration 094: save the artist form's "Were you featured on a tattoo TV show?" answer.
--
-- Found in the 2026-10-09 form audit (Ryan asked for every collected field to
-- be saved and visible): /apply/artist asks Yes/No and, on Yes, which show.
-- Only the show's NAME (applications.tv_show, 004) was saved, so "Yes" with
-- the name left empty was recorded as nothing, indistinguishable from "No".
--
-- applications.tv_show_featured:
--   true  - answered Yes (tv_show may still be empty: they did not name it)
--   false - answered No
--   null  - not asked: vendor applications, and artist applications made
--           before this migration whose answer was never stored.
-- Backfill: an existing ARTIST row that named a show answered Yes. A past
-- "No" was never stored, so those rows stay null rather than being guessed.
--
-- Existing policies, enumerated before changing: none change. The column is
-- written by the applicant's own insert ("applications: own insert", table
-- level INSERT for authenticated) and read by admin ("applications: staff
-- read" / admin). It is NOT added to applications_public or the anon column
-- grant (074/075): the directory keeps showing tv_show only.

begin;

alter table public.applications
  add column if not exists tv_show_featured boolean;
comment on column public.applications.tv_show_featured is
  'Artist form: featured on a tattoo TV show? true/false; null = not asked (vendors) or applied before 094. tv_show holds the show name (094).';

update public.applications
   set tv_show_featured = true
 where exhibitor_type = 'artist'
   and tv_show_featured is null
   and coalesce(btrim(tv_show), '') <> '';

commit;
