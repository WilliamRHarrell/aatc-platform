-- ============================================================
-- Migration 036: Lock grandfathered sponsorship amounts
--
-- lib/sponsor-tiers.ts is now the single source for tier pricing, and the admin
-- edit handler writes TIER_INFO[tier].amount on every save. That is correct for
-- new sponsorships and wrong for grandfathered ones: re-saving Tattoo Goo to
-- change a phone number would silently reprice it from $3,000 to $5,000.
--
-- A note in the cutover doc does not protect against this. The person who
-- reprices it will be editing a contact detail, not reading documentation.
--
-- Own migration rather than folded into 034: that one is FK delete behaviour and
-- the single-active-event index, a different concern, and it has already been
-- reviewed.
-- ============================================================

begin;

alter table sponsorships
  add column if not exists amount_locked boolean not null default false;

comment on column sponsorships.amount_locked is
  'Amount is a historical commitment and must not be reset to current tier pricing on edit. Set for sponsorships invoiced before the 13 July 2026 packet increase.';

-- ── Deliberately sets NOTHING ───────────────────────────────
-- The mechanism ships now; the flag is set per-record when a grandfathered
-- price is actually agreed. Tattoo Goo is an OPEN OFFER, not an accepted
-- sponsorship — locking their amount now would assert a commitment that does
-- not exist. Run the statement below only if they accept at $3,000:
--
--   update sponsorships set amount_locked = true
--    where sponsor_name = 'Tattoo Goo' and amount = 300000;
--
-- Same for any pre-July VIP Bag sold at $800:
--
--   update sponsorships set amount_locked = true
--    where tier = 'vip_bag' and amount = 80000;

do $$
declare n_locked int;
begin
  select count(*) into n_locked from sponsorships where amount_locked;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'sponsorships'
       and column_name = 'amount_locked'
  ) then
    raise exception 'Migration 036 FAILED: amount_locked column missing.';
  end if;
  raise notice 'Migration 036 OK — amount_locked available. % row(s) currently locked (expected 0).', n_locked;
end $$;

commit;
