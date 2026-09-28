-- ============================================================
-- Migration 085: a manual "Full / closed" switch for panels.
-- Verification: supabase/verify/verify_085.sql
--
-- An EMAIL-HOST panel's signups go to the presenter, not through the site, so
-- the site cannot count seats (080 caps only aatc_invoice and hard-capped
-- panels). The presenter tells Ryan when she is full; Ryan turns this on in
-- /admin/panels, and the public pages show "Full" with no signup link.
-- First use: Tooth Gem Seminar (email host, 2026-09-28).
--
-- panels_public gains `signup_closed` as its LAST column. Everything before it
-- is 065's body unchanged (column list checked against the live view,
-- 2026-09-28), so this stays a pure `create or replace`: grants survive and
-- no dependent object is dropped.
--
-- ⚠  047 (HELD, "do not run as-is") drops and recreates panels_public from
-- its own body. Besides reverting 065's credit join, it would now also drop
-- `signup_closed`. Carry both into 047's body before it is ever run.
-- POLICIES: none touched (panels policies are unchanged; the view is definer).
-- ============================================================
begin;

alter table public.panels add column if not exists signup_closed boolean not null default false;
comment on column public.panels.signup_closed is
  'Manual "Full / closed" (085). Set in /admin/panels for email-host panels, whose signups the site cannot count; the public pages then show Full and no signup link.';

create or replace view public.panels_public with (security_invoker = false) as
select p.id, p.event_id, p.title, p.description,
       p.panel_date, p.panel_time,          -- deprecated, still live: 047 is HELD
       p.location, p.panelists, p.is_free, p.cost, p.signup_type,
       p.max_capacity, p.image_url,
       case when p.signup_type = 'email_host' then p.host_email end as host_email,
       coalesce(sp.sponsor_name, c.buyer_name, p.presented_by_fallback) as presented_by,
       sp.website  as presented_by_website,
       sp.logo_url as presented_by_logo_url,
       (sp.id is not null) as presented_by_linked,
       -- Appended by 046.
       p.panel_day, p.panel_start,
       -- Appended by 085.
       p.signup_closed
  from panels p
  left join sponsorships sp
    on sp.id = p.presented_by_sponsorship_id
   and sp.status = 'confirmed'
  left join presentation_credit_items ci
    on ci.panel_id = p.id
  left join presentation_credits c
    on c.id = ci.credit_id
   and c.status = 'confirmed'
 where p.is_published = true;


commit;
