-- ============================================================
-- Migration 063: show_on_sponsors and show_on_vote_pages
--
-- Completes the checkbox-driven placement model. Two existing flags already
-- work this way - featured_footer and show_on_homepage - and these are the two
-- surfaces that had no flag at all.
--
-- ⚠  show_on_sponsors DEFAULTS TO TRUE, AND THAT IS DELIBERATE.
--
-- /sponsors currently lists EVERY confirmed sponsorship with no flag consulted.
-- Defaulting to false would empty a live page the moment this is applied, until
-- somebody ticked each row. Defaulting to true preserves exactly today's
-- behaviour, so this migration adds a MECHANISM without changing what anyone
-- sees - the same discipline as leaving TEAM_FALLBACK in place while
-- team_members landed.
--
-- NO BACKFILL, and none is needed. Exactly one confirmed sponsorship exists
-- today and it is the ZZ TEST harness row, so a backfill would review a single
-- test record and prove nothing. The flag becomes meaningful as real rows are
-- entered, which has not happened yet.
--
-- The opt-out risk this creates is real and is handled in the ADMIN, not here:
-- a column default is what an INSERT falls back to when no value is supplied,
-- and /admin/sponsorships now always supplies one. So the default protects
-- existing rows and the form makes publication a decision for new ones. Those
-- are two different mechanisms and must not be confused - if the admin ever
-- stops sending the value, new sponsors start publishing silently again.
--
-- show_on_vote_pages defaults to FALSE. Nothing renders it yet; the Collector's
-- Choice placement on /contests is still to be built. A flag that nothing reads
-- is honest as long as it is not also ticked by default.
-- ============================================================

alter table public.sponsorships
  add column if not exists show_on_sponsors boolean not null default true;

alter table public.sponsorships
  add column if not exists show_on_vote_pages boolean not null default false;

comment on column public.sponsorships.show_on_sponsors is
  'Publish on /sponsors. Defaults TRUE so applying this migration changes nothing - /sponsors previously listed every confirmed sponsorship. /admin/sponsorships supplies this explicitly on create, so the default only ever applies to rows that predate it.';

comment on column public.sponsorships.show_on_vote_pages is
  'Publish on the Collector''s Choice voting pages. Defaults FALSE. Nothing renders this yet - the placement is sold in the Collector''s Choice package and the surface is still to be built.';

-- The view must expose the flags or the pages cannot filter on them. Recreated
-- in full because a view cannot be altered to add a column.
create or replace view public.sponsors_public
with (security_invoker = false) as
select id, event_id, sponsor_name, tier, logo_url, website, instagram, facebook,
       featured_footer, show_on_homepage, homepage_order,
       show_on_sponsors, show_on_vote_pages
  from public.sponsorships where status = 'confirmed';

grant select on public.sponsors_public to anon, authenticated;
