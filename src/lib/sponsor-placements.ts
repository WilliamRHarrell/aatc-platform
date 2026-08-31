/**
 * Which website placements each tier is owed, and how a custom amount is
 * assigned a tier.
 *
 * WHY THIS FILE EXISTS. Placements were promised in prose and delivered as
 * booleans, with nothing joining the two. `sponsor-tiers.ts` holds prices,
 * limits and deadlines but says nothing about where a sponsor appears; the
 * promises live as free-text strings in PACKAGE_PERKS, duplicated verbatim
 * across /sponsors/packages and /apply/sponsor. So "is this sponsor getting
 * what they paid for?" was not a question any code could ask.
 *
 * Four owed-and-unrendered instances have been found in this project, every one
 * of them by accident and none by design. This file is the data those checks
 * were missing.
 *
 * ============================================================================
 * NON-GOAL: THIS FILE MUST NEVER COMPARE A STORED TIER AGAINST A STORED AMOUNT.
 * ============================================================================
 *
 * Not "should not" - must not, and the function signatures below are built so
 * that it cannot. `placementsForTier` and `missingPlacements` do not accept an
 * amount. They physically cannot derive a tier from one.
 *
 * THE REASON, with the live case. Tattoo Goo is stored as tier = 'gold' with
 * amount = 300000 ($3,000). Gold is $5,000 in the July 2026 packet. A check that
 * recomputed the tier from the amount would round it down to silver, conclude
 * that a gold-tier homepage placement was unearned, and report Tattoo Goo as
 * rendered-and-unsold on every single run.
 *
 * That row is CORRECT. It is grandfathered at the pre-July price, which
 * CUTOVER.md records explicitly as not an error. So the derivation would produce
 * a permanent false positive against a correct row - and a check that cries
 * wolf against a row nobody will ever "fix" is a check people stop reading.
 * That single false positive would waste the entire build.
 *
 * THE STORED TIER IS AUTHORITATIVE. Always. It is what the sponsor was sold.
 * Amount is what they paid. The two are allowed to disagree, and when they do,
 * the tier wins for every placement question.
 */
import { SPONSOR_TIERS, type SponsorTier } from './sponsor-tiers'

/**
 * A placement that renders on this website, and can therefore be CHECKED.
 *
 * Deliberately excludes every off-site perk - printed material, social posts,
 * banners, event-guide ads, booths, passes. Those are real obligations and are
 * not represented here, because a registry that silently mixed checkable and
 * uncheckable promises would report "all placements satisfied" while meaning
 * "all the ones I can see".
 */
export type Placement = 'homepage' | 'sponsors_page' | 'footer' | 'vote_pages'

/** The `sponsorships` column that grants each placement. */
export const PLACEMENT_COLUMN = {
  homepage: 'show_on_homepage',
  sponsors_page: 'show_on_sponsors',
  footer: 'featured_footer',
  vote_pages: 'show_on_vote_pages',
} as const satisfies Record<Placement, string>

/** Human label, for admin surfaces and check output. */
export const PLACEMENT_LABEL = {
  homepage: 'Homepage',
  sponsors_page: 'Sponsors page',
  footer: 'Site footer',
  vote_pages: 'Vote page',
} as const satisfies Record<Placement, string>

/**
 * Gold and above. Listed explicitly rather than computed by comparing tier
 * amounts, so that changing a PRICE in sponsor-tiers.ts cannot silently move a
 * tier in or out of the homepage set. A placement change should be a deliberate
 * edit here, not a side effect of a price rise.
 */
export const GOLD_AND_ABOVE: readonly SponsorTier[] = ['title', 'platinum', 'gold']

/**
 * The page a package is inherently associated with, where one exists.
 *
 * Only Collector's Choice has one. The other individual items - collectible
 * coin, VIP bag, artist lounge, rafter banner - buy physical placements with no
 * website page attached, so they get the sponsors page and nothing more. They
 * are ABSENT here rather than mapped to something plausible.
 *
 * ⚠  Collector's Choice is recorded as ONE vote page because there is one:
 * /contests, listing every category inline. The packet copy says "your logo on
 * every vote page of our website", plural, and that wording is unresolved - see
 * HANDOFF section 1. If it turns out to promise per-category pages, this entry
 * is not what changes; the pages would have to exist first.
 */
const PACKAGE_PAGE: Partial<Record<SponsorTier, Placement>> = {
  collectors_choice: 'vote_pages',
}

/**
 * The placements a tier is owed.
 *
 * TAKES A TIER AND NOTHING ELSE. That is the structural form of the non-goal at
 * the top of this file: with no amount in scope, this function cannot derive a
 * tier from one, today or after anybody edits it.
 *
 * The rule, as set 2026-08-31:
 *   Gold and above -> homepage AND sponsors page.
 *   Below Gold     -> sponsors page, plus the page associated with the package.
 *
 * FOOTER: the footer is the homepage placement with smaller logos - the same
 * set, a different treatment. So it travels with `homepage` rather than being
 * chosen by hand. This is only expressible because the footer's cap of 5 was
 * removed; while it stood, Title + Platinum + Gold would have exceeded it before
 * April and the two rules could not both have held.
 */
export function placementsForTier(tier: SponsorTier): Placement[] {
  if (GOLD_AND_ABOVE.includes(tier)) {
    return ['homepage', 'footer', 'sponsors_page']
  }
  const packagePage = PACKAGE_PAGE[tier]
  return packagePage ? ['sponsors_page', packagePage] : ['sponsors_page']
}

/** The flags a check reads. Note the absence of `amount` - see the non-goal. */
export interface PlacementFlags {
  tier: SponsorTier
  show_on_homepage: boolean
  show_on_sponsors: boolean
  featured_footer: boolean
  show_on_vote_pages: boolean
}

/**
 * Placements this sponsor is owed but is not granted: OWED-AND-UNRENDERED.
 *
 * Grants only. A true flag is necessary for a placement to render and is not
 * sufficient - the Nomadica credit was on a correct row that the page then
 * dropped, and no flag was wrong. Whether the placement actually REACHES a page
 * has to be tested against what renders, which is the second half of the check
 * and does not belong in a pure function.
 *
 * ⚠  THE CALLER MUST SCOPE TO CONFIRMED SPONSORSHIPS. This reads a tier and
 * answers what that tier is owed; it has no opinion about whether the deal has
 * closed. Run it over every row and a PENDING sponsor reports as
 * owed-and-unrendered for placements they are not yet entitled to - which is
 * live today: Tattoo Goo is pending gold, and this returns homepage and footer
 * for it. Correct output, wrong question. Filter by status first.
 */
export function missingPlacements(row: PlacementFlags): Placement[] {
  return placementsForTier(row.tier).filter(p => !row[PLACEMENT_COLUMN[p]])
}

/**
 * Placements granted that the tier does not promise: RENDERED-AND-UNSOLD.
 *
 * Not automatically a defect - a placement can be given deliberately, and there
 * is no column recording that it was. Read it as a list to explain, not a list
 * to correct.
 */
export function extraPlacements(row: PlacementFlags): Placement[] {
  const owed = placementsForTier(row.tier)
  const all = Object.keys(PLACEMENT_COLUMN) as Placement[]
  return all.filter(p => row[PLACEMENT_COLUMN[p]] && !owed.includes(p))
}

// ── Assignment ──────────────────────────────────────────────

/**
 * The tier and custom flag for a NEW sponsorship at a negotiated amount.
 *
 * ⚠  CALLED ONCE, AT ROW CREATION. NEVER AGAINST AN EXISTING ROW.
 *
 * This is an ASSIGNMENT helper, not a derivation. Running it over stored rows
 * would demote Tattoo Goo from grandfathered gold to silver and strip a sold
 * homepage placement. It is named for assignment and returns INSERT FIELDS
 * rather than a bare tier, so a call site that misuses it has to visibly splat
 * pricing fields into an update - which is the point at which someone reading
 * the diff should stop.
 *
 * ROUNDS DOWN to the nearest main tier at or below the amount, so the sponsor
 * receives at least what that tier promises. Round-down is the safe direction:
 * its failure mode is over-delivery.
 *
 * MAIN TIERS ONLY. The individual items are bought as named items, not as
 * custom amounts, and rounding a negotiated figure onto `artist_lounge` would
 * assign a package nobody discussed.
 *
 * Returns null below the cheapest main tier, rather than assigning that tier as
 * a floor - assigning Brass to someone who paid less than Brass would be
 * rounding UP, which is the direction this rule exists to forbid. The caller
 * decides explicitly; that is not a case this function should guess at.
 */
export interface NewSponsorshipTierFields {
  tier: SponsorTier
  is_custom: boolean
}

export function tierFieldsForNewSponsorship(
  amountCents: number,
): NewSponsorshipTierFields | null {
  const candidates = GOLD_AND_ABOVE.concat(['silver', 'brass'])
    .map(t => ({ tier: t, amount: SPONSOR_TIERS[t].amount }))
    .filter(t => t.amount <= amountCents)
    .sort((a, b) => b.amount - a.amount)

  const floor = candidates[0]
  if (!floor) return null

  return { tier: floor.tier, is_custom: amountCents !== floor.amount }
}

/**
 * "Custom Gold" / "Gold". Display only - built from the two stored fields, which
 * is the whole reason a parallel custom_* enum was not needed.
 */
export function tierLabelWithCustom(tier: SponsorTier, isCustom: boolean): string {
  const label = SPONSOR_TIERS[tier].label
  return isCustom ? `Custom ${label}` : label
}
