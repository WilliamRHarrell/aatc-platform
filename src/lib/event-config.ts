/**
 * Single source of truth for the current show's dates, venue and headline assets.
 *
 * Anything on the site that needs the show date imports from here - do not
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

/** Human-readable strings - server-rendered so crawlers and no-JS users get
 *  something meaningful even before the countdown hydrates. */
export const EVENT_DATES_LABEL = 'April 16-18, 2027'
export const EVENT_DATES_SHORT = 'Apr 16-18, 2027'

export const VENUE_NAME = 'Crown Complex Event Center'
// Confirmed 2026-08-27 against what the Crown Complex publishes. 1960 Coliseum
// Drive is the official address for the complex and specifically for the Expo
// Center, and it is what navigation apps resolve. East Mountain Drive is an
// ENTRANCE, not an address - the old value ("131 E. Mountain Dr.") appears to
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
   *  1200×630 card exists - a fallback beats a broken share preview. */
  ogImage: `${STORAGE}/aatc-secondary-main-horizontal%202.png`,
} as const

/**
 * Promo video. Set `youTubeId` when the video ID arrives and the homepage video
 * section appears automatically. Left null the section renders nothing at all -
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
   * vertical frame - the player is fine but the poster looks broken. The only
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
  title: '2025 AATC East Tattoo Convention - Fayetteville, Ft Bragg NC Highlights',
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
 * Images must live in Supabase Storage - anything served from the WordPress
 * install breaks at DNS cutover.
 */
export const BEST_IN_SHOW: Record<number, ShowWinner[]> = {
  2026: [],
}

/** The most recent year we have winner photos for. */
export const BEST_IN_SHOW_YEAR = 2026

/**
 * Final balance due date. Was hardcoded identically in
 * admin/applications/page.tsx and api/admin/import-returning - the same class
 * of bug as migration 020's end-date typo: a date duplicated with nothing
 * asserting the copies agree.
 */
export const FINAL_DUE_AT = '2027-01-01T05:00:00Z' // 2027-01-01 00:00 America/New_York

/**
 * Display form of FINAL_DUE_AT, e.g. "January 1, 2027".
 *
 * Use this everywhere the deadline is shown to a person - never restate the
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

/**
 * Miss AATC Pinup Contest online registration.
 *
 * TRUE as of 2026-08-31. Rate limiting is live and VERIFIED BY OBSERVATION, not
 * by configuration: 8 POSTs to /api/pinup-entry produced five 503s (route
 * closed) then 403 on requests 6, 7 and 8, with the blocks logged in the Vercel
 * Firewall tab. The threshold fired exactly on the sixth request, which also
 * shows that 503s from the closed route still counted toward the limit.
 *
 * Was FALSE until rate limiting landed. POST /api/pinup-entry is the first anonymous
 * unauthenticated write path in this repo and there is no rate limiting or
 * captcha anywhere in it. 25 junk entries would corrupt the list for a contest
 * capped at 25, days before the show, with no way to tell real from fake.
 *
 * Read by BOTH the form and the route. Hiding the form alone would not close
 * anything - the endpoint is the exposed surface, and it accepts a POST whether
 * or not a form is rendered. Flip this once, in the commit that adds the rate
 * limiting.
 */
export const PINUP_REGISTRATION_OPEN = true

/** Places in the pinup contest. Past this, entries are waitlisted, not refused. */
export const PINUP_CAPACITY = 25

/**
 * Miss AATC Pinup Contest prizes. Confirmed by Ryan, 2026-08-28.
 *
 * ONE definition, imported by the page. It sits directly above a registration
 * form, so it is read closely and by people deciding whether to enter - the
 * same reason Collector's Choice is being centralised.
 *
 * The previous inline copy was wrong in two ways at once and both were live:
 * it overstated first place by $300, and it described all three awards as CASH
 * when every one of them is a gift certificate. Either alone would be a
 * material misstatement to someone deciding whether to take part.
 *
 * The amounts are gift certificate VALUES, not cash. Do not shorten to "$200"
 * on any surface - the wording is the substance of the prize here. That applies
 * to Market Roots exactly as it does to Skin Specialists.
 *
 * TWO prize sponsors as of 2026-08-31, both confirmed in writing by the
 * businesses themselves and relayed by Ryan:
 *
 *   Skin Specialists   $200 / $150 / $100, first through third
 *   Market Roots       $300, FIRST PLACE ONLY. Styling, Downtown Fayetteville.
 *
 * Market Roots is first place only - do not propagate it to the runner-up rows.
 * If a third sponsor is confirmed, add it here; this is the single source and a
 * new sponsor is a one-line change. Prize sponsors deliberately do NOT live in
 * presentation_credits: that table is not built, and it was designed for
 * presenting-sponsor credits on schedule items and panels, priced and invoiced,
 * which is a different thing. See docs/CUTOVER.md section E2.
 *
 * 'Convention Feature' is a photo shoot at the show, with the images used in
 * AATC promotional material. Confirmed by Ryan, 2026-08-28. It is carried as a
 * note on the placement rather than expanded inline, so the prize line stays
 * scannable and the definition still sits with the prize it belongs to.
 *
 * OPEN, and Ryan's call, not a code decision: that prize uses a contestant's
 * likeness in promotional material. If a consent checkbox is ever wanted it
 * belongs in this same entry form, next to age_confirmed - not bolted on
 * afterwards, by which point entries exist that never saw it. See
 * docs/HANDOFF.md.
 */
export const PINUP_PRIZE_SPONSOR = 'Skin Specialists'
export const PINUP_PRIZE_SPONSOR_2 = 'Market Roots'

/** Every business funding a pinup prize, for the credit block. Order as listed. */
export const PINUP_PRIZE_SPONSORS = [PINUP_PRIZE_SPONSOR, PINUP_PRIZE_SPONSOR_2]

export const PINUP_PRIZES: { place: string; prize: string; note?: string }[] = [
  {
    place: '1st - Miss AATC',
    prize:
      `Custom Crown, Sash, Trophy + $200 Gift Certificate to ${PINUP_PRIZE_SPONSOR}` +
      ` + $300 Gift Certificate to ${PINUP_PRIZE_SPONSOR_2} (styling, Downtown Fayetteville)` +
      ' + Convention Feature',
    note: 'Convention Feature - a photo shoot at the show, with images used in AATC promotional material.',
  },
  {
    place: '2nd - 1st Runner-Up',
    prize: `Trophy + $150 Gift Certificate to ${PINUP_PRIZE_SPONSOR}`,
  },
  {
    place: '3rd - 2nd Runner-Up',
    prize: `Trophy + $100 Gift Certificate to ${PINUP_PRIZE_SPONSOR}`,
  },
]

/**
 * Deliberately vague. No count and no hint at what the additional prizes might
 * be: naming either would be a commitment nobody has made, on the page where a
 * contestant decides to enter.
 */
export const PINUP_ADDITIONAL_PRIZES_NOTE =
  'Additional prizes will be announced as more sponsors are confirmed.'

/**
 * Collector's Choice prize. Revised by Ryan, 2026-08-28.
 *
 * ONE definition. There were FOUR copies of the old wording and they had
 * already drifted into three different claims - two perk lists said "FREE booth
 * for the winning artist next year", the /contests metadata said only "a free
 * booth" with no timeframe at all, and the CMS default said "a free booth for
 * next year". That is the same drift that produced Gold at $3,000 in one place
 * and $5,000 in another, caught in the same sweep.
 *
 * The $500 is gone deliberately. It also resolved an open ambiguity: the old
 * copy awarded it to the COLLECTOR while Ryan's description of the feature
 * awards it to the ARTIST. With no amount there is nobody to attribute it to,
 * so the question does not need answering before this can go live.
 *
 * NO SPONSOR IS NAMED. After Inked is likely but unconfirmed, and naming an
 * unconfirmed business is what put a real Fayetteville venue on the
 * after-parties page without an agreement. The name goes up when Ryan confirms.
 *
 * Booth wording checked before generalising: no surface specified a size or a
 * tier, so "a free booth at next year's convention" loses no precision. It adds
 * back the timeframe that the /contests metadata had dropped.
 */
export const COLLECTORS_CHOICE_PRIZE =
  "Prize package from our sponsor, plus a free booth at next year's convention."

/**
 * Tattoo contest entry fee. Confirmed by Ryan, 2026-08-28.
 *
 * $10 per category, every category, no exceptions - Tattoo of the Day and Best
 * in Show are paid the same as any other. A constant rather than inline copy
 * for the same reason as the prize amounts: it appears next to a decision
 * somebody makes with money.
 *
 * Entrants may enter as many categories as they like. The old rule limiting
 * entries was removed as false. Saturday alone has 20 categories, so the fee is
 * stated per entry and the arithmetic is left to the entrant - do NOT compute
 * or display a maximum. A "$200 to enter everything" figure would read as a
 * price for something nobody sells, and would be wrong the moment a category is
 * added or dropped.
 *
 * Not to be confused with the Miss AATC Pinup Contest, which is FREE to enter.
 * Different contest, different rule; leave that one alone.
 */
export const CONTEST_ENTRY_FEE = '$10'
export const CONTEST_ENTRY_FEE_NOTE =
  `Entry is ${'$10'} per category. You may enter as many categories as you like.`

/**
 * Physical mailing address for email footers.
 *
 * Confirmed by Ryan, 2026-08-28. This is the BUSINESS address, deliberately NOT
 * the Crown Complex address - that is the venue, not the business, and putting
 * it in a footer would tell recipients that mail sent there reaches AATC.
 *
 * Used in MARKETING footers only. The transactional confirmation does not carry
 * it, per the commercial/transactional split documented in the pinup route.
 *
 * CAN-SPAM requires a valid physical postal address on COMMERCIAL email. It
 * does not require one on transactional email, which is why the pinup
 * confirmation can ship before this is filled in. Nothing marketing may be sent
 * until it is.
 */
export const AATC_MAILING_ADDRESS: string | null = '5439 Yadkin Rd STE 112, Fayetteville, NC 28303'

/**
 * Presentation credit for the All American Tattoo Battle. Confirmed current by
 * Ryan, 2026-08-31.
 *
 * ONE definition, imported everywhere the Battle is named. This is the third
 * sponsor credit on the site and repeating it inline is the pattern that
 * produced four different wordings of the Collector's Choice prize.
 *
 * It ALREADY renders on /events/schedule, from
 * schedule_items.presented_by_fallback - data, not code, which is why a source
 * grep for the name found nothing and it looked undelivered. That row stays the
 * source for the schedule page; this constant covers the pages that name the
 * Battle in prose and had no credit at all.
 *
 * When presentation_credits is built (CUTOVER section E2), both this constant
 * and the fallback column should read from it instead.
 */
export const TATTOO_BATTLE_PRESENTER = 'Whole Life Aftercare'
export const TATTOO_BATTLE_PRESENTED_BY = `Presented by ${TATTOO_BATTLE_PRESENTER}`
