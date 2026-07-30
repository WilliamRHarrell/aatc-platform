-- Migration 038: close column-level exposure on every public-read table.
-- Rationale + verification: supabase/verify/verify_038.sql
begin;

create or replace view public.sponsors_public with (security_invoker = false) as
select id, event_id, sponsor_name, tier, logo_url, website, instagram, facebook,
       featured_footer, show_on_homepage, homepage_order
  from sponsorships where status = 'confirmed';

create or replace view public.exhibitors_public with (security_invoker = false) as
select id, event_id, application_id, booth_id, business_name, exhibitor_type,
       website, instagram, bio, logo_url
  from exhibitors;

create or replace view public.food_trucks_public with (security_invoker = false) as
select id, event_id, business_name, cuisine_type, description, logo_url,
       website, instagram, facebook, days, thursday_setup
  from food_trucks where is_published = true;

-- host_email is a deliberate public mailto: for email_host panels, so it is
-- exposed for those and null for every other signup mode.
create or replace view public.panels_public with (security_invoker = false) as
select id, event_id, title, description, panel_date, panel_time, location,
       panelists, is_free, cost, signup_type, max_capacity, image_url,
       case when signup_type = 'email_host' then host_email end as host_email
  from panels where is_published = true;

grant select on public.sponsors_public, public.exhibitors_public,
                public.food_trucks_public, public.panels_public
  to anon, authenticated;

-- Base tables: no anon reads at all. Authenticated keeps access, still filtered
-- by the owner/admin policies.
drop policy if exists "Public can read confirmed sponsors" on sponsorships;
drop policy if exists "exhibitors: public read"            on exhibitors;
drop policy if exists "Public read published food_trucks"  on food_trucks;
drop policy if exists "panels: public read"                on panels;
revoke select on sponsorships, exhibitors, food_trucks, panels from anon;

-- 001's blanket booths policy survived and defeats 024/028's deposit gate.
drop policy if exists "booths: public read" on booths;

commit;
