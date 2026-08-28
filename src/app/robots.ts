import type { MetadataRoute } from 'next'
import { IS_PRODUCTION_HOST, SITE_URL } from '@/lib/site'

/**
 * Disallow everything unless this deployment serves the real domain.
 *
 * aatc-platform.vercel.app had no robots.txt at all (404) and no robots meta,
 * so it was fully crawlable - a duplicate-content risk against the WordPress
 * site at cutover. Flipping NEXT_PUBLIC_SITE_URL to the production domain
 * turns this into a normal allow-all.
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION_HOST) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/portal', '/api', '/auth'] }],
    sitemap: `${SITE_URL.replace(/\/$/, '')}/sitemap.xml`,
  }
}
