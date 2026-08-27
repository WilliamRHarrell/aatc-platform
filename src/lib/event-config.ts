/**
 * Single source of truth for the current show's dates, venue and headline assets.
 *
 * Anything on the site that needs the show date imports from here — do not
 * re-declare dates in components. The `events` row in Supabase carries the same
 * start/end dates for application/booth logic; if you change the show dates,
 * change them in BOTH places or the countdown and the booth flow will disagree.
 */

export const EVENT_NAME = 'All American Tattoo Convention'
export const EVENT_YEAR = 2027

/** Absolute instants. Compared against Date.now(), so every visitor sees the
 *  same countdown regardless of their local timezone. */
export const DOORS_OPEN_ISO = '2027-04-16T16:00:00Z' // Fri Apr 16, 12:00 PM ET
export const SHOW_CLOSE_ISO = '2027-04-19T00:00:00Z' // Sun Apr 18,  8:00 PM ET

/** Human-readable strings — server-rendered so crawlers and no-JS users get
 *  something meaningful even before the countdown hydrates. */
export const EVENT_DATES_LABEL = 'April 16–18, 2027'
export const EVENT_DATES_SHORT = 'Apr 16–18, 2027'

export const VENUE_NAME = 'Crown Complex Event Center'
// Confirmed 2026-08-27 against what the Crown Complex publishes. 1960 Coliseum
// Drive is the official address for the complex and specifically for the Expo
// Center, and it is what navigation apps resolve. East Mountain Drive is an
// ENTRANCE, not an address — the old value ("131 E. Mountain Dr.") appears to
// have been a recorded entrance, and 131 is a digit off a catering contractor's
// office at 121. Never reintroduce it as the address.
export const VENUE_STREET = '1960 Coliseum Drive'
export const VENUE_CITY = 'Fayetteville'
export const VENUE_STATE = 'NC'
export const VENUE_POSTAL = '28306'
export const VENUE_MAP_URL = 'https://share.google/vRhsv0xqNzDRTPtGC'

export const CONTACT_EMAIL = 'info@allamericantattooconvention.com'
export const CONTACT_PHONE = '(910) 850-2566'

export const SOCIAL = {
  instagram: 'https://instagram.com/officialaatc',
  facebook: 'https://facebook.com/allamericantattooconvention',
  tiktok: 'https://tiktok.com/@officialaatc',
  x: 'https://x.com/officialaatc',
  xHandle: '@officialaatc',
} as const

const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-assets`

export const ASSETS = {
  logoHorizontal: `${STORAGE}/aatc-secondary-main-horizontal%202.png`,
  heroFlag: `${STORAGE}/AATC-large-bg-flag.png`,
  /** OG share image. Falls back to the horizontal logo until a purpose-built
   *  1200×630 card exists — a fallback beats a broken share preview. */
  ogImage: `${STORAGE}/aatc-secondary-main-horizontal%202.png`,
} as const

/**
 * Promo video. Set `youTubeId` when the video ID arrives and the homepage video
 * section appears automatically. Left null the section renders nothing at all —
 * an empty video frame reads as a bug, not a promise.
 */
export const PROMO_VIDEO: {
  youTubeId: string | null
  title: string
  /** 'vertical' = 9:16 phone footage; 'landscape' = 16:9. Drives the layout. */
  orientation: 'vertical' | 'landscape'
  /**
   * Optional hand-picked poster frame in Supabase Storage.
   *
   * Strongly preferred for vertical video. YouTube's thumbnail endpoints are
   * all 16:9 (maxresdefault/hqdefault/sddefault/mqdefault), so they pillarbox a
   * vertical frame — the player is fine but the poster looks broken. The only
   * native-portrait endpoint is frame0.jpg at 270x480, which is both low-res
   * for a ~400px container at 2x DPR and is literally frame zero, so it may be
   * a black frame or a title card.
   *
   * Set this to a still exported from the video and uploaded to site-assets and
   * both problems go away. Left null, the facade falls back to frame0.
   */
  posterUrl: string | null
} = {
  youTubeId: 'gAZ5Y5Mqh6k',
  title: '2025 AATC East Tattoo Convention — Fayetteville, Ft Bragg NC Highlights',
  orientation: 'vertical',
  posterUrl: null,
}

export interface ShowWinner {
  category: string
  imageUrl: string
  artistName: string
  studio?: string
  instagram?: string
}

/**
 * Best in Show winners, keyed by year so next April we swap the data rather
 * than rebuilding the section. Empty array = section renders nothing.
 *
 * Images must live in Supabase Storage — anything served from the WordPress
 * install breaks at DNS cutover.
 */
export const BEST_IN_SHOW: Record<number, ShowWinner[]> = {
  2026: [],
}

/** The most recent year we have winner photos for. */
export const BEST_IN_SHOW_YEAR = 2026

/**
 * Final balance due date. Was hardcoded identically in
 * admin/applications/page.tsx and api/admin/import-returning — the same class
 * of bug as migration 020's end-date typo: a date duplicated with nothing
 * asserting the copies agree.
 */
export const FINAL_DUE_AT = '2027-01-01T05:00:00Z' // 2027-01-01 00:00 America/New_York

/**
 * Display form of FINAL_DUE_AT, e.g. "January 1, 2027".
 *
 * Use this everywhere the deadline is shown to a person — never restate the
 * date as a literal. Five places did (portal/pay plus four email templates),
 * which meant an email about money owed could disagree with the value the
 * lifecycle sweep actually enforces. Rendered in Eastern time, which is what
 * FINAL_DUE_AT's offset expresses.
 */
export const FINAL_DUE_LABEL = new Date(FINAL_DUE_AT).toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/New_York',
})

export type ShowPhase = 'before' | 'during' | 'after'

export function showPhase(now: number = Date.now()): ShowPhase {
  const open = new Date(DOORS_OPEN_ISO).getTime()
  const close = new Date(SHOW_CLOSE_ISO).getTime()
  if (now < open) return 'before'
  if (now <= close) return 'during'
  return 'after'
}

/** Whole days remaining until doors open (0 once the show has started). */
export function daysUntilDoors(now: number = Date.now()): number {
  const diff = new Date(DOORS_OPEN_ISO).getTime() - now
  return diff <= 0 ? 0 : Math.floor(diff / 86400000)
}
