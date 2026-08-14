-- Migration 044: schedule_items + sponsor presentation credit.
-- Seed data: supabase/seeds/schedule_2027.sql (run separately, after this).
-- Verification: supabase/verify/verify_044.sql
begin;

create table schedule_items (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events on delete cascade,
  day_date    date not null,
  start_time  time not null,
  -- Tiebreak for items sharing a start time — Friday 1:00 PM has both the
  -- Tattoo Battle and contest registration, and the order is editorial.
  sort_order  int  not null default 0,
  title       text not null,
  location    text not null default '',
  note        text not null default '',
  kind        text not null default 'programme'
                check (kind in ('programme','contest','ceremony','tribute','seminar')),

  -- ── Presentation credit ───────────────────────────────────
  -- The FK is authoritative: it is what makes a sold credit reportable and
  -- checkable against what was actually sold. The fallback exists ONLY so the
  -- schedule can ship before the sponsorship row exists — a credit that is
  -- agreed but not yet entered renders as plain text instead of vanishing.
  -- Once the FK is set it wins, and the credit gains a link and a logo with no
  -- edit to the schedule item. Reconcile the leftovers with verify_044.sql D.
  presented_by_sponsorship_id uuid references sponsorships on delete set null,
  presented_by_fallback       text,

  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index schedule_items_event_day_idx
  on schedule_items (event_id, day_date, start_time, sort_order);

create trigger schedule_items_updated_at
  before update on schedule_items
  for each row execute function handle_updated_at();

-- Panels carry a credit too — the Bookkeeping seminar is presented by Nomadica
-- and panels, not schedule_items, is the source for seminars.
alter table panels
  add column if not exists presented_by_sponsorship_id uuid references sponsorships on delete set null,
  add column if not exists presented_by_fallback       text;

-- ── RLS: same shape as 038 — base table admin-only, public reads via view ──
alter table schedule_items enable row level security;

create policy "schedule_items: admin all"
  on schedule_items for all using (is_admin()) with check (is_admin());

-- ── Public view ───────────────────────────────────────────
-- SECURITY DEFINER so it can resolve the sponsor join, and column-restricted
-- so the sponsorship's amount/email/phone are never reachable through it —
-- the exposure 038 closed.
--
-- The join requires status = 'confirmed'. A pending or unconfirmed sponsorship
-- therefore falls back to the plain-text credit rather than publishing the
-- sponsor: confirming a sponsorship is the sole publish gate everywhere else
-- (see CUTOVER "No announce step"), and the schedule must not become a second
-- back door that announces them early.
create or replace view public.schedule_items_public with (security_invoker = false) as
select s.id, s.event_id, s.day_date, s.start_time, s.sort_order,
       s.title, s.location, s.note, s.kind,
       coalesce(sp.sponsor_name, s.presented_by_fallback) as presented_by,
       sp.website  as presented_by_website,
       sp.logo_url as presented_by_logo_url,
       (sp.id is not null) as presented_by_linked
  from schedule_items s
  left join sponsorships sp
    on sp.id = s.presented_by_sponsorship_id
   and sp.status = 'confirmed'
 where s.is_published;

-- panels_public restated with the credit columns, same join rule.
create or replace view public.panels_public with (security_invoker = false) as
select p.id, p.event_id, p.title, p.description, p.panel_date, p.panel_time,
       p.location, p.panelists, p.is_free, p.cost, p.signup_type,
       p.max_capacity, p.image_url,
       case when p.signup_type = 'email_host' then p.host_email end as host_email,
       coalesce(sp.sponsor_name, p.presented_by_fallback) as presented_by,
       sp.website  as presented_by_website,
       sp.logo_url as presented_by_logo_url,
       (sp.id is not null) as presented_by_linked
  from panels p
  left join sponsorships sp
    on sp.id = p.presented_by_sponsorship_id
   and sp.status = 'confirmed'
 where p.is_published = true;

grant select on public.schedule_items_public, public.panels_public
  to anon, authenticated;

revoke select on schedule_items from anon;

commit;
