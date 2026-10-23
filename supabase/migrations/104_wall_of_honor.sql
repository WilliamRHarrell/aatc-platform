-- Migration 104: Wall of Honor submissions (PR 1 of 3).
--
-- Ryan, 2026-10-22 (docs/superpowers/plans/2026-10-22-wall-of-honor-submissions.md):
-- Gold Star families submit a tribute to a fallen service member online at
-- /info/wall-of-honor/submit. Nothing is public until an admin approves AND
-- publishes it on /admin/wall-of-honor (PR 2). PR 3 imports the entries
-- already collected on WordPress.
--
-- This adds:
--   1. public.wall_of_honor_entries: the honoree, the tribute as submitted
--      (immutable) and an optional edited tribute_display, up to 3 photos in
--      the private bucket (photo_paths) and up to 3 approved copies in the
--      public bucket (public_photo_paths), the submitter (never public),
--      consent and the admin decision.
--   2. paths_under_folder(): every photo path must sit in the entry's own
--      folder, <entry id>/... (a CHECK cannot subquery an array by itself).
--   3. A publish invariant: published only while approved and with at least
--      one public photo.
--   4. One active entry per submitter email per honoree per event (pending or
--      approved), as a partial unique index. A rejected or withdrawn entry
--      does not block a resubmit; a different email is never blocked.
--   5. wall_of_honor_guard (BEFORE INSERT OR UPDATE): consent_at is the
--      DATABASE clock on every insert (076's rule), except the PR 3 import:
--      trusted only when auth.uid() is null AND aatc.woh_import = 'on', so no
--      signed-in session, an admin's included, can backdate consent. The
--      original tribute, consent and submitted_at never change on update; a
--      non-admin signed-in writer keeps the decision and publish columns
--      (090/091 staff-column pattern).
--   6. RLS: admins only ("wall_of_honor: admin all"; decision 8, not content
--      editors). The form inserts through the server route with the service
--      role. anon has no table privilege at all (permission denied, not an
--      empty set).
--   7. public.wall_of_honor_public: the published entries of the active
--      event, honoree fields only (099 security-barrier view pattern).
--   8. events.wall_of_honor_open (default OFF).
--   9. Buckets: wall-of-honor-submissions (private, admin read only; uploads
--      arrive only through signed upload URLs from the route) and
--      wall-of-honor (public; only the service role writes it, on publish).
--
-- Existing policies, enumerated before changing (replay of 001-103, `npm run
-- verify:local -- --dump-schema` and pg_policies on the replay, 2026-10-22):
--   events:          "events: admin write" ALL to authenticated is_admin(),
--                    "events: public read" SELECT true.
--   storage.objects: no policy mentions wall-of-honor (both buckets are new).
-- Added: the one table policy above and one storage policy,
-- "wall-of-honor-submissions: admin read". No existing policy is dropped or
-- changed.
--
-- Delivered, not applied: Ryan runs this file, then supabase/verify/verify_104.sql.

begin;

-- ── 1-2. the table, and photo paths in the entry's own folder ─
create or replace function public.paths_under_folder(p_paths text[], p_folder text)
returns boolean language sql immutable
set search_path = public, pg_catalog as $$
  select coalesce((select bool_and(p like p_folder || '/%') from unnest(p_paths) p), true)
$$;
-- A CHECK runs its functions with the WRITER's privileges, so an admin's
-- signed-in write needs EXECUTE here (verify_104 B3 failed without it). It
-- reads no data; anon has no table access and no reason to call it.
revoke execute on function public.paths_under_folder(text[], text) from public, anon;
grant  execute on function public.paths_under_folder(text[], text) to authenticated;

create table if not exists public.wall_of_honor_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  status text not null default 'pending'
    constraint wall_of_honor_entries_status_check check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  is_published boolean not null default false,
  published_at timestamptz,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  admin_notes text,
  -- the honoree
  honoree_name text not null,
  honoree_rank text,
  branch text not null,
  unit text,
  service_years text,
  tribute text not null,
  tribute_display text,
  -- photos
  photo_paths text[] not null default '{}',
  public_photo_paths text[] not null default '{}',
  -- the submitter (never public)
  submitter_name text not null,
  submitter_relationship text not null,
  submitter_email text not null,
  submitter_phone text,
  -- consent and print
  consent_at timestamptz not null default now(),
  consent_social boolean not null default false,
  include_in_print boolean not null default true,
  constraint wall_of_honor_entries_photos_max check (cardinality(photo_paths) <= 3),
  constraint wall_of_honor_entries_public_photos_max check (cardinality(public_photo_paths) <= 3),
  constraint wall_of_honor_entries_nonempty check (
    btrim(honoree_name) <> '' and btrim(branch) <> '' and btrim(tribute) <> ''
    and btrim(submitter_name) <> '' and btrim(submitter_email) <> ''),
  constraint wall_of_honor_entries_photo_paths_in_own_folder check (
    public.paths_under_folder(photo_paths, id::text) and public.paths_under_folder(public_photo_paths, id::text)),
  -- ── 3. the publish invariant ──
  constraint wall_of_honor_entries_publish_check check (
    not is_published or (status = 'approved' and cardinality(public_photo_paths) >= 1))
);

comment on table public.wall_of_honor_entries is
  'Wall of Honor tributes submitted by Gold Star families (104). Admin only; the public reads wall_of_honor_public.';
comment on column public.wall_of_honor_entries.status is
  'pending (submitted) / approved / rejected / withdrawn. Admin only. Public only when approved AND is_published (104).';
comment on column public.wall_of_honor_entries.tribute is
  'The tribute exactly as the family submitted it. Never changes, not even for an admin (104).';
comment on column public.wall_of_honor_entries.tribute_display is
  'Admin-edited tribute shown publicly instead of tribute when set; NULL shows tribute as submitted (104).';
comment on column public.wall_of_honor_entries.photo_paths is
  'Up to 3 submitted photos in the PRIVATE wall-of-honor-submissions bucket at <entry id>/... (104).';
comment on column public.wall_of_honor_entries.public_photo_paths is
  'Up to 3 approved photos copied to the PUBLIC wall-of-honor bucket at <entry id>/... on publish (104).';
comment on column public.wall_of_honor_entries.consent_at is
  'Database clock at submission (wall_of_honor_guard). Only the trusted WordPress import keeps a supplied value (104).';

-- ── 4. one active entry per submitter and honoree ───────────
create unique index if not exists wall_of_honor_one_active_per_submitter_honoree
  on public.wall_of_honor_entries (event_id, lower(submitter_email), lower(btrim(honoree_name)))
  where status in ('pending', 'approved');

-- ── 5. the guard ────────────────────────────────────────────
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
  end if;
  return new;
end $$;
drop trigger if exists wall_of_honor_guard_trg on public.wall_of_honor_entries;
create trigger wall_of_honor_guard_trg
  before insert or update on public.wall_of_honor_entries
  for each row execute function public.wall_of_honor_guard();
revoke execute on function public.wall_of_honor_guard() from public, anon, authenticated;

-- ── 6. RLS: admins only ─────────────────────────────────────
alter table public.wall_of_honor_entries enable row level security;
drop policy if exists "wall_of_honor: admin all" on public.wall_of_honor_entries;
create policy "wall_of_honor: admin all"
  on public.wall_of_honor_entries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.wall_of_honor_entries from anon;

-- ── 7. the public view ──────────────────────────────────────
create or replace view public.wall_of_honor_public with (security_invoker = false, security_barrier = true) as
select w.id,
       w.honoree_name,
       w.honoree_rank,
       w.branch,
       w.unit,
       w.service_years,
       coalesce(w.tribute_display, w.tribute) as tribute,
       w.public_photo_paths as photo_paths,
       w.published_at
  from public.wall_of_honor_entries w
  join public.events ev on ev.id = w.event_id and ev.is_active
 where w.is_published;

comment on view public.wall_of_honor_public is
  'Published Wall of Honor entries of the active event (104): honoree fields, the display tribute and public-bucket photo paths only; no submitter data.';

grant select on public.wall_of_honor_public to anon, authenticated;

-- ── 8. the switch ───────────────────────────────────────────
alter table public.events
  add column if not exists wall_of_honor_open boolean not null default false;
comment on column public.events.wall_of_honor_open is
  'The Wall of Honor form and its route read it; toggled on /admin/wall-of-honor. Stays off until the WAF rule is verified (104).';

-- ── 9. buckets ──────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall-of-honor-submissions', 'wall-of-honor-submissions', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall-of-honor', 'wall-of-honor', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Submitted photos: an admin reads them; nobody else. No INSERT/UPDATE/DELETE
-- policy: uploads arrive only through signed upload URLs from the route.
-- The public wall-of-honor bucket has no policy: only the service role writes it.
drop policy if exists "wall-of-honor-submissions: admin read" on storage.objects;
create policy "wall-of-honor-submissions: admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'wall-of-honor-submissions' and public.is_admin());

commit;
