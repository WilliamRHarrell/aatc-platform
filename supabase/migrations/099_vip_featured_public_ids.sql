-- ============================================================
-- Migration 099: vip_featured_public gains application_id, artist_uid and
-- in_directory, for the directory "Featured" badge and the homepage
-- "Featured artists" section (plan 2026-10-09, last step).
-- Verification: supabase/verify/verify_099.sql
--
-- CREATE OR REPLACE VIEW: the 098 columns keep their order and the new ones
-- are appended (Postgres allows only that), so grants and readers stay.
-- application_id is already public for every listed exhibitor (the
-- /directory/<id> URL); for an approved but unlisted one it opens nothing
-- (applications_public filters it). artist_uid is the random roster uid.
-- in_directory = the application is in applications_public (approved,
-- roster complete, deposit/comp/override).
--
-- verify_098 block A pins the 098 column list; after 099 that check is
-- superseded by verify_099 block A (same list plus the three columns).
--
-- POLICIES: none touched (a view; vip_featured_artists keeps its one admin
-- policy from 098).
-- ============================================================
begin;

create or replace view public.vip_featured_public with (security_invoker = false, security_barrier = true) as
select v.id,
       v.display_order,
       coalesce(nullif(btrim(el->>'nickname'), ''), nullif(btrim(el->>'name'), '')) as artist_name,
       a.business_name as shop,
       nullif(ltrim(btrim(el->>'instagram'), '@'), '') as instagram,
       coalesce(nullif(el->>'photo_url', ''),
                case when jsonb_typeof(el->'portfolio_urls') = 'array' then nullif(el->'portfolio_urls'->>0, '') end) as photo_url,
       case
         when el->'tv_featured' = 'false'::jsonb then null
         when nullif(btrim(el->>'tv_credit'), '') is not null then btrim(el->>'tv_credit')
         when el->'tv_featured' = 'true'::jsonb then null
         when jsonb_array_length(a.artists) = 1 and a.tv_show_featured is distinct from false
           then nullif(btrim(a.tv_show), '')
         else null
       end as tv_credit,
       nullif(btrim(el->>'bio'), '') as bio,
       -- 099: so the directory can badge the exhibitor and the artist, and the
       -- homepage can link to a profile only when one is published.
       a.id as application_id,
       v.artist_uid,
       exists (select 1 from public.applications_public p where p.id = a.id) as in_directory
  from public.vip_featured_artists v
  join public.applications a on a.id = v.application_id
  join public.events ev on ev.id = a.event_id and ev.is_active
  cross join lateral (
    select x.value as el from jsonb_array_elements(case when jsonb_typeof(a.artists) = 'array' then a.artists else '[]'::jsonb end) as x(value)
     where jsonb_typeof(x.value) = 'object' and x.value->>'uid' = v.artist_uid
     limit 1
  ) r
 where a.status = 'approved';

comment on view public.vip_featured_public is
  'Public fields of the VIP Meet & Greet artists (098): approved applications of the active event only; no contact or ID data. 099: application_id, artist_uid, in_directory for the directory badge and homepage.';

grant select on public.vip_featured_public to anon, authenticated;

commit;
