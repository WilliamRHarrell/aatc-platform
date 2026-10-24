import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GOLD_STAR_PASSES_SENTENCE } from './event-config'

/**
 * The Gold Star passes sentence has one home (event-config). Both pages must
 * render the constant; a hard-coded copy drifts, which is how the Crown
 * Complex co-donor fact went stale on one page (2026-10-23).
 */
const PAGES = ['src/app/info/wall-of-honor/page.tsx', 'src/app/events/vip-meet-greet/page.tsx']

describe('Gold Star passes sentence', () => {
  for (const page of PAGES) {
    const src = readFileSync(join(process.cwd(), page), 'utf8')
    it(`${page} renders the shared constant, not a copy`, () => {
      expect(src).toContain('GOLD_STAR_PASSES_SENTENCE')
      expect(src).not.toMatch(/donates? around 50/)
    })
  }

  it('names the Crown Complex as co-donor and ends at "family members."', () => {
    expect(GOLD_STAR_PASSES_SENTENCE).toContain('and the Cumberland County Crown Complex')
    expect(GOLD_STAR_PASSES_SENTENCE.endsWith('family members.')).toBe(true)
  })
})
