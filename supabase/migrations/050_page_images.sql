-- ============================================================
-- Migration 050: page_images
--
-- Slug-keyed image slots for editorial pages. Ryan uploads through the admin;
-- the migration creates the slugs but never the content.
--
-- Modelled on 018_panel_images.sql for the bucket and storage policies, and on
-- 026_page_content.sql for the table shape. Two deliberate departures from
-- those files, both explained below: is_admin() instead of an inline profiles
-- subquery, and a check constraint on alt text.
-- ============================================================

-- ── bucket ──────────────────────────────────────────────────
-- 10 MB rather than panel-images' 5 MB: these are hero and background images,
-- not headshots, so this matches contest-photos instead.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('page-images', 'page-images', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ── table ───────────────────────────────────────────────────
create table if not exists public.page_images (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  image_path  text,                       -- storage object path within page-images
  alt         text,
  caption     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- An image with no alt text is unsavable, not merely discouraged. The row
  -- feeds an <img alt>, and the failure mode is silent: a missing alt looks
  -- perfect to everyone except the person relying on a screen reader. This is
  -- the same class of defect as the harness sponsor announcing itself as
  -- "ZZ TEST - RLS Harness (DELETE ME)" on every page of the site.
  --
  -- Deliberately permits alt with no image_path, so a slug can be prepared
  -- before the upload.
  constraint page_images_alt_required_with_image
    check (image_path is null or (alt is not null and length(trim(alt)) > 0))
);

-- Reuses handle_updated_at() from migration 001. Spec said not to introduce a
-- second mechanism, and there is exactly one.
drop trigger if exists page_images_updated_at on public.page_images;
create trigger page_images_updated_at
  before update on public.page_images
  for each row execute function public.handle_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.page_images enable row level security;

-- Public read is narrowed to active rows, unlike page_content's `using (true)`.
-- Deactivating an image must actually withdraw it, not merely hide it in the UI
-- while it stays readable with the anon key.
drop policy if exists "anyone reads active page images" on public.page_images;
create policy "anyone reads active page images" on public.page_images
  for select
  to anon, authenticated
  using (active = true);

-- Admin write. is_admin() rather than 026's inline
-- `exists (select 1 from profiles ...)`: it is SECURITY DEFINER with a pinned
-- search_path (migration 027), which is what stops search_path shadowing, and
-- it keeps the policy from re-entering profiles inline - the shape behind the
-- 42P17 recursion in 027/028.
--
-- NOTE for review: scoped to admin exactly as specified. Migration 039 added a
-- `content_editor` role, and page_images is editorial content, so this may be
-- narrower than intended. Widening is a one-line change to
-- has_role(array['admin','content_editor']) - deliberately not done here,
-- because quietly granting write access is not a decision a migration should
-- make on its own.
drop policy if exists "admins write page images" on public.page_images;
create policy "admins write page images" on public.page_images
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── seed: slugs only, no content ────────────────────────────
-- image_path, alt and caption are left null on purpose. Inventing copy here
-- would put words on the site that nobody wrote.
insert into public.page_images (slug) values
  ('schedule-hero'),    -- /events/schedule, under the hero
  ('pinup-entry'),      -- /events/pinup-contest, above the entry form
  ('contest-prizes')    -- /events/tattoo-contests, prizes section
on conflict (slug) do nothing;

comment on table public.page_images is
  'Slug-keyed image slots for editorial pages. Rows are created by migration; image_path, alt and caption are set by an admin. A slot with no image_path renders nothing at all.';

-- ── storage policies (mirrors 018) ──────────────────────────
drop policy if exists "Public can read page images" on storage.objects;
create policy "Public can read page images"
  on storage.objects for select
  using (bucket_id = 'page-images');

drop policy if exists "Admin can insert page images" on storage.objects;
create policy "Admin can insert page images"
  on storage.objects for insert
  with check (bucket_id = 'page-images' and public.is_admin());

drop policy if exists "Admin can update page images" on storage.objects;
create policy "Admin can update page images"
  on storage.objects for update
  using (bucket_id = 'page-images' and public.is_admin());

drop policy if exists "Admin can delete page images" on storage.objects;
create policy "Admin can delete page images"
  on storage.objects for delete
  using (bucket_id = 'page-images' and public.is_admin());
