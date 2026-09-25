import { describe, it, expect } from 'vitest'
import { computeSponsorAmount, primaryTier, validateSponsorSubmission, validateLogoFile, LOGO_MAX_BYTES } from '@/lib/sponsor-submission'
import { SPONSOR_TIERS } from '@/lib/sponsor-tiers'

describe('computeSponsorAmount', () => {
  it('sums the main tier and every individual item from the tier table', () => {
    expect(computeSponsorAmount('gold', ['vip_bag', 'rafter_banner']))
      .toBe(SPONSOR_TIERS.gold.amount + SPONSOR_TIERS.vip_bag.amount + SPONSOR_TIERS.rafter_banner.amount)
  })
  it('items only', () => { expect(computeSponsorAmount(null, ['vip_bag'])).toBe(SPONSOR_TIERS.vip_bag.amount) })
  it('ignores duplicates', () => { expect(computeSponsorAmount(null, ['vip_bag', 'vip_bag'])).toBe(SPONSOR_TIERS.vip_bag.amount) })
})

describe('primaryTier', () => {
  it('is the main tier when one is chosen', () => { expect(primaryTier('silver', ['vip_bag'])).toBe('silver') })
  it('otherwise the most expensive item', () => { expect(primaryTier(null, ['rafter_banner', 'collectible_coin'])).toBe('collectible_coin') })
})

describe('validateSponsorSubmission', () => {
  const good = { sponsorName: 'Acme', contactName: 'Jo', email: 'jo@acme.com', tier: 'gold', items: ['vip_bag'], phone: '', websiteUrl: 'https://acme.com', instagram: '', facebook: '', notes: '' }
  it('accepts a complete submission and computes the amount server-side', () => {
    const r = validateSponsorSubmission(good)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.values.amount).toBe(SPONSOR_TIERS.gold.amount + SPONSOR_TIERS.vip_bag.amount)
      expect(r.values.tier).toBe('gold')
      expect(r.values.additionalItems).toEqual(['vip_bag'])
      expect(r.values.website).toBe('https://acme.com')
    }
  })
  it('names each missing required field', () => {
    const r = validateSponsorSubmission({ ...good, sponsorName: ' ', contactName: '', email: 'nope' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['contactName', 'email', 'sponsorName'])
  })
  it('requires a tier or an item', () => {
    const r = validateSponsorSubmission({ ...good, tier: null, items: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors.tier).toBeTruthy()
  })
  it('rejects unknown tiers and items rather than pricing them', () => {
    const r = validateSponsorSubmission({ ...good, tier: 'diamond', items: ['jet'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors.tier).toBeTruthy()
  })
  it('never trusts a client amount', () => {
    const r = validateSponsorSubmission({ ...good, amount: 1 } as typeof good & { amount: number })
    expect(r.ok && r.values.amount).toBe(SPONSOR_TIERS.gold.amount + SPONSOR_TIERS.vip_bag.amount)
  })
})

describe('validateLogoFile', () => {
  it('no file is fine', () => { expect(validateLogoFile(null)).toBe(null) })
  it('accepts the four image types and names the extension', () => {
    expect(validateLogoFile({ type: 'image/png', size: 10 })).toEqual({ ok: true, ext: 'png' })
    expect(validateLogoFile({ type: 'image/svg+xml', size: 10 })).toEqual({ ok: true, ext: 'svg' })
  })
  it('refuses other types and oversize files', () => {
    expect(validateLogoFile({ type: 'application/pdf', size: 10 })).toHaveProperty('ok', false)
    expect(validateLogoFile({ type: 'image/png', size: LOGO_MAX_BYTES + 1 })).toHaveProperty('ok', false)
  })
})
