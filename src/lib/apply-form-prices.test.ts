import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ADDON_PRICES, ARTIST_SINGLE_PRICE, ARTIST_DOUBLE_PRICE, VENDOR_SINGLE_PRICE, VENDOR_DOUBLE_PRICE,
  CORNER_FEE, PERMIT_FEE_PER_ARTIST, VETERAN_DISCOUNT,
} from '@/lib/pricing'
import { PRICE_CHANGED_MESSAGE, isPriceMismatchError } from '@/lib/price-mismatch'

/**
 * Prices have one home, src/lib/pricing.ts. The artist form once multiplied
 * by a typed 5000 next to a label read from PERMIT_FEE_PER_ARTIST, so the two
 * would have disagreed the day the fee changed. No price, in cents or as
 * "$NN", may be typed into an apply form.
 */
const FORMS = ['src/app/apply/artist/ArtistApplyForm.tsx', 'src/app/apply/vendor/VendorApplyForm.tsx']
const cents = new Set<number>([
  ARTIST_SINGLE_PRICE, ARTIST_DOUBLE_PRICE, VENDOR_SINGLE_PRICE, VENDOR_DOUBLE_PRICE,
  CORNER_FEE, PERMIT_FEE_PER_ARTIST, VETERAN_DISCOUNT,
  ...Object.values(ADDON_PRICES).flatMap(p => Object.values(p)),
])
const dollars = new Set([...cents].map(c => c / 100))

describe('apply forms type no prices', () => {
  for (const f of FORMS) {
    const src = readFileSync(join(process.cwd(), f), 'utf8')
    it(`${f}: no price in cents`, () => {
      const hits = [...src.matchAll(/\b\d{4,6}\b/g)].map(m => Number(m[0])).filter(n => cents.has(n))
      expect(hits).toEqual([])
    })
    it(`${f}: no "$NN" price string`, () => {
      const hits = [...src.matchAll(/\$(\d[\d,]*)(?!\{)/g)].map(m => Number(m[1].replace(/,/g, ''))).filter(n => dollars.has(n))
      expect(hits).toEqual([])
    })
  }
})

describe('list-price refusal message', () => {
  it('recognises the 079 refusal and nothing else', () => {
    expect(isPriceMismatchError({ message: 'total_amount 85000 does not match the list price 87500 for this application' })).toBe(true)
    expect(isPriceMismatchError({ message: 'duplicate key value violates unique constraint' })).toBe(false)
    expect(isPriceMismatchError(null)).toBe(false)
    expect(PRICE_CHANGED_MESSAGE).toMatch(/reload/i)
  })
  it('both forms show it', () => {
    for (const f of FORMS) expect(readFileSync(join(process.cwd(), f), 'utf8'), f).toContain('isPriceMismatchError(error) ? PRICE_CHANGED_MESSAGE')
  })
})
