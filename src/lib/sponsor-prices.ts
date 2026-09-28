/**
 * SPONSORSHIP LIST PRICES - SERVER ONLY. The one home for these figures.
 *
 * Never import this from a 'use client' file (or anything a client file
 * imports): Next ships every module a browser component reaches as public
 * JavaScript, which is how every package price used to be readable in page
 * source whether or not the page showed it. sponsor-prices.test.ts walks the
 * client import graph and fails if this file is reachable.
 *
 * Whether a price is SHOWN is a per-tier admin setting (sponsor_tier_settings,
 * 084), read in lib/sponsor-price-visibility.ts. A hidden price is still the
 * application's internal default amount; the invoice is what the sponsor pays.
 *
 * Prices per the sponsorship packet of 13 July 2026. The main tiers were all
 * increased in that packet; the individual items were unchanged. Sponsorships
 * invoiced BEFORE the increase are grandfathered at the old price and are not
 * errors - see docs/CUTOVER.md.
 *
 * Amounts are in CENTS, matching invoices.amount and lib/pricing.ts.
 */
import { ALL_TIERS, type ShownPrices, type SponsorTier } from './sponsor-tiers'

export const SPONSOR_PRICES: Record<SponsorTier, number> = {
  title:             2500000,
  platinum:          1000000,
  gold:              500000,
  silver:            250000,
  brass:             100000,
  collectible_coin:  250000,
  rafter_banner:     75000,
  vip_bag:           150000,
  collectors_choice: 150000,
  artist_lounge:     100000,
}

export type PriceVisibility = Record<SponsorTier, boolean>

/** The prices a public page may carry: shown tiers only, hidden ones absent. */
export function shownPrices(visibility: PriceVisibility): ShownPrices {
  const out: ShownPrices = {}
  for (const t of ALL_TIERS) if (visibility[t] === true) out[t] = SPONSOR_PRICES[t]
  return out
}
