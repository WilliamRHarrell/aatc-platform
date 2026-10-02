import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  calculatePricing, ADDON_PRICES, ARTIST_SINGLE_PRICE, ARTIST_DOUBLE_PRICE, VENDOR_SINGLE_PRICE, VENDOR_DOUBLE_PRICE,
  CORNER_FEE, PERMIT_FEE_PER_ARTIST, VETERAN_DISCOUNT, type AddOn,
} from '@/lib/pricing'

/**
 * ONE HOME for prices is src/lib/pricing.ts. Migration 079 mirrors it in SQL
 * (application_list_price) so the database can refuse a client total. This
 * test generates a SQL matrix from calculatePricing() and pins the committed
 * file to it; verify_079 runs the matrix against the function live. Any price
 * change in pricing.ts fails this test until the matrix is regenerated:
 *   WRITE_PRICING_MATRIX=1 npx vitest run src/lib/pricing-matrix.test.ts
 * and then a new migration must carry the same numbers into the function.
 */
const OUT = join(process.cwd(), 'supabase', 'verify', 'verify_079_matrix.sql')

type Case = { label: string; exhibitorType: 'artist' | 'vendor'; as: number; ad: number; vs: number; vd: number; corners: number; artists: number; addOns: AddOn[]; veteran: boolean }
const A = (kind: AddOn['kind'], qty: number, term: AddOn['term'] = null): AddOn => ({ kind, qty, term })
const CASES: Case[] = [
  { label: 'vendor single', exhibitorType: 'vendor', as: 0, ad: 0, vs: 1, vd: 0, corners: 0, artists: 0, addOns: [], veteran: false },
  { label: 'vendor single + corner', exhibitorType: 'vendor', as: 0, ad: 0, vs: 1, vd: 0, corners: 1, artists: 0, addOns: [], veteran: false },
  { label: 'vendor single + extra chairs', exhibitorType: 'vendor', as: 0, ad: 0, vs: 1, vd: 0, corners: 0, artists: 0, addOns: [A('extra_chairs', 1)], veteran: false },
  { label: 'vendor double', exhibitorType: 'vendor', as: 0, ad: 0, vs: 0, vd: 1, corners: 0, artists: 0, addOns: [], veteran: false },
  { label: 'vendor 2 singles, corners over the booth count are clamped', exhibitorType: 'vendor', as: 0, ad: 0, vs: 2, vd: 0, corners: 5, artists: 0, addOns: [], veteran: false },
  { label: 'vendor veteran', exhibitorType: 'vendor', as: 0, ad: 0, vs: 1, vd: 0, corners: 0, artists: 0, addOns: [], veteran: true },
  { label: 'vendor ignores artist quantities', exhibitorType: 'vendor', as: 3, ad: 0, vs: 1, vd: 0, corners: 0, artists: 5, addOns: [], veteran: false },
  { label: 'artist single, 1 artist', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 1, addOns: [], veteran: false },
  { label: 'artist single, 2 artists', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 2, addOns: [], veteran: false },
  { label: 'artist single, 9 artists: permits capped at 2 per single', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 9, addOns: [], veteran: false },
  { label: 'artist double, 4 artists, corner', exhibitorType: 'artist', as: 0, ad: 1, vs: 0, vd: 0, corners: 1, artists: 4, addOns: [], veteran: false },
  { label: 'artist single + double, 6 artists, 2 corners', exhibitorType: 'artist', as: 1, ad: 1, vs: 0, vd: 0, corners: 2, artists: 6, addOns: [], veteran: false },
  { label: 'artist veteran', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 1, addOns: [], veteran: true },
  { label: 'artist ignores vendor quantities', exhibitorType: 'artist', as: 1, ad: 0, vs: 2, vd: 1, corners: 0, artists: 1, addOns: [], veteran: false },
  { label: 'add-on extra table x2', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 1, addOns: [A('extra_table', 2)], veteran: false },
  { label: 'add-on tattoo bed daily', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 1, addOns: [A('tattoo_bed', 1, 'daily')], veteran: false },
  { label: 'add-on tattoo bed weekend x2', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 1, addOns: [A('tattoo_bed', 2, 'weekend')], veteran: false },
  { label: 'add-on arm rest daily + tattoo light weekend', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 1, addOns: [A('arm_rest', 1, 'daily'), A('tattoo_light', 1, 'weekend')], veteran: false },
  { label: 'add-on with an unpriced term is ignored', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 1, addOns: [A('tattoo_bed', 1, 'weekly')], veteran: false },
  { label: 'add-on qty 0 is ignored', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 1, addOns: [A('extra_chairs', 0)], veteran: false },
  { label: 'everything: artist single + double, 8 artists, 2 corners, add-ons, veteran', exhibitorType: 'artist', as: 1, ad: 1, vs: 0, vd: 0, corners: 2, artists: 8, addOns: [A('extra_table', 1), A('tattoo_bed', 1, 'weekend'), A('arm_rest', 2, 'daily')], veteran: true },
  // 088: permits cap at 2 per single, 4 per double (the county rule).
  { label: 'artist single, 3 artists: permits capped at 2', exhibitorType: 'artist', as: 1, ad: 0, vs: 0, vd: 0, corners: 0, artists: 3, addOns: [], veteran: false },
  { label: 'artist double, 5 artists: permits capped at 4', exhibitorType: 'artist', as: 0, ad: 1, vs: 0, vd: 0, corners: 0, artists: 5, addOns: [], veteran: false },
  { label: 'artist 2 singles + 1 double, 9 artists: permits capped at 8', exhibitorType: 'artist', as: 2, ad: 1, vs: 0, vd: 0, corners: 0, artists: 9, addOns: [], veteran: false },
  { label: 'zero booths, everything else set: zero base, permits clamped to 0, corners 0', exhibitorType: 'artist', as: 0, ad: 0, vs: 0, vd: 0, corners: 3, artists: 3, addOns: [], veteran: false },
]

function render(): string {
  const lines = CASES.map(c => {
    const total = calculatePricing({ exhibitorType: c.exhibitorType, artistSingleQty: c.as, artistDoubleQty: c.ad, vendorSingleQty: c.vs, vendorDoubleQty: c.vd, cornerCount: c.corners, artistCount: c.artists, addOns: c.addOns, isVeteran: c.veteran }).total
    const addOns = JSON.stringify(c.addOns).replace(/'/g, "''")
    return `  v := public.application_list_price('${c.exhibitorType}', ${c.as}, ${c.ad}, ${c.vs}, ${c.vd}, ${c.corners}, ${c.artists}, '${addOns}'::jsonb, ${c.veteran});\n` +
           `  if v <> ${total} then raise exception 'FAIL MATRIX: ${c.label.replace(/'/g, "''")}: got %, pricing.ts says ${total}', v; end if;`
  })
  return `-- ============================================================\n-- GENERATED by src/lib/pricing-matrix.test.ts from src/lib/pricing.ts. DO NOT EDIT.\n-- Paste after verify_079.sql. Every case: application_list_price() must equal calculatePricing().total.\n-- ============================================================\ndo $$\ndeclare v int;\nbegin\n${lines.join('\n')}\n  raise notice 'PASS MATRIX: application_list_price() equals calculatePricing() on ${CASES.length} cases';\nend $$;\n`
}

describe('pricing matrix', () => {
  it('the committed verify_079_matrix.sql equals what pricing.ts produces (regenerate with WRITE_PRICING_MATRIX=1)', () => {
    const expected = render()
    if (process.env.WRITE_PRICING_MATRIX === '1') writeFileSync(OUT, expected)
    expect(existsSync(OUT), 'verify_079_matrix.sql missing - run with WRITE_PRICING_MATRIX=1').toBe(true)
    expect(readFileSync(OUT, 'utf8')).toBe(expected)
  })
  it('the LIVE application_list_price carries the same prices as pricing.ts (source check, no typed numbers)', () => {
    // The live definition is the highest-numbered migration that (re)creates it.
    const MIG = join(process.cwd(), 'supabase/migrations')
    const latest = readdirSync(MIG).filter(f => /^\d{3}.*\.sql$/.test(f)).sort()
      .filter(f => /function public\.application_list_price\(/i.test(readFileSync(join(MIG, f), 'utf8'))).pop()!
    const sql = readFileSync(join(MIG, latest), 'utf8')
    const constant = (name: string) => {
      const m = sql.match(new RegExp(`${name}\\s+constant int := (\\d+);`))
      expect(m, `${latest}: ${name}`).not.toBeNull()
      return Number(m![1])
    }
    expect(constant('c_artist_single'), 'c_artist_single').toBe(ARTIST_SINGLE_PRICE)
    expect(constant('c_artist_double'), 'c_artist_double').toBe(ARTIST_DOUBLE_PRICE)
    expect(constant('c_vendor_single'), 'c_vendor_single').toBe(VENDOR_SINGLE_PRICE)
    expect(constant('c_vendor_double'), 'c_vendor_double').toBe(VENDOR_DOUBLE_PRICE)
    expect(constant('c_corner'), 'c_corner').toBe(CORNER_FEE)
    expect(constant('c_permit'), 'c_permit').toBe(PERMIT_FEE_PER_ARTIST)
    expect(constant('c_veteran'), 'c_veteran').toBe(VETERAN_DISCOUNT)
    // Add-ons: every kind and term in ADDON_PRICES appears in the SQL case with the same cents.
    for (const [kind, prices] of Object.entries(ADDON_PRICES)) {
      const arm = sql.match(new RegExp(`when '${kind}'\\s+then ([^\\n]+)`))
      expect(arm, `${latest}: add-on ${kind}`).not.toBeNull()
      for (const [term, cents] of Object.entries(prices)) {
        if (term === '_flat') expect(arm![1].trim(), `${kind} flat`).toMatch(new RegExp(`^${cents}\\b`))
        else expect(arm![1], `${kind} ${term}`).toMatch(new RegExp(`when '${term}' then ${cents}\\b`))
      }
    }
  })
})
