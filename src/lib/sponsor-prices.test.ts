import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { SPONSOR_PRICES, shownPrices, type PriceVisibility } from './sponsor-prices'
import { ALL_HIDDEN, visibilityFromRows } from './sponsor-price-visibility'
import { ALL_TIERS, SPONSOR_TIERS, sponsorLines } from './sponsor-tiers'
import { sponsorReceivedEmail, internalNewSponsorEmail } from './email-templates'

const SRC = join(process.cwd(), 'src')
const FOLLOW_UP = "We'll follow up with pricing"
/** The 084 defaults: packages hidden, items shown. */
const DEFAULTS = Object.fromEntries(ALL_TIERS.map(t => [t, SPONSOR_TIERS[t].group === 'individual'])) as PriceVisibility
const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

describe('shownPrices', () => {
  it('carries shown tiers only; a hidden tier is absent, not zero', () => {
    const shown = shownPrices(DEFAULTS)
    expect(shown.vip_bag).toBe(SPONSOR_PRICES.vip_bag)
    expect('gold' in shown).toBe(false)
    expect('title' in shown).toBe(false)
  })
})

describe('visibilityFromRows fails closed', () => {
  it('a tier with no row is hidden', () => {
    const v = visibilityFromRows([{ tier: 'vip_bag', show_price: true }])
    expect(v.vip_bag).toBe(true)
    expect(v.gold).toBe(false)
    expect(v.artist_lounge).toBe(false)
  })
  it('ignores an unknown tier', () => {
    expect(visibilityFromRows([{ tier: 'diamond', show_price: true }])).toEqual(ALL_HIDDEN)
  })
})

describe('sponsorLines', () => {
  it('hidden package + shown items: items priced, package null, no total', () => {
    const r = sponsorLines('gold', ['vip_bag', 'rafter_banner'], shownPrices(DEFAULTS))
    expect(r.lines.map(l => [l.tier, l.amount])).toEqual([['gold', null], ['vip_bag', SPONSOR_PRICES.vip_bag], ['rafter_banner', SPONSOR_PRICES.rafter_banner]])
    expect(r.total).toBeNull()
  })
  it('items only, all shown: a total', () => {
    const r = sponsorLines('vip_bag', ['vip_bag', 'artist_lounge'], shownPrices(DEFAULTS))
    expect(r.lines).toHaveLength(2)
    expect(r.total).toBe(SPONSOR_PRICES.vip_bag + SPONSOR_PRICES.artist_lounge)
  })
})

describe('sponsor emails', () => {
  const shown = shownPrices(DEFAULTS)
  it('receipt: no hidden package price and no total, item prices line by line', () => {
    const html = sponsorReceivedEmail('ZZ Test Co', 'gold', ['vip_bag'], shown, FOLLOW_UP)
    expect(html).not.toContain(usd(SPONSOR_PRICES.gold))
    expect(html).not.toContain(usd(SPONSOR_PRICES.gold + SPONSOR_PRICES.vip_bag))
    expect(html).toContain(usd(SPONSOR_PRICES.vip_bag))
    expect(html).toContain('We&#39;ll follow up with pricing')
    expect(html).not.toMatch(/>Total</)
  })
  it('receipt: items only shows the total', () => {
    const html = sponsorReceivedEmail('ZZ Test Co', 'vip_bag', ['vip_bag'], shown, FOLLOW_UP)
    expect(html).toMatch(/>Total</)
  })
  it('internal notice keeps the list price', () => {
    const amount = SPONSOR_PRICES.gold + SPONSOR_PRICES.vip_bag
    const html = internalNewSponsorEmail({ sponsorName: 'ZZ Test Co', contactName: 'ZZ', email: 'zz@example.com', phone: null, tier: 'gold', items: ['vip_bag'], amount, notes: null })
    expect(html).toContain(usd(amount))
  })
})

describe('084 seed', () => {
  it('matches the agreed defaults: packages hidden, items shown', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '084_sponsor_tier_settings.sql'), 'utf8')
    for (const t of ALL_TIERS) {
      const m = sql.match(new RegExp(`\\('${t}',\\s*(true|false)\\)`))
      expect(m, t).not.toBeNull()
      expect(m![1] === 'true', t).toBe(DEFAULTS[t])
    }
  })
})

/**
 * THE LEAK GUARD. Every module a 'use client' file reaches is shipped as public
 * JavaScript. If sponsor-prices.ts is reachable from one, every list price is in
 * page source again, shown or not.
 */
describe('the price table never reaches the browser', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f)) out.push(p)
    }
    return out
  }
  function resolveImport(from: string, spec: string): string | null {
    const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null
    if (!base) return null
    for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
      if (existsSync(c) && statSync(c).isFile()) return c
    }
    return null
  }
  const importsOf = (file: string) =>
    [...readFileSync(file, 'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm)]
      .map(m => resolveImport(file, m[1] ?? m[2] ?? m[3])).filter((p): p is string => p !== null)

  it('no client component imports lib/sponsor-prices.ts, directly or transitively', () => {
    const target = join(SRC, 'lib', 'sponsor-prices.ts')
    const clients = walk(SRC).filter(f => /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8')))
    expect(clients.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const c of clients) {
      const seen = new Set<string>([c])
      const queue = [c]
      while (queue.length) {
        const f = queue.shift()!
        if (f === target) { offenders.push(c.replace(SRC, 'src')); break }
        for (const n of importsOf(f)) if (!seen.has(n)) { seen.add(n); queue.push(n) }
      }
    }
    expect(offenders).toEqual([])
  })
})
