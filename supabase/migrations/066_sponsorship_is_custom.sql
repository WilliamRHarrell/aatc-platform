-- ============================================================
-- Migration 066: sponsorships.is_custom
--
-- Records that a sponsorship's amount was NEGOTIATED rather than taken from the
-- package price, without inventing a parallel set of tier values.
--
-- WHY A FLAG AND NOT custom_gold / custom_silver / ... The alternative was a
-- second enum value per tier. Three reasons it loses:
--
--   1. A Postgres enum value can be ADDED but never DROPPED. A parallel custom_*
--      set doubles the tier space permanently, and every switch, every
--      Record<SponsorTier, TierDef> and every tier filter has to carry both
--      halves forever.
--   2. It breaks the question that actually matters. "Is this sponsor Gold or
--      above?" is the placement test, and with custom_gold it becomes a
--      TWO-VALUE test that every call site has to remember. One call site that
--      forgets silently under-delivers a sold placement - the exact defect class
--      this project keeps finding. With tier + is_custom the placement question
--      reads ONE column and cannot get it wrong.
--   3. Nothing is lost. `amount` already carries the figure and `tier` carries
--      the package it was priced against, so "Custom Gold at $7,500" is two
--      facts that are both already stored. Admin renders the label from them.
--
-- Mirrors is_in_kind (migration 030): a commercial fact STATED as a flag rather
-- than inferred from an amount. Same reasoning, same table, same shape.
--
-- DEFAULTS FALSE, deliberately. An existing row is not custom until someone says
-- it is, and the grandfathered rows must not be swept up - see below.
--
-- ⚠  THIS COLUMN IS NOT A DERIVATION AND MUST NEVER BE BACKFILLED FROM amount.
-- Tattoo Goo is tier = 'gold' at amount = 300000 ($3,000). Gold is $5,000 in the
-- July 2026 packet, so a backfill comparing amount against the tier price would
-- mark that row custom - and a round-down derivation would go further and demote
-- it to silver, stripping the homepage placement it was sold. It is neither
-- custom nor mis-tiered: it is GRANDFATHERED at the pre-July price, which
-- CUTOVER.md records as correct and not an error. There is no backfill in this
-- migration on purpose.
-- ============================================================

begin;

alter table public.sponsorships
  add column if not exists is_custom boolean not null default false;

comment on column public.sponsorships.is_custom is
  'The amount was negotiated rather than taken from the package price. Set at row creation by tierFieldsForNewSponsorship() in src/lib/sponsor-placements.ts; never derived from amount afterwards. tier stays the package the deal was priced against (rounded DOWN, so the sponsor gets at least what that tier promises) and amount carries the real figure. NOT set on grandfathered rows: Tattoo Goo is gold at the pre-July $3,000 and is correct as stored.';

commit;


-- ── REPORT: read this output ────────────────────────────────
-- Every sponsorship with the two fields that together describe its pricing.
-- want: is_custom false on every existing row, including Tattoo Goo at $3,000.
select sponsor_name, status, tier, amount, is_custom, is_in_kind
  from public.sponsorships
 order by amount desc;
