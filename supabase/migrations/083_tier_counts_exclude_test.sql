-- ============================================================
-- Migration 083: test sponsorships never count toward a sold-out tier.
-- Verification: supabase/verify/verify_083.sql
--
-- sponsor_tier_counts() (030) feeds /sponsors/packages, which marks a limited
-- tier "Sold" when confirmed + pending rows reach its limit. It counted the
-- two RLS-harness sponsorships ("ZZ TEST ... RLS Harness", gold confirmed and
-- brass pending), which stay live and anon-visible on purpose (see
-- src/lib/sponsor-display.ts). On 2026-09-26 gold read 6 taken with 5 real
-- gold sponsors. No public effect yet - only Title and Collectible Coin have
-- limits - but a test row must never be able to mark a tier sold.
--
-- The exclusion is the project's fixture prefix, 'ZZ ' (the harness and every
-- verify fixture), the same rule as the sponsor due reminders
-- (src/lib/sponsor-reminders.ts isTestSponsorship).
--
-- Same signature and return type, so CREATE OR REPLACE keeps the existing
-- grants; they are restated so function-grants.test.ts sees anon settled.
-- POLICIES: none touched (security definer, reads sponsorships directly).
-- ============================================================
begin;

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
     and s.sponsor_name not ilike 'ZZ %'   -- 083: test rows never count
   group by s.tier;
$$;
revoke all on function public.sponsor_tier_counts(uuid) from public;
grant execute on function public.sponsor_tier_counts(uuid) to anon, authenticated, service_role;

commit;
