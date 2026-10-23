-- Migration 105: Wall of Honor is permanent across years (PR 2 of 3).
--
-- Ryan, 2026-10-23 (docs/superpowers/plans/2026-10-23-wall-of-honor-publish.md):
-- a published tribute stays on the wall after its event ends. The public view
-- no longer filters to the active event and carries the event's year so the
-- page can group by year.
--
-- APPLY ORDER: 104 must be applied first. This file replaces 104's function
-- and view and adds columns to 104's table.
--
-- This adds:
--   1. wall_of_honor_entries.imported_at: set only by the PR 3 WordPress
--      import; rows with it never get the publish email.
--      wall_of_honor_entries.published_email_sent_at: set by the publish route
--      after the first-publish email sends.
--   2. wall_of_honor_guard, replaced: 104's body unchanged, plus in the UPDATE
--      arm (after the non-admin revert, so it acts on the final is_published):
--        - false -> true of is_published stamps
--          published_at := coalesce(old.published_at, now()) (first publish
--          time; a republish keeps it);
--        - while is_published is false, published_at := old.published_at
--          (unpublish never clears it).
--      The non-admin revert list gains imported_at and published_email_sent_at.
--      The revoke-by-name line is repeated (function-grants.test.ts).
--   3. wall_of_honor_public, replaced (CREATE OR REPLACE VIEW, 099 precedent):
--      the nine 104 columns in the same order, then event_year APPENDED; the
--      join drops "and ev.is_active"; "where w.is_published" stays; same
--      security_invoker = false, security_barrier = true; grants re-applied.
--
-- Live view shape (rules.md "replacing a view", the 065/047 lesson): read
-- from the replay of 001-104 (`npm run verify:local -- --dump-schema`,
-- 2026-10-23), which is 104's list. The live view must be exactly:
--   id, honoree_name, honoree_rank, branch, unit, service_years, tribute,
--   photo_paths, published_at
-- If production differs (104 not applied, or applied differently), Postgres
-- refuses this file with 42P16 and nothing changes. verify_105 block A pins
-- the result: the nine above plus event_year (supersedes verify_104 C1 and C4, which describe
-- 104's active-event-only visibility).
--
-- Existing policies, enumerated before changing (replay of 001-104, `npm run
-- verify:local -- --dump-schema`, 2026-10-23):
--   wall_of_honor_entries: "wall_of_honor: admin all" ALL to authenticated
--                          is_admin() / is_admin() (104).
--   events:                "events: admin write" ALL to authenticated
--                          is_admin(), "events: public read" SELECT true.
--   wall_of_honor_public:  a view (no policies); grants anon, authenticated.
--   storage.objects:       untouched by this file.
-- No policy is added, dropped or changed.
--
-- Delivered, not applied: Ryan runs this file after 104, then
-- supabase/verify/verify_105.sql.

begin;

-- ── 1. the new columns ──────────────────────────────────────
alter table public.wall_of_honor_entries
  add column if not exists imported_at timestamptz,
  add column if not exists published_email_sent_at timestamptz;

comment on column public.wall_of_honor_entries.imported_at is
  'Set only by the PR 3 WordPress import; NULL = submitted through the form. Rows with it never get the publish email (105).';
comment on column public.wall_of_honor_entries.published_email_sent_at is
  'Set by the publish route after the first-publish email sends; NULL = not sent (105).';
comment on column public.wall_of_honor_entries.published_at is
  'First publish time, stamped by wall_of_honor_guard on false -> true; a republish keeps it and an unpublish never clears it (105).';

-- ── 2. the guard ────────────────────────────────────────────
create or replace function public.wall_of_honor_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
-- coalesce: an unset setting reads NULL. auth.uid() is null is load-bearing:
-- a signed-in session, an admin's included, never gets the import path.
declare v_import boolean := auth.uid() is null and coalesce(current_setting('aatc.woh_import', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_import then new.consent_at := now(); end if;
    -- Belt and braces: no policy lets a non-admin insert.
    if auth.uid() is not null and not public.is_admin() then
      new.status := 'pending';
      new.is_published := false;
      new.published_at := null;
      new.decided_at := null;
      new.decided_by := null;
      new.admin_notes := null;
      new.tribute_display := null;
      new.public_photo_paths := '{}';
    end if;
    return new;
  end if;

  new.tribute        := old.tribute;
  new.consent_at     := old.consent_at;
  new.consent_social := old.consent_social;
  new.submitted_at   := old.submitted_at;
  if auth.uid() is not null and not public.is_admin() then
    new.status             := old.status;
    new.is_published       := old.is_published;
    new.published_at       := old.published_at;
    new.decided_at         := old.decided_at;
    new.decided_by         := old.decided_by;
    new.admin_notes        := old.admin_notes;
    new.tribute_display    := old.tribute_display;
    new.include_in_print   := old.include_in_print;
    new.public_photo_paths := old.public_photo_paths;
    -- 105
    new.imported_at             := old.imported_at;
    new.published_email_sent_at := old.published_email_sent_at;
  end if;
  -- 105: published_at is the FIRST publish time. A publish stamps it once;
  -- a republish keeps it; an unpublish never clears it.
  if new.is_published and not old.is_published then
    new.published_at := coalesce(old.published_at, now());
  elsif not new.is_published then
    new.published_at := old.published_at;
  end if;
  return new;
end $$;
revoke execute on function public.wall_of_honor_guard() from public, anon, authenticated;

-- ── 3. the public view: every year, not just the active event ─
create or replace view public.wall_of_honor_public with (security_invoker = false, security_barrier = true) as
select w.id,
       w.honoree_name,
       w.honoree_rank,
       w.branch,
       w.unit,
       w.service_years,
       coalesce(w.tribute_display, w.tribute) as tribute,
       w.public_photo_paths as photo_paths,
       w.published_at,
       -- 105: appended; the year derives from the event row.
       extract(year from ev.start_date)::int as event_year
  from public.wall_of_honor_entries w
  join public.events ev on ev.id = w.event_id
 where w.is_published;

comment on view public.wall_of_honor_public is
  'Published Wall of Honor entries of every event, permanent across years (105; 104 showed the active event only): honoree fields, the display tribute, public-bucket photo paths and event_year (from the event''s start_date); no submitter data.';

grant select on public.wall_of_honor_public to anon, authenticated;

commit;
