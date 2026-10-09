import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
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

/**
 * /apply/food-truck (#75) was missing from the sitemap after the cutover: the
 * sitemap lists ROUTES, and the page was linked without being added there.
 * Every public page file must be in the sitemap or named here with a reason.
 */
describe('every public page is in the sitemap', () => {
  // Sign-in required (src/proxy.ts): a crawler would only see the login redirect.
  const NOT_LISTED = ['/apply/artist', '/apply/vendor']
  it('static public pages under src/app are listed, except the named ones', () => {
    const pages: string[] = []
    const walk = (dir: string, route: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
          if (name.startsWith('[') || name.startsWith('(') || name.startsWith('_')) continue // dynamic: listed from data
          walk(full, `${route}/${name}`)
        } else if (name === 'page.tsx') pages.push(route || '/')
      }
    }
    walk(join(process.cwd(), 'src', 'app'), '')
    const listed = new Set(buildSitemap({ directoryIds: [], battleBuckets: [] }).map(e => e.url.replace(CANONICAL_ORIGIN, '') || '/'))
    const missing = pages.filter(p => !isExcluded(p) && !NOT_LISTED.includes(p) && !listed.has(p))
    expect(missing).toEqual([])
    expect(listed.has('/apply/food-truck')).toBe(true)
  })
})
