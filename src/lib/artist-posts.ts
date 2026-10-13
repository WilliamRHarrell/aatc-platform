/**
 * Artist top posts (spec docs/specs/aatc-artist-top-posts-spec.md, Section 4):
 * the rules shared by /admin/social/artist-posts and its routes. Data lives in
 * artist_social_posts / artist_scrape_runs / artist_repost_opt_outs (101);
 * n8n scrapes and sends, the app only reads and writes STATE columns
 * (status, admin_caption, postiz_post_id, sent_at, sent_by, last_error).
 */
import {
  EVENT_NAME, EVENT_YEAR, EVENT_DATES_LABEL, VENUE_NAME, VENUE_CITY, VENUE_STATE,
} from '@/lib/event-config'
import { PRODUCTION_HOST } from '@/lib/site'
import { AATC_POSTIZ_CHANNELS, type PostizChannel } from '@/lib/postiz-channels'

export const POSTS_BUCKET = 'artist-posts'

/** A row stuck in 'sending' this long is shown as failed-with-retry (102's updated_at). */
export const STUCK_SENDING_MS = 15 * 60 * 1000

export const POST_STATUSES = ['new', 'sending', 'sent', 'skipped', 'failed'] as const
export type PostStatus = (typeof POST_STATUSES)[number]

export interface MediaItem {
  path: string
  type: 'image' | 'video'
  width?: number
  height?: number
}

/** media jsonb -> typed items. Paths are bucket-relative (no 'artist-posts/' prefix). */
export function mediaItems(media: unknown): MediaItem[] {
  if (!Array.isArray(media)) return []
  return media.flatMap(m => {
    const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>
    const path = typeof o.path === 'string' ? o.path : ''
    if (!path) return []
    const type = o.type === 'video' ? 'video' : 'image'
    return [{
      path, type,
      ...(typeof o.width === 'number' ? { width: o.width } : {}),
      ...(typeof o.height === 'number' ? { height: o.height } : {}),
    } satisfies MediaItem]
  })
}

export function isStuckSending(status: string, updatedAt: string | null, now: number = Date.now()): boolean {
  if (status !== 'sending') return false
  const t = updatedAt ? Date.parse(updatedAt) : NaN
  if (Number.isNaN(t)) return true // no timestamp to clear it: show the retry
  return now - t > STUCK_SENDING_MS
}

/**
 * ` - find them at Booth 126` / `Booths 142-145` (consecutive numbers
 * collapse) / `Booths 126, 142`. Empty string with no booths. Non-numeric
 * booth numbers are listed as they are, after the numeric ones.
 */
export function boothText(boothNumbers: readonly string[]): string {
  const clean = [...new Set(boothNumbers.map(b => b.trim()).filter(Boolean))]
  if (clean.length === 0) return ''
  const numeric = clean.filter(b => /^\d+$/.test(b)).map(Number).sort((a, b) => a - b)
  const other = clean.filter(b => !/^\d+$/.test(b)).sort()
  const parts: string[] = []
  for (let i = 0; i < numeric.length; ) {
    let j = i
    while (j + 1 < numeric.length && numeric[j + 1] === numeric[j] + 1) j++
    parts.push(j > i ? `${numeric[i]}-${numeric[j]}` : String(numeric[i]))
    i = j + 1
  }
  parts.push(...other)
  const one = clean.length === 1
  return ` - find them at ${one ? 'Booth' : 'Booths'} ${parts.join(', ')}`
}

/** The bare domain for social copy (one home, lib/site.ts). */
export const TICKETS_DOMAIN = PRODUCTION_HOST

/**
 * The send modal's prefilled caption. Dates and venue come from
 * src/lib/event-config.ts; nothing here restates them.
 */
export function defaultCaption(handle: string, boothNumbers: readonly string[]): string {
  const city = `${VENUE_CITY}, ${VENUE_STATE}`
  const cityTag = `#${VENUE_CITY.replace(/\s+/g, '')}${VENUE_STATE}`
  return [
    `\u{1F525} Work by @${handle}${boothText(boothNumbers)}.`,
    `Catch them at the ${EVENT_NAME}, ${EVENT_DATES_LABEL} at the ${VENUE_NAME} in ${city}.`,
    `\u{1F39F} Tickets: ${TICKETS_DOMAIN}`,
    `#AATC${EVENT_YEAR} ${cityTag} #tattoo`,
  ].join('\n')
}

/**
 * America/New_York wall-clock ("YYYY-MM-DDTHH:mm", a datetime-local value)
 * -> UTC ISO. Two passes over Intl: guess the offset at the UTC reading of
 * the wall clock, then re-check at the corrected instant so a DST boundary
 * lands on the right side.
 */
export function easternToUtcIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  const offsetAt = (utcMs: number) => {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(utcMs))
    const get = (t: string) => Number(p.find(x => x.type === t)?.value)
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
    return asUtc - utcMs
  }
  let utc = wall - offsetAt(wall)
  utc = wall - offsetAt(utc)
  return new Date(utc).toISOString()
}

export const YOUTUBE_TITLE_MAX = 100

/** The editable YouTube title's default. EVENT_NAME is the one home for the show's name. */
export function defaultYoutubeTitle(handle: string): string {
  return `Tattoo by @${handle} | ${EVENT_NAME}`.slice(0, YOUTUBE_TITLE_MAX)
}

export interface SendInput {
  id: string
  caption: string
  channels: string[]
  mode: 'draft' | 'schedule'
  /** datetime-local in America/New_York when mode = 'schedule'. */
  scheduledLocal?: string
  collab: boolean
  /** Required (and forwarded as youtube_title) only when a YouTube channel is picked. */
  youtubeTitle?: string
}

export type SendValidation =
  | { ok: true; scheduledAtUtc: string | null; youtubeTitle: string | null }
  | { ok: false; error: string }

/**
 * The send route's gate: allow-listed channels, a caption, a future schedule,
 * and a title when YouTube is picked. `channels` is injectable so the dormant
 * YouTube rules stay tested while its entry is commented out.
 */
export function validateSend(
  input: SendInput,
  now: number = Date.now(),
  channelList: readonly PostizChannel[] = AATC_POSTIZ_CHANNELS,
): SendValidation {
  const byId = new Map(channelList.map(c => [c.id, c]))
  if (!input.caption.trim()) return { ok: false, error: 'The caption is empty.' }
  if (input.channels.length === 0) return { ok: false, error: 'Pick at least one channel.' }
  const stranger = input.channels.find(c => !byId.has(c))
  if (stranger) return { ok: false, error: `Unknown channel ${stranger}.` }

  let youtubeTitle: string | null = null
  if (input.channels.some(c => byId.get(c)?.platform === 'youtube')) {
    youtubeTitle = (input.youtubeTitle ?? '').trim().slice(0, YOUTUBE_TITLE_MAX)
    if (!youtubeTitle) return { ok: false, error: 'YouTube needs a title.' }
  }

  if (input.mode === 'draft') return { ok: true, scheduledAtUtc: null, youtubeTitle }
  const utc = input.scheduledLocal ? easternToUtcIso(input.scheduledLocal) : null
  if (!utc) return { ok: false, error: 'Pick a date and time to schedule.' }
  if (Date.parse(utc) <= now) return { ok: false, error: 'The scheduled time is in the past.' }
  return { ok: true, scheduledAtUtc: utc, youtubeTitle }
}
