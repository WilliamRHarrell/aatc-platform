-- ============================================================
-- Migration 100: public "Veteran" badges in the directory.
-- Verification: supabase/verify/verify_100.sql
--
-- Ryan (2026-10-10): a public badge, ticked ONLY by an admin after checking
-- with the person. Per ARTIST on artist applications, per BUSINESS on vendor
-- applications. Never set from is_veteran (the discount, one flag per
-- application) and independent of veteran document verification.
--
-- veteran_badges: one row per badge. artist_uid = applications.artists[].uid
-- (098) for an artist; NULL for a vendor's business badge. Admin-only RLS,
-- the vip_featured_artists pattern: an owner cannot badge themselves, and a
-- roster rebuild cannot drop it.
--
-- veteran_badges_public: ids only (application_id, artist_uid), for
-- APPROVED applications of the ACTIVE event; an artist badge only while that
-- uid is on the roster of an artist application, a business badge only on a
-- vendor. Pages join it to what they already show (the directory reads
-- applications_public; the VIP page and homepage read vip_featured_public).
--
-- POLICIES ENUMERATED BEFORE WRITING: applications unchanged; veteran_badges
-- is new with one policy, below.
-- ============================================================
begin;

create table if not exists public.veteran_badges (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications on delete cascade,
  artist_uid     text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

create unique index if not exists veteran_badges_one_per_subject
  on public.veteran_badges (application_id, coalesce(artist_uid, ''));

comment on table public.veteran_badges is
  'Public Veteran badges (100), ticked by an admin: artist_uid = the roster artist; NULL = the vendor business. Not derived from is_veteran.';

alter table public.veteran_badges enable row level security;

drop policy if exists "veteran_badges: admin all" on public.veteran_badges;
create policy "veteran_badges: admin all"
  on public.veteran_badges for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.veteran_badges from anon;
grant select, insert, delete on public.veteran_badges to authenticated;

create or replace view public.veteran_badges_public with (security_invoker = false, security_barrier = true) as
select b.application_id, b.artist_uid
  from public.veteran_badges b
  join public.applications a on a.id = b.application_id and a.status = 'approved'
  join public.events ev on ev.id = a.event_id and ev.is_active
 where (b.artist_uid is null and a.exhibitor_type = 'vendor')
    or (b.artist_uid is not null and a.exhibitor_type = 'artist'
        and jsonb_typeof(a.artists) = 'array'
        and exists (select 1 from jsonb_array_elements(a.artists) as x(value)
                     where jsonb_typeof(x.value) = 'object' and x.value->>'uid' = b.artist_uid));

comment on view public.veteran_badges_public is
  'Public Veteran badges (100): ids only, approved applications of the active event, artists still on the roster, business badges on vendors only.';

grant select on public.veteran_badges_public to anon, authenticated;

commit;
