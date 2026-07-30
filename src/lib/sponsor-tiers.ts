/**
 * Single source of truth for sponsorship tiers.
 *
 * These were triplicated across apply/sponsor, admin/sponsorships and
 * sponsors/packages, with the amount written out in each. That is how the VIP
 * Bag price came to disagree between what a sponsor saw on /sponsors/packages
 * and what admin invoiced them — three copies, nothing asserting they matched.
 *
 * Amounts are in CENTS, matching invoices.amount and lib/pricing.ts.
 */
export type SponsorTier =
  | 'title' | 'platinum' | 'gold' | 'silver' | 'brass'
  | 'collectible_coin' | 'vip_bag' | 'collectors_choice' | 'artist_lounge' | 'rafter_banner'

export interface TierDef {
  label: string
  color: string
  amount: number            // cents
  group: 'main' | 'individual'
  limit?: number            // max sellable; absent = unlimited
}

export const SPONSOR_TIERS: Record<SponsorTier, TierDef> = {
  title:             { label: 'Title Sponsor',          color: '#ffd700', amount: 2000000, group: 'main', limit: 1 },
  platinum:          { label: 'Platinum',               color: '#e5e4e2', amount: 800000,  group: 'main' },
  gold:              { label: 'Gold',                   color: '#C4A882', amount: 300000,  group: 'main' },
  silver:            { label: 'Silver',                 color: '#a8a8a8', amount: 100000,  group: 'main' },
  brass:             { label: 'Brass',                  color: '#cd7f32', amount: 50000,   group: 'main' },
  collectible_coin:  { label: 'Collectible Coin',       color: '#C4A882', amount: 250000,  group: 'individual', limit: 1 },
  vip_bag:           { label: 'VIP Bag',                color: '#C4A882', amount: 150000,  group: 'individual' },
  collectors_choice: { label: "Collector's Choice",     color: '#C4A882', amount: 150000,  group: 'individual' },
  artist_lounge:     { label: 'Artist Lounge',          color: '#C4A882', amount: 100000,  group: 'individual' },
  rafter_banner:     { label: 'Rafter Banner',          color: '#C4A882', amount: 75000,   group: 'individual' },
}

export const ALL_TIERS = Object.keys(SPONSOR_TIERS) as SponsorTier[]
export const MAIN_TIERS = ALL_TIERS.filter(t => SPONSOR_TIERS[t].group === 'main')
export const INDIVIDUAL_ITEMS = ALL_TIERS.filter(t => SPONSOR_TIERS[t].group === 'individual')

/** Display price, derived — never write the dollar figure out by hand. */
export function tierPrice(tier: SponsorTier): string {
  return `$${(SPONSOR_TIERS[tier].amount / 100).toLocaleString('en-US')}`
}
