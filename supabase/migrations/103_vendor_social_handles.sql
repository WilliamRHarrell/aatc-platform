-- ============================================================
-- Migration 103: vendors in the top-posts pipeline.
-- Verification: supabase/verify/verify_103.sql
--
-- Ryan (2026-10-13): approved VENDORS join artist_social_handles_v. A vendor
-- has no roster (confirmed in production and in the editor's planner), so its
-- handle is applications.instagram, artist_uid is NULL and display_name is
-- the business name. Same gate (booth_publicly_visible, 089), same
-- normalization, same security posture. Vendors only - no food trucks or
-- sponsors.
--
--   1. artist_social_posts.exhibitor_type ('artist' | 'vendor', default
--      'artist' backfills the existing rows). An INGEST column: n8n writes
--      it from the view; the app never does. *** n8n DEPENDENCY: workflow A
--      must pass exhibitor_type through to its upsert BEFORE the first
--      vendor refresh, or vendor posts land as 'artist' and show under the
--      wrong admin tab. ***
--   2. The view is DROPPED and RECREATED (the 101 rule for shape changes)
--      with a new exhibitor_type column and a vendor arm. Dedupe stays one
--      row per handle; ARTISTS WIN TIES explicitly, then the earliest
--      application. An opt-out row with artist_uid NULL excludes the vendor
--      (the whole-application semantics from 101).
--   3. DROP VIEW discards the grants and default privileges re-grant ALL to
--      anon and authenticated on CREATE, so the revoke + service_role-only
--      grant is REPEATED here - it is the load-bearing part of this file.
--
-- verify_101 is now HISTORICAL: its exact-columns assertion on the view
-- predates this shape and would fail if re-run. verify_103 asserts the new
-- shape and re-asserts everything the drop could have lost.
--
-- POLICIES ENUMERATED BEFORE WRITING: artist_social_posts (admin read,
-- admin update), artist_repost_opt_outs (admin all), artist_scrape_runs
-- (admin read), applications/booths/events as in 101 - none changed; a view
-- has no policies of its own.
-- ============================================================
begin;

-- ── 1. exhibitor_type on the posts (ingest column) ───────────
alter table public.artist_social_posts
  add column if not exists exhibitor_type text not null default 'artist';

alter table public.artist_social_posts
  drop constraint if exists artist_social_posts_exhibitor_type_check;
alter table public.artist_social_posts
  add constraint artist_social_posts_exhibitor_type_check
  check (exhibitor_type in ('artist', 'vendor'));

comment on column public.artist_social_posts.exhibitor_type is
  'artist | vendor (103). Ingest column: written by n8n from artist_social_handles_v, never by the app. Default artist backfilled the pre-103 rows.';

-- ── 2. the view, recreated with the vendor arm ───────────────
drop view if exists public.artist_social_handles_v;

create view public.artist_social_handles_v
  with (security_invoker = true) as
select distinct on (u.handle)
       u.artist_uid, u.application_id, u.display_name, u.handle, u.booth_label, u.exhibitor_type
  from (
    -- artists: one row per publicly listed roster artist (unchanged from 101)
    select r.el->>'uid'                              as artist_uid,
           a.id                                      as application_id,
           coalesce(nullif(btrim(r.el->>'nickname'), ''),
                    nullif(btrim(r.el->>'name'), '')) as display_name,
           h.handle,
           b.booth_label,
           'artist'::text                            as exhibitor_type,
           a.created_at
      from public.applications a
      join public.events ev on ev.id = a.event_id and ev.is_active
      cross join lateral (
        select x.value as el
          from jsonb_array_elements(case when jsonb_typeof(a.artists) = 'array'
                                         then a.artists else '[]'::jsonb end) as x(value)
         where jsonb_typeof(x.value) = 'object'
           and coalesce(x.value->>'uid', '') <> ''
      ) r
      cross join lateral (
        select nullif(
                 regexp_replace(
                   split_part(split_part(
                     regexp_replace(lower(btrim(r.el->>'instagram')),
                                    '^(https?://)?(www\.|m\.)?instagram\.com/', ''),
                     '?', 1), '/', 1),
                   '^@', ''),
               '') as handle
      ) h
      left join lateral (
        select string_agg(bo.booth_number, ', ' order by bo.booth_number) as booth_label
          from public.booths bo
         where bo.application_id = a.id
      ) b on true
     where a.exhibitor_type = 'artist'
       and public.booth_publicly_visible(a.id)
       and h.handle is not null
       and btrim(coalesce(r.el->>'instagram', '')) !~* 'facebook\.com'
       and not exists (select 1 from public.artist_repost_opt_outs o
                        where o.application_id = a.id
                          and (o.artist_uid is null or o.artist_uid = r.el->>'uid'))
    union all
    -- vendors: one row per publicly listed vendor with a usable handle (103)
    select null::text                                as artist_uid,
           a.id                                      as application_id,
           a.business_name                           as display_name,
           h.handle,
           b.booth_label,
           'vendor'::text                            as exhibitor_type,
           a.created_at
      from public.applications a
      join public.events ev on ev.id = a.event_id and ev.is_active
      cross join lateral (
        select nullif(
                 regexp_replace(
                   split_part(split_part(
                     regexp_replace(lower(btrim(a.instagram)),
                                    '^(https?://)?(www\.|m\.)?instagram\.com/', ''),
                     '?', 1), '/', 1),
                   '^@', ''),
               '') as handle
      ) h
      left join lateral (
        select string_agg(bo.booth_number, ', ' order by bo.booth_number) as booth_label
          from public.booths bo
         where bo.application_id = a.id
      ) b on true
     where a.exhibitor_type = 'vendor'
       and public.booth_publicly_visible(a.id)
       and h.handle is not null
       and btrim(coalesce(a.instagram, '')) !~* 'facebook\.com'
       and not exists (select 1 from public.artist_repost_opt_outs o
                        where o.application_id = a.id and o.artist_uid is null)
  ) u
 order by u.handle, (u.exhibitor_type <> 'artist'), u.created_at, u.artist_uid;

comment on view public.artist_social_handles_v is
  'n8n input for the top-posts refresh (101, vendors 103): publicly listed roster artists and vendors (booth_publicly_visible, the directory gate) of the active event with a normalized Instagram handle. One row per handle, artists win ties. service_role only.';

-- ── 3. the grants the DROP discarded (load-bearing) ──────────
revoke all on public.artist_social_handles_v from public, anon, authenticated;
grant select on public.artist_social_handles_v to service_role;
-- security_invoker: the caller runs the gate function itself (granted in 101,
-- repeated so this file stands alone).
grant execute on function public.booth_publicly_visible(uuid) to service_role;

commit;
