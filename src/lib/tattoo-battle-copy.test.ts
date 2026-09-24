import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { battleStartLabel, SIGNUP_COPY, RULES, VETERAN_INK } from '@/lib/tattoo-battle-config'

/**
 * "A fact gets one home" (HANDOFF). The Battle's start time and the charity
 * description each live in exactly one place in src/; every sentence that
 * names them is built from that place. These tests read the source tree so a
 * future hand-typed "1 PM" or a paraphrased charity blurb fails the suite.
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
const files = walk(SRC)
const read = (p: string) => readFileSync(p, 'utf8')

describe('battle start label', () => {
  it('is derived from BATTLE_START and reads "1 PM" today (no minutes when on the hour)', () => {
    expect(battleStartLabel()).toBe('1 PM')
    expect(battleStartLabel('2027-04-16T13:30:00-04:00')).toBe('1:30 PM')
  })
  it('every sentence that names the start time is built from the label', () => {
    expect(SIGNUP_COPY).toContain(battleStartLabel())
    expect(RULES.find(r => r.title.endsWith('limit'))?.text).toContain(battleStartLabel())
  })
  it('no file in src/ hand-types "1 PM"', () => {
    const offenders = files.filter(f => /\b1 PM\b/.test(read(f)))
    expect(offenders.map(f => f.replace(SRC, 'src'))).toEqual([])
  })
})

describe('charity description has one home', () => {
  it('the 501(c)(3) sentence appears only in tattoo-battle-config.ts', () => {
    const offenders = files.filter(f => read(f).includes('501(c)(3)')).map(f => f.replace(SRC, 'src'))
    expect(offenders).toEqual(['src/lib/tattoo-battle-config.ts'])
    expect(VETERAN_INK.description).toContain('501(c)(3)')
  })
})
