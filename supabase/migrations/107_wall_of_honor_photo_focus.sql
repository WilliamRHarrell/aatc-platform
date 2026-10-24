-- Migration 107: Wall of Honor photo focus points (PR 4, polish).
--
-- Ryan, 2026-10-24 (docs/superpowers/plans/2026-10-24-wall-of-honor-polish.md):
-- the admin picks where each photo's crop centers, so a face is not cut off
-- by the card's fixed aspect ratio. One focus point per photo.
--
-- APPLY ORDER: 104, 105 and 106 must be applied first. This file replaces
-- 105's guard and 105's view and adds a column to 104's table.
--
-- This adds:
--   1. wall_of_honor_entries.photo_focus jsonb NOT NULL default '{}': keyed by
--      the photo's path string (the private and public copies share paths),
--      each value {"x": <0-100>, "y": <0-100>} in percent. A photo with no
--      key uses the default upper-center focus (50/25), applied app-side.
--      Admin-edited, and editable while published: no files change.
--   2. woh_photo_focus_valid(jsonb), immutable, and the CHECK
--      wall_of_honor_entries_photo_focus_valid using it (104's
--      paths_under_folder precedent: a CHECK cannot iterate jsonb by itself).
--      True iff the value is a jsonb object and every value in it is an
--      object whose x and y are both present, both numbers, both in 0..100.
--      Other keys inside a value are not rejected. EXECUTE is revoked from
--      public and anon by name (function-grants.test.ts) and granted to
--      authenticated: a CHECK runs its functions with the WRITER's
--      privileges, so an admin's signed-in write needs it (104 note).
--   3. wall_of_honor_guard, replaced: 105's body unchanged, plus
--      new.photo_focus := old.photo_focus in the non-admin revert list. The
--      revoke-by-name line is repeated (function-grants.test.ts).
--   4. wall_of_honor_public, replaced (CREATE OR REPLACE VIEW, 099/105
--      precedent): the ten 105 columns in the same order and expressions,
--      then photo_focus APPENDED; same join and filter; same
--      security_invoker = false, security_barrier = true; grants re-applied.
--
-- Live view shape (rules.md "replacing a view", the 065/047 lesson): read
-- from the replay of 001-106 (`npm run verify:local -- --dump-schema`,
-- 2026-10-23). 106 did not touch the view, so it is 105's list. The live
-- view must be exactly:
--   id, honoree_name, honoree_rank, branch, unit, service_years,
--   tribute (coalesce(w.tribute_display, w.tribute)),
--   photo_paths (w.public_photo_paths), published_at,
--   event_year ((extract(year from ev.start_date))::integer)
--   from wall_of_honor_entries w join events ev on ev.id = w.event_id
--   where w.is_published; security_invoker=false, security_barrier=true.
-- If production differs (105 not applied, or applied differently), Postgres
-- refuses this file with 42P16 and nothing changes. verify_107 block A pins
-- the result: the ten above plus photo_focus (supersedes verify_105 A's
-- ten-column list, which fails on the new column by design).
--
-- Guard in force (same replay): 105's wall_of_honor_guard (106 did not
-- replace it), BEFORE INSERT OR UPDATE trigger wall_of_honor_guard_trg.
-- Its body is copied below verbatim; the only addition is marked "107".
--
-- Existing policies, enumerated before changing (same replay):
--   wall_of_honor_entries: "wall_of_honor: admin all" ALL to authenticated
--                          is_admin() / is_admin() (104).
--   wall_of_honor_public:  a view (no policies); grants anon, authenticated.
-- No policy is added, dropped or changed.
--
-- Delivered, not applied: Ryan runs this file after 106, then
-- supabase/verify/verify_107.sql.

begin;

-- ── 1-2. the column, its validity function and CHECK ─────────
create or replace function public.woh_photo_focus_valid(p jsonb)
returns boolean language plpgsql immutable
set search_path = public, pg_catalog as $$
declare v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for v in select e.value from jsonb_each(p) e loop
    -- Type checks first, so the numeric casts below never see a non-number.
    if jsonb_typeof(v) is distinct from 'object'
       or jsonb_typeof(v -> 'x') is distinct from 'number'
       or jsonb_typeof(v -> 'y') is distinct from 'number' then
      return false;
    end if;
    if (v ->> 'x')::numeric not between 0 and 100
       or (v ->> 'y')::numeric not between 0 and 100 then
      return false;
    end if;
  end loop;
  return true;
end $$;
-- A CHECK runs its functions with the WRITER's privileges (104 note on
-- paths_under_folder), so a signed-in admin's write needs EXECUTE. It reads
-- no data; anon has no table access and no reason to call it.
revoke execute on function public.woh_photo_focus_valid(jsonb) from public, anon;
grant  execute on function public.woh_photo_focus_valid(jsonb) to authenticated;

alter table public.wall_of_honor_entries
  add column if not exists photo_focus jsonb not null default '{}';

alter table public.wall_of_honor_entries
  drop constraint if exists wall_of_honor_entries_photo_focus_valid;
alter table public.wall_of_honor_entries
  add constraint wall_of_honor_entries_photo_focus_valid check (public.woh_photo_focus_valid(photo_focus));

comment on column public.wall_of_honor_entries.photo_focus is
  'Per-photo crop focus, keyed by the photo''s path string (the private and public copies share paths); each value {"x", "y"} in percent 0-100. No key = the default upper-center focus 50/25, applied app-side. Admin-edited, allowed while published (no files change) (107).';

-- ── 3. the guard ────────────────────────────────────────────
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
    -- 107
    new.photo_focus := old.photo_focus;
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

-- ── 4. the public view: photo_focus appended ─────────────────
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
       extract(year from ev.start_date)::int as event_year,
       -- 107: appended; keyed by path, the public copies share the paths.
       w.photo_focus
  from public.wall_of_honor_entries w
  join public.events ev on ev.id = w.event_id
 where w.is_published;

comment on view public.wall_of_honor_public is
  'Published Wall of Honor entries of every event, permanent across years (105; 104 showed the active event only): honoree fields, the display tribute, public-bucket photo paths, event_year (from the event''s start_date) and photo_focus (per-photo crop focus keyed by path, 107); no submitter data.';

grant select on public.wall_of_honor_public to anon, authenticated;

commit;
