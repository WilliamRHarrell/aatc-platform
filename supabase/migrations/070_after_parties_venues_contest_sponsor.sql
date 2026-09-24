-- ============================================================
-- Migration 070: venues, after parties on the programme, per-contest sponsor.
--
-- 1. `venues`: the places after parties happen. Public read (nothing private
--    lives here), editorial write. `logo_slot` points at a page_images slug so
--    the logo is uploaded through the existing page-images admin.
-- 2. `schedule_items.venue_id` (nullable FK), the `after_party` kind, and
--    `start_time` made NULLABLE with a check that a PUBLISHED row always has a
--    time. Unpublished rows never reach the public view, so a null time can
--    never render. "Make the invalid state unreachable": a published row with
--    no time is refused by the database, not by admin discipline.
-- 3. `schedule_items_public` gains `venue_id` as its LAST column. DROP then
--    CREATE (HANDOFF: read the live shape first). The live column list on
--    2026-09-23, read with the anon key, was: id, event_id, day_date,
--    start_time, sort_order, title, location, note, kind, presented_by,
--    presented_by_website, presented_by_logo_url, presented_by_linked (13).
--    verify_070 block E pins the new 14-column list.
-- 4. `contests.sponsor_id` (nullable FK to sponsorships). The public page
--    joins through sponsors_public, which is confirmed-only, so an
--    unconfirmed sponsor never renders. Nothing about tier or money is read.
-- 5. page_images slot `after-party-sunday` (the four night-flyer slots and the
--    three venue-logo slots are arranged by the data SQL, which renames the
--    existing uploads in place).
--
-- POLICIES ENUMERATED BEFORE WRITING: schedule_items carries
-- "schedule_items: admin all" (044) and "schedule_items: editorial write"
-- (054); contests carries "contests: public read" using (true), "contests:
-- admin write" and "contests: editorial write" (054). Nothing here adds a
-- policy to either. venues is new.
--
-- NOT APPLIED by the author. Ryan runs production SQL, then verify_070.sql,
-- then seeds/070_after_parties_data.sql.
-- ============================================================

begin;

-- ── 1. venues ────────────────────────────────────────────────
create table if not exists public.venues (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references public.events(id) on delete set null,
  name            text not null check (length(trim(name)) > 0),
  slug            text not null unique check (slug ~ '^[a-z0-9-]+$'),
  blurb           text not null default '',
  address         text,
  phone           text,
  website_url     text,
  instagram_url   text,
  instagram_label text,
  facebook_url    text,
  tiktok_url      text,
  logo_slot       text references public.page_images(slug) on update cascade on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists venues_updated_at on public.venues;
create trigger venues_updated_at
  before update on public.venues
  for each row execute function handle_updated_at();

comment on table public.venues is
  'After-party (and any other off-site) venues. Public read. logo_slot names a page_images slug; the logo itself is uploaded through /admin/page-images.';

alter table public.venues enable row level security;

drop policy if exists "venues: public read" on public.venues;
create policy "venues: public read"
  on public.venues for select
  to anon, authenticated
  using (true);

drop policy if exists "venues: editorial write" on public.venues;
create policy "venues: editorial write"
  on public.venues for all
  to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

grant select on public.venues to anon, authenticated;
revoke insert, update, delete on public.venues from anon;
grant insert, update, delete on public.venues to authenticated;

-- ── 2. schedule_items: venue, kind, nullable time ───────────
alter table public.schedule_items
  add column if not exists venue_id uuid references public.venues(id) on delete set null;

alter table public.schedule_items
  alter column start_time drop not null;

alter table public.schedule_items
  drop constraint if exists schedule_items_time_required_when_published;
alter table public.schedule_items
  add constraint schedule_items_time_required_when_published
  check (start_time is not null or is_published = false);

-- The 044 kind check was created inline, so its name is Postgres-generated.
-- Drop whichever check on `kind` exists, then add the widened one by name.
do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public' and rel.relname = 'schedule_items'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.schedule_items drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.schedule_items
  add constraint schedule_items_kind_check
  check (kind in ('programme','contest','ceremony','tribute','seminar','after_party'));

-- ── 3. the public view, with venue_id appended ──────────────
drop view if exists public.schedule_items_public;
create view public.schedule_items_public with (security_invoker = false) as
select s.id, s.event_id, s.day_date, s.start_time, s.sort_order,
       s.title, s.location, s.note, s.kind,
       coalesce(sp.sponsor_name, c.buyer_name, s.presented_by_fallback) as presented_by,
       sp.website  as presented_by_website,
       sp.logo_url as presented_by_logo_url,
       (sp.id is not null) as presented_by_linked,
       s.venue_id
  from public.schedule_items s
  left join public.sponsorships sp
    on sp.id = s.presented_by_sponsorship_id
   and sp.status = 'confirmed'
  left join public.presentation_credit_items ci
    on ci.schedule_item_id = s.id
  left join public.presentation_credits c
    on c.id = ci.credit_id
   and c.status = 'confirmed'
 where s.is_published;

grant select on public.schedule_items_public to anon, authenticated;

-- ── 4. contests.sponsor_id ──────────────────────────────────
alter table public.contests
  add column if not exists sponsor_id uuid references public.sponsorships(id) on delete set null;

comment on column public.contests.sponsor_id is
  'Presenting sponsor for this contest. Public pages join through sponsors_public (confirmed only) and render name, logo and website - never tier or money.';

-- ── 5. page_images: the Sunday night slot ───────────────────
insert into public.page_images (slug) values ('after-party-sunday')
on conflict (slug) do nothing;

commit;
