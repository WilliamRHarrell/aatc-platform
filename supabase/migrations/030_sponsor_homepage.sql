-- ============================================================
-- Migration 030: Homepage sponsor placement
--
-- Renumbered from 027 (never applied) so the three RLS prerequisites sort and
-- replay before it: 027 pins is_admin()'s search_path, 028 breaks the
-- applications<->invoices cycle, 029 lets sponsors read their own invoices.
-- This migration assumes those have run.
--
-- Nothing here subqueries invoices. Migration 025's sponsorship policy did,
-- which is how sponsorships became an entry point into the 42P17 cycle;
-- payment is now enforced by admin action (ticking a placement flag), not by
-- RLS. That is also what makes trade / in-kind sponsors possible — Title tier,
-- host-hotel arrangements — which have no invoice row and could never satisfy
-- the old paid-invoice gate no matter what an admin ticked.
--
-- SURFACE AUDIT — every non-admin read of sponsorships, and what serves it:
--   SiteFooter          featured_footer=true, confirmed    -> public policy
--   homepage grid       show_on_homepage=true, confirmed   -> public policy
--   /sponsors directory confirmed, NO placement flag       -> public policy
--                       (a placement-only policy would silently empty it)
--   /sponsors/packages  needs pending+confirmed tier counts to grey out
--                       sold-out limited tiers -> sponsor_tier_counts() RPC,
--                       so pending rows stay private but counts still work
--   /portal             user_id = auth.uid()               -> owner policy
--
-- Fully idempotent: every statement is IF NOT EXISTS / OR REPLACE / DROP IF
-- EXISTS, so re-running is a no-op. Runs as one transaction — the blanket
-- baseline is dropped in the same transaction that installs its replacements,
-- so there is no window where sponsorships is readable by nobody.
-- ============================================================

begin;

-- ── Columns ─────────────────────────────────────────────────
alter table sponsorships
  add column if not exists show_on_homepage boolean not null default false;

alter table sponsorships
  add column if not exists homepage_order integer;

-- Trade / in-kind sponsors: no invoice will ever exist for these.
alter table sponsorships
  add column if not exists is_in_kind boolean not null default false;

comment on column sponsorships.show_on_homepage is
  'Render this sponsor in the homepage sponsor grid.';
comment on column sponsorships.homepage_order is
  'Manual sort order for the homepage grid; nulls sort last, then tier, then name.';
comment on column sponsorships.is_in_kind is
  'Trade/in-kind sponsor with no invoice (e.g. Title tier, host hotel). Recorded so unpaid-but-intentional placements are diagnosable.';

create index if not exists sponsorships_homepage_idx
  on sponsorships (show_on_homepage, homepage_order)
  where show_on_homepage = true;

-- ── Superseded policies ─────────────────────────────────────
-- Definitions preserved verbatim so they can be restored.
--
-- migration 001 (the only blanket qual:true left in the schema):
--   create policy "sponsorships: public read"
--     on sponsorships for select using (true);
--
-- migration 019:
--   create policy "Public can read featured footer sponsors"
--     on sponsorships for select
--     using (featured_footer = true and status = 'confirmed');
--
-- migration 025 — DO NOT restore as written; this is the sponsorships entry
-- point into the 42P17 cycle:
--   create policy "Public can read paid featured sponsors"
--     on sponsorships for select
--     to anon, authenticated
--     using (
--       featured_footer = true
--       and status = 'confirmed'
--       and exists (
--         select 1 from invoices i
--          where i.sponsorship_id = sponsorships.id
--            and i.final_paid_at is not null
--       )
--     );

drop policy if exists "sponsorships: public read" on sponsorships;
drop policy if exists "Public can read featured footer sponsors" on sponsorships;
drop policy if exists "Public can read paid featured sponsors" on sponsorships;
drop policy if exists "Public can read paid placed sponsors" on sponsorships;
drop policy if exists "Public can read placed sponsors" on sponsorships;

-- ── Public read: confirmed sponsors only ────────────────────
-- Serves the footer, the homepage grid and the /sponsors directory. Pending
-- applications and their contact details stop being world-readable.
drop policy if exists "Public can read confirmed sponsors" on sponsorships;
create policy "Public can read confirmed sponsors"
  on sponsorships for select
  to anon, authenticated
  using (status = 'confirmed');

-- ── Owner read ──────────────────────────────────────────────
-- Reconciled, not duplicated: dropped first so re-running cannot leave two
-- overlapping owner policies. If the live database already carries an owner
-- policy under a DIFFERENT name, drop that one too — overlapping permissive
-- policies OR together so it is functionally harmless, but it makes the
-- effective grant hard to reason about.
drop policy if exists "Sponsors can read own sponsorship" on sponsorships;
create policy "Sponsors can read own sponsorship"
  on sponsorships for select
  to authenticated
  using (user_id = auth.uid());

-- ── Sold-out tier counts without exposing pending rows ──────
-- /sponsors/packages greys out limited tiers once taken, which needs pending
-- AND confirmed counts. SECURITY DEFINER so it can count rows the caller
-- cannot read; returns aggregates only — no names, emails or amounts.
create or replace function public.sponsor_tier_counts(p_event_id uuid)
returns table (tier sponsor_tier, taken bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select s.tier, count(*) as taken
    from public.sponsorships s
   where s.event_id = p_event_id
     and s.status in ('confirmed', 'pending')
   group by s.tier;
$$;

revoke all on function public.sponsor_tier_counts(uuid) from public;
grant execute on function public.sponsor_tier_counts(uuid) to anon, authenticated;

commit;
