import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Since migration 075 the anon role has no grant on the applications table;
 * public reads go through the applications_public view. The dashboard funnel
 * measured "visible" with an anonymous client against the table and showed
 * "permission denied for table applications" (2026-10-03).
 */
describe('anonymous reads use applications_public', () => {
  it('the directory funnel counts the public view, not the table', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/admin/directory-health/route.ts'), 'utf8')
    const anonReads = [...src.matchAll(/await anon\s*\.from\('([a-z_]+)'\)/g)].map(m => m[1])
    expect(anonReads).toEqual(['applications_public'])
  })
})
