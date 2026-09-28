-- ============================================================
-- Migration 084b: a sponsor_tier_settings row for 'bronze'.
-- Verification: supabase/verify/verify_084b.sql (then re-run verify_084.sql)
--
-- verify_084 failed on 2026-09-28: "tiers with no row: bronze". The enum has
-- carried 'bronze' since 001 (platinum, gold, silver, bronze). 011 says it
-- removes bronze in favour of brass but only ADDs values - Postgres cannot
-- drop an enum value in place - so bronze stayed. Nothing uses it: no
-- sponsorship has tier 'bronze' (production read, 2026-09-28), the app's tier
-- list (src/lib/sponsor-tiers.ts) does not offer it, and the only reference is
-- a throwaway fixture in verify_065.
--
-- HIDDEN: a retired package tier with no price in the app. A missing row
-- already reads hidden (fail closed); the row exists so verify_084's
-- "every enum value has a row" check holds, which is what catches the next
-- tier someone adds to the enum.
--
-- 084 is applied and is not edited; this is the follow-up.
-- POLICIES: none touched.
-- ============================================================
begin;

insert into public.sponsor_tier_settings (tier, show_price) values ('bronze', false)
on conflict (tier) do nothing;

commit;
