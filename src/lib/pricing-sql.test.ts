import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Closes the loop between pricing.ts and the database on every `npm test`:
 * pricing-matrix.test.ts pins verify_079_matrix.sql to calculatePricing(), and
 * this runs that matrix against application_list_price() as rebuilt by
 * replaying every migration (scripts/verify-local.mjs). Change a price or the
 * 2-per-single / 4-per-double permit cap on one side only and this fails here,
 * not live.
 */
describe('application_list_price (replayed) equals pricing.ts', () => {
  it('every matrix case', async () => {
    const harness = join(process.cwd(), 'scripts/verify-local.mjs')
    const { buildReplay } = await import(/* @vite-ignore */ harness)
    const db = await buildReplay({ seed: false, log: () => {} })
    const matrix = readFileSync(join(process.cwd(), 'supabase/verify/verify_079_matrix.sql'), 'utf8')
    const notices: string[] = []
    await db.exec(matrix, { onNotice: (m: { message: string }) => notices.push(m.message) })
    expect(notices.join('\n')).toMatch(/PASS MATRIX/)
  }, 60_000)
})
