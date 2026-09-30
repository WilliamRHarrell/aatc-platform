import type { MetadataRoute } from 'next'
import { ROUTES } from '@/lib/routes'
import { CANONICAL_ORIGIN } from '@/lib/site'

/**
 * The sitemap's URL list, kept pure so it can be tested without a database.
 * src/app/sitemap.ts supplies the dynamic ids.
 *
 * Static pages come from ROUTES (the one home for public URLs), so a page added
 * there is in the sitemap without another edit. Every URL is on the canonical
 * www origin (CANONICAL_ORIGIN), whatever host serves the file.
 */

/** Never in the sitemap: robots.txt disallows these, and none is a search result. */
export const SITEMAP_EXCLUDED_PREFIXES = ['/admin', '/portal', '/auth', '/api'] as const

export function isExcluded(path: string): boolean {
  return SITEMAP_EXCLUDED_PREFIXES.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'))
}

export function absolute(path: string): string {
  return path === '/' ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}${path}`
}

export interface SitemapInputs {
  /** applications_public ids with status approved: the exhibitors /directory lists. */
  directoryIds: string[]
  /** Tattoo Battle buckets with a published entry. Unpublished buckets are noindex holding pages. */
  battleBuckets: number[]
}

export function buildSitemap({ directoryIds, battleBuckets }: SitemapInputs): MetadataRoute.Sitemap {
  const staticPaths = [...new Set(Object.values(ROUTES) as string[])].filter(p => !isExcluded(p))
  return [
    ...staticPaths.map(p => ({ url: absolute(p) })),
    ...directoryIds.map(id => ({ url: absolute(`${ROUTES.directory}/${id}`) })),
    ...battleBuckets.map(n => ({ url: absolute(`${ROUTES.tattooBattle}/entry/${n}`) })),
  ]
}
