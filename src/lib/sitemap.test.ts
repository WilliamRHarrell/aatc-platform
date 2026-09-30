import { describe, it, expect } from 'vitest'
import { buildSitemap, isExcluded } from '@/lib/sitemap'
import { ROUTES } from '@/lib/routes'
import { CANONICAL_ORIGIN } from '@/lib/site'

describe('sitemap', () => {
  const urls = buildSitemap({ directoryIds: ['abc-1', 'def-2'], battleBuckets: [3, 12] }).map(e => e.url)

  it('every URL is on the canonical www origin', () => {
    expect(CANONICAL_ORIGIN).toBe('https://www.allamericantattooconvention.com')
    for (const u of urls) expect(u.startsWith(`${CANONICAL_ORIGIN}/`), u).toBe(true)
  })
  it('lists every public page in ROUTES', () => {
    for (const p of Object.values(ROUTES)) {
      if (isExcluded(p)) continue
      expect(urls, p).toContain(p === '/' ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}${p}`)
    }
  })
  it('never lists admin, portal, auth or the API', () => {
    for (const u of urls) expect(new URL(u).pathname, u).not.toMatch(/^\/(admin|portal|auth|api)(\/|$)/)
    expect(isExcluded(ROUTES.portal)).toBe(true)
    expect(isExcluded(ROUTES.portalSignIn)).toBe(true)
  })
  it('adds directory entries and published battle buckets, once each', () => {
    expect(urls).toContain(`${CANONICAL_ORIGIN}/directory/abc-1`)
    expect(urls).toContain(`${CANONICAL_ORIGIN}/tattoo-battle/entry/12`)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
