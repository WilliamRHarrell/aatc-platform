-- ============================================================
-- Migration 027: Homepage sponsor placement + break the invoices RLS cycle
--                + restore the access paths the baseline policy was carrying
--
-- WHY THE POLICY CHANGES SHAPE
-- The live database throws on ANY anon read of sponsorships or invoices:
--     42P17 infinite recursion detected in policy for relation "invoices"
-- Migration 025's policy did `exists (select 1 from invoices ...)`; evaluating
-- that subquery triggers the invoices policies, which recurse. /sponsors, the
-- footer logos and the homepage grid therefore return nothing for anonymous
-- visitors — paying sponsors are invisible today.
--
-- Cross-table policy dependencies created the cycle, so public visibility is
-- now decided purely by columns ON sponsorships. Payment is enforced by admin
-- action (ticking a placement box), not by RLS. That is also what makes
-- trade/in-kind sponsors possible — Title tier, host-hotel arrangements — which
-- have no invoice row and could never satisfy the old paid-invoice gate.
--
-- SURFACE AUDIT (why there are three read policies, not one)
-- Dropping migration 001's blanket `using (true)` is a tightening, and the
-- failure mode is silent disappearance. Every non-admin read path:
--   SiteFooter            featured_footer=true, confirmed   -> public policy
--   homepage grid         show_on_homepage=true, confirmed  -> public policy
--   /sponsors directory   confirmed, NO placement flag      -> public policy
--                         (a placement-only policy would have emptied it)
--   /sponsors/packages    needs pending+confirmed tier counts to detect
--                         sold-out limited tiers -> sponsor_tier_counts() RPC,
--                         so pending rows stay private but counts still work
--   /portal               user_id = auth.uid() -> owner policy. NO owner policy
--                         has ever existed; the baseline was silently carrying
--                         it, so dropping the baseline alone would have locked
--                         sponsors out of their own record.
-- ============================================================

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

-- ── Drop superseded policies ────────────────────────────────
-- Definitions preserved verbatim below so they can be restored if needed.
--
-- migration 001:
--   create policy "sponsorships: public read"
--     on sponsorships for select using (true);
--
-- migration 019:
--   create policy "Public can read featured footer sponsors"
--     on sponsorships for select
--     using (featured_footer = true and status = 'confirmed');
--
-- migration 025:
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
--   ^ this is the recursive one. Do NOT restore it as written; any policy on
--     sponsorships that subqueries invoices reintroduces the 42P17 cycle.

drop policy if exists "sponsorships: public read" on sponsorships;
drop policy if exists "Public can read featured footer sponsors" on sponsorships;
drop policy if exists "Public can read paid featured sponsors" on sponsorships;
drop policy if exists "Public can read paid placed sponsors" on sponsorships;
drop policy if exists "Public can read placed sponsors" on sponsorships;

-- ── Public read: confirmed sponsors only ────────────────────
-- Serves the footer, the homepage grid and the /sponsors directory. Pending
-- applications (and their contact details) are no longer world-readable.
create policy "Public can read confirmed sponsors"
  on sponsorships for select
  to anon, authenticated
  using (status = 'confirmed');

-- ── Owner read: a sponsor can see their own record ──────────
-- Restores /portal. Previously carried only by the blanket baseline policy.
create policy "Sponsors can read own sponsorship"
  on sponsorships for select
  to authenticated
  using (user_id = auth.uid());

-- ── Sold-out tier counts without exposing pending rows ──────
-- /sponsors/packages greys out limited tiers once taken, which needs pending
-- AND confirmed counts. Security definer so it can count rows the caller
-- cannot read; returns aggregates only — no names, emails or amounts.
create or replace function public.sponsor_tier_counts(p_event_id uuid)
returns table (tier sponsor_tier, taken bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.tier, count(*) as taken
    from sponsorships s
   where s.event_id = p_event_id
     and s.status in ('confirmed', 'pending')
   group by s.tier;
$$;

revoke all on function public.sponsor_tier_counts(uuid) from public;
grant execute on function public.sponsor_tier_counts(uuid) to anon, authenticated;
