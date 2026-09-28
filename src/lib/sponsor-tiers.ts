/**
 * Single source of truth for sponsorship tiers: name, colour, group, limit,
 * deadline. NO PRICES. Browser components import this file, so anything here
 * ships in the public JavaScript. The list prices live in
 * lib/sponsor-prices.ts (server only, 084), and a page receives only the
 * prices of tiers whose price is shown (sponsor_tier_settings).
 *
 * These were triplicated across apply/sponsor, admin/sponsorships and
 * sponsors/packages, with the amount written out in each. That is how the VIP
 * Bag price came to disagree between what a sponsor saw on /sponsors/packages
 * and what admin invoiced them - three copies, nothing asserting they matched.
 */
export type SponsorTier =
  | 'title' | 'platinum' | 'gold' | 'silver' | 'brass'
  | 'collectible_coin' | 'vip_bag' | 'collectors_choice' | 'artist_lounge' | 'rafter_banner'

export interface TierDef {
  label: string
  color: string
  group: 'main' | 'individual'
  limit?: number            // max sellable; absent = unlimited
  /** Commitment deadline (ISO date). Individual items only - production lead time. */
  deadline?: string
}

export const SPONSOR_TIERS: Record<SponsorTier, TierDef> = {
  title:             { label: 'Title Sponsor',          color: '#ffd700', group: 'main', limit: 1 },
  platinum:          { label: 'Platinum',               color: '#e5e4e2', group: 'main' },
  gold:              { label: 'Gold',                   color: '#C4A882', group: 'main' },
  silver:            { label: 'Silver',                 color: '#a8a8a8', group: 'main' },
  brass:             { label: 'Brass',                  color: '#cd7f32', group: 'main' },

  // Individual items. Each carries a commitment deadline driven by production
  // lead time (coins struck, banners printed).
  collectible_coin:  { label: 'Collectible Coin',       color: '#C4A882', group: 'individual', limit: 1, deadline: '2027-01-01' },
  rafter_banner:     { label: 'Rafter Banner',          color: '#C4A882', group: 'individual', deadline: '2027-02-01' },
  vip_bag:           { label: 'VIP Bag',                color: '#C4A882', group: 'individual', deadline: '2027-02-15' },
  collectors_choice: { label: "Collector's Choice",     color: '#C4A882', group: 'individual', deadline: '2027-02-15' },
  artist_lounge:     { label: 'Artist Lounge',          color: '#C4A882', group: 'individual', deadline: '2027-03-01' },
}

/** Human-readable deadline, e.g. "January 1, 2027". Empty for main tiers. */
export function tierDeadline(tier: SponsorTier): string {
  const d = SPONSOR_TIERS[tier].deadline
  if (!d) return ''
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

export const ALL_TIERS = Object.keys(SPONSOR_TIERS) as SponsorTier[]
export const MAIN_TIERS = ALL_TIERS.filter(t => SPONSOR_TIERS[t].group === 'main')
export const INDIVIDUAL_ITEMS = ALL_TIERS.filter(t => SPONSOR_TIERS[t].group === 'individual')

/**
 * Prices a page is allowed to show, in CENTS: only tiers whose price is shown.
 * A hidden tier is ABSENT, not zero, so nothing can render it by accident.
 */
export type ShownPrices = Partial<Record<SponsorTier, number>>

/** "$5,000". Callers pass a shown price; there is no tier-keyed lookup here. */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US')}`
}

export interface SponsorLine { tier: SponsorTier; label: string; amount: number | null }

/**
 * An application as line items: the main tier (if any), then each item, each
 * with its price or null when that price is hidden. `total` is null when any
 * line is hidden - a total would reveal the hidden price by subtraction.
 */
export function sponsorLines(tier: SponsorTier | null, items: SponsorTier[], shown: ShownPrices): { lines: SponsorLine[]; total: number | null } {
  const main = tier && SPONSOR_TIERS[tier].group === 'main' ? tier : null
  const rest = [...new Set(items)].filter(i => i !== main)
  const lines = [main, ...rest].filter((t): t is SponsorTier => t !== null)
    .map(t => ({ tier: t, label: SPONSOR_TIERS[t].label, amount: shown[t] ?? null }))
  const total = lines.length > 0 && lines.every(l => l.amount !== null)
    ? lines.reduce((sum, l) => sum + (l.amount as number), 0)
    : null
  return { lines, total }
}
