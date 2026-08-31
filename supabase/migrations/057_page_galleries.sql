-- ============================================================
-- Migration 057: page_galleries
--
-- Ordered image collections keyed by a gallery slug. Serves the About gallery
-- and the Kids contest gallery, and every gallery after them - which is why it
-- is one table rather than two features.
--
-- DIFFERENT FROM page_images, and the distinction is the point:
--   page_images     one fixed SLOT on a page. Rows created by migration, filled
--                   by an admin. A slug maps to a position in the layout.
--   page_galleries  MANY rows per slug, ordered, added and removed freely. The
--                   gallery slug maps to a position; the rows are its contents.
--
-- Reuses the page-images BUCKET rather than creating a second one. Its storage
-- policies (054) already grant admin and content_editor insert, update and
-- delete, and a second bucket would mean a second set of policies to keep in
-- step with the first.
--
-- Requires 050 (bucket) and 054 (has_role editorial policies).
-- ============================================================

create table if not exists public.page_galleries (
  id            uuid primary key default gen_random_uuid(),
  gallery_slug  text        not null,
  image_path    text        not null,
  -- NOT NULL here, unlike page_images where it is conditional. A page_images
  -- row can exist with no image; a gallery row IS an image, so there is no
  -- state in which alt text is legitimately absent. The invalid state is
  -- unreachable rather than merely detectable.
  alt           text        not null check (length(trim(alt)) > 0),
  caption       text,
  sort_order    int         not null default 0,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_page_galleries_slug_order
  on public.page_galleries (gallery_slug, sort_order, created_at);

-- One row per file per gallery. Re-uploading the same object path is a mistake,
-- not an intent.
create unique index if not exists uq_page_galleries_slug_path
  on public.page_galleries (gallery_slug, image_path);

drop trigger if exists page_galleries_updated_at on public.page_galleries;
create trigger page_galleries_updated_at
  before update on public.page_galleries
  for each row execute function public.handle_updated_at();

alter table public.page_galleries enable row level security;

-- Public read is narrowed to active rows, same reasoning as page_images:
-- hiding an image must withdraw it, not merely stop rendering it while it
-- stays readable with the anon key.
drop policy if exists "anyone reads active gallery images" on public.page_galleries;
create policy "anyone reads active gallery images" on public.page_galleries
  for select to anon, authenticated
  using (active = true);

drop policy if exists "page_galleries: editorial write" on public.page_galleries;
create policy "page_galleries: editorial write" on public.page_galleries
  for all to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

comment on table public.page_galleries is
  'Ordered image collections keyed by gallery_slug. Rows are added by an admin, unlike page_images whose rows are created by migration. alt is NOT NULL because a gallery row is an image.';
