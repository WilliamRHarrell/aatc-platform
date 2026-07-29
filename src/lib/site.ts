/**
 * Canonical host and indexability.
 *
 * Everything keys off NEXT_PUBLIC_SITE_URL, so flipping that one env var at DNS
 * cutover is the single switch that turns indexing on. Until then the preview
 * host serves noindex and a disallow-all robots.txt, so it cannot compete with
 * the WordPress site for the real domain's rankings.
 *
 * Deliberately NOT emitting canonicals to allamericantattooconvention.com
 * before cutover: WordPress does not serve /directory or most of the new
 * routes, so those canonicals would assert URLs that 404.
 */
export const PRODUCTION_HOST = 'allamericantattooconvention.com'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/** True only when this deployment is serving the real domain. */
export const IS_PRODUCTION_HOST = SITE_URL.includes(PRODUCTION_HOST)

/**
 * Canonical URL for a path, or undefined off-production.
 * Undefined means "emit no canonical", which is correct for a preview host —
 * better than pointing at a URL that does not exist yet.
 */
export function canonical(path = '/'): string | undefined {
  if (!IS_PRODUCTION_HOST) return undefined
  return path === '/' ? SITE_URL : `${SITE_URL.replace(/\/$/, '')}${path}`
}

/** Metadata.robots value — noindex everywhere except the production host. */
export const ROBOTS_META = IS_PRODUCTION_HOST
  ? undefined
  : { index: false, follow: false, nocache: true }
