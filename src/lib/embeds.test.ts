import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * booths has TWO foreign keys to applications since migration 087
 * (application_id, held_for_application_id). PostgREST then refuses an
 * unqualified embed between the two tables with PGRST201 ("more than one
 * relationship"): /admin/print's booth packets broke that way (found
 * 2026-10-03). Any embed of applications from booths, or of booths from
 * applications, must name the foreign key.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(n) && !n.endsWith('.test.ts')) out.push(p)
  }
  return out
}

describe('booths <-> applications embeds name their foreign key', () => {
  it('no unqualified embed in src/', () => {
    const offenders: string[] = []
    for (const f of walk(join(process.cwd(), 'src'))) {
      const src = readFileSync(f, 'utf8')
      // Only queries that start from booths can embed applications ambiguously, and vice versa.
      for (const m of src.matchAll(/\.from\('booths'\)[\s\S]{0,400}?\.select\(([`'])([\s\S]*?)\1/g)) {
        if (/\bapplications\s*\(/.test(m[2]) && !/applications!booths_(held_for_)?application_id_fkey\s*\(/.test(m[2])) offenders.push(`${f}: booths -> applications`)
      }
      for (const m of src.matchAll(/\.from\('applications'\)[\s\S]{0,400}?\.select\(([`'])([\s\S]*?)\1/g)) {
        if (/\bbooths\s*\(/.test(m[2]) && !/booths!booths_(held_for_)?application_id_fkey\s*\(/.test(m[2])) offenders.push(`${f}: applications -> booths`)
      }
    }
    expect(offenders).toEqual([])
  })
})
