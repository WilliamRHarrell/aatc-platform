import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CONTACT_EMAIL } from '@/lib/event-config'

/**
 * The contact address has one home (CONTACT_EMAIL). A3 (2026-09-23) found a
 * wrong domain typed into /events/tattoo-panels; this reads the source tree so
 * a second hand-typed address, right or wrong, fails the suite.
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

describe('contact email', () => {
  it('the wrong domain appears nowhere in src/', () => {
    const offenders = files.filter(f => /armoredarmadillo/i.test(readFileSync(f, 'utf8'))).map(f => f.replace(SRC, 'src'))
    expect(offenders).toEqual([])
  })
  it('CONTACT_EMAIL is the site address', () => {
    expect(CONTACT_EMAIL).toBe('info@allamericantattooconvention.com')
  })
})
