import { safeHttpUrl } from './tattoo-battle'

/** The columns a public page needs from `venues`. Nothing private lives on the table. */
export interface VenueLite {
  name: string
  slug: string
  blurb: string
  address: string | null
  phone: string | null
  website_url: string | null
  instagram_url: string | null
  instagram_label: string | null
  facebook_url: string | null
  tiktok_url: string | null
  logo_slot: string | null
}

export type LinkKind = 'website' | 'instagram' | 'facebook' | 'tiktok'
export interface VenueLink { kind: LinkKind; href: string; label: string }

/**
 * Icon links in a fixed order, only for URLs that exist and are http(s).
 * `instagram_label` overrides the Instagram label (Ryan: Club Luna's account is
 * shared with Dad Bod District), but never creates a link on its own.
 */
export function venueLinks(v: VenueLite): VenueLink[] {
  const out: VenueLink[] = []
  const web = safeHttpUrl(v.website_url)
  if (web) out.push({ kind: 'website', href: web, label: `${v.name} website` })
  const ig = safeHttpUrl(v.instagram_url)
  if (ig) out.push({ kind: 'instagram', href: ig, label: v.instagram_label?.trim() || `${v.name} on Instagram` })
  const fb = safeHttpUrl(v.facebook_url)
  if (fb) out.push({ kind: 'facebook', href: fb, label: `${v.name} on Facebook` })
  const tt = safeHttpUrl(v.tiktok_url)
  if (tt) out.push({ kind: 'tiktok', href: tt, label: `${v.name} on TikTok` })
  return out
}

/** Moved from homepage-content.ts when AFTER_PARTIES retired (070). Same output. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** ISO dates compare as strings. Strictly before the event's first day. */
export function isPreConvention(dayDate: string, eventStartDate: string): boolean {
  return dayDate < eventStartDate
}

/** 'YYYY-MM-DD' -> a local Date built from parts. `new Date(iso)` would be UTC midnight and shift a day west of Greenwich. */
function fromParts(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** The per-night page_images slug: after-party-thursday ... after-party-sunday. */
export function weekdaySlug(dayDate: string): string {
  const weekday = fromParts(dayDate).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  return `after-party-${weekday}`
}

/** { night: 'Thursday', date: 'April 15' } for the card header. */
export function nightLabel(dayDate: string): { night: string; date: string } {
  const d = fromParts(dayDate)
  return {
    night: d.toLocaleDateString('en-US', { weekday: 'long' }),
    date: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
  }
}
