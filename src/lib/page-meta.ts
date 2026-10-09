import type { Metadata } from 'next'
import { canonical } from '@/lib/site'
import { ASSETS, EVENT_NAME, EVENT_YEAR, EVENT_DATES_LABEL, VENUE_NAME, SOCIAL } from '@/lib/event-config'

/**
 * Social previews and canonical for a public page (2026-10-09: most pages had
 * no og:image, og:url or canonical, so a shared link showed no picture).
 *
 * Give a page its own title and description; this adds the canonical (only
 * on the production host, see canonical()), og:url, og:site_name, the default
 * 1200x630 image (the home page's) unless the page brings its own, and the
 * matching Twitter card. Relative URLs resolve against metadataBase (the www
 * origin, root layout).
 */
export interface PageMetaInput {
  title: string
  description: string
  image?: { url: string; alt: string }
}

export const DEFAULT_SOCIAL_IMAGE = { url: ASSETS.ogImage, width: 1200, height: 630, alt: EVENT_NAME }

export function pageMetadata(path: string, { title, description, image }: PageMetaInput): Metadata {
  const img = image ? { url: image.url, width: 1200, height: 630, alt: image.alt } : DEFAULT_SOCIAL_IMAGE
  return {
    title,
    description,
    alternates: { canonical: canonical(path) },
    openGraph: { title, description, url: path, siteName: EVENT_NAME, type: 'website', images: [img] },
    twitter: { card: 'summary_large_image', site: SOCIAL.xHandle, creator: SOCIAL.xHandle, title, description, images: [img.url] },
  }
}

/** "<what> at the All American Tattoo Convention 2027, April 16-18, 2027 at the Crown Complex Event Center in Fayetteville, NC." */
export function atTheShow(what: string): string {
  return `${what} at the ${EVENT_NAME} ${EVENT_YEAR}, ${EVENT_DATES_LABEL} at the ${VENUE_NAME} in Fayetteville, NC.`
}

export const titled = (what: string) => `${what} | ${EVENT_NAME} ${EVENT_YEAR}`
