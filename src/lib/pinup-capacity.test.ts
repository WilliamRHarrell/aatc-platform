import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseCapacity, spotsRemaining, capacityCopy, LOWER_CAPACITY_NOTE } from '@/lib/pinup-capacity'

describe('parseCapacity', () => {
  it('accepts a positive integer', () => {
    expect(parseCapacity('25')).toEqual({ ok: true, value: 25 })
    expect(parseCapacity(' 40 ')).toEqual({ ok: true, value: 40 })
  })
  it('refuses zero, negatives, fractions and text', () => {
    for (const bad of ['0', '-3', '2.5', 'abc', '', '1e3']) {
      const r = parseCapacity(bad)
      expect(r.ok, bad).toBe(false)
    }
  })
})

describe('spotsRemaining', () => {
  it('is capacity minus taken', () => { expect(spotsRemaining(25, 10)).toBe(15) })
  it('clamps at zero when the cap was lowered below current entries', () => { expect(spotsRemaining(20, 25)).toBe(0) })
})

describe('capacityCopy', () => {
  it('quotes the live number in every sentence, never 25 by name', () => {
    const c = capacityCopy(30)
    expect(c.intro).toContain('30 contestants')
    expect(c.intro).toContain('fewer than 30')
    expect(c.waitlist).toContain('All 30 places')
    expect(c.email).toContain('All 30 places')
    for (const s of Object.values(c)) expect(s).not.toMatch(/\b25\b/)
  })
  it('the lowering note says nobody is removed', () => {
    expect(LOWER_CAPACITY_NOTE.toLowerCase()).toContain('does not remove')
  })
})

/**
 * One home. The cap used to be written in six places (two SQL defaults, the
 * admin constant, the route's email, two sentences of public copy). Any
 * literal 25 beside pinup wording in src/ fails the suite.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(p)
  }
  return out
}
const SRC = join(process.cwd(), 'src')

describe('pinup capacity has one home', () => {
  it('no literal 25 next to place / contestant / spot wording in src/', () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      const text = readFileSync(f, 'utf8')
      const m = text.match(/\b25\b[^\n]{0,40}\b(places?|contestants?|spots?)\b/i)
      if (m) offenders.push(`${f.replace(SRC, 'src')}: ${m[0]}`)
    }
    expect(offenders).toEqual([])
  })
  it('the SQL default is gone: the latest register_pinup_entry has no p_capacity parameter', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations')
    const latest = readdirSync(dir).filter(f => readFileSync(join(dir, f), 'utf8').includes('function public.register_pinup_entry')).sort().at(-1)!
    const sql = readFileSync(join(dir, latest), 'utf8')
    const sig = sql.slice(sql.lastIndexOf('create or replace function public.register_pinup_entry'))
    expect(sig.slice(0, sig.indexOf('returns'))).not.toContain('p_capacity')
  })
})
