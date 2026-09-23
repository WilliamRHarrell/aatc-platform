import { dayLabel, timeLabel } from './schedule-format'
import { BUCKET_COUNT, QR_BASE_URL } from './tattoo-battle-config'

export const MEDIA_BUCKET = 'tattoo-battle-media'

export interface MediaItem { type: 'image' | 'video'; path: string; poster_path?: string }

/** Strict: canonical decimal only. "07", " 7", "7abc" are not printed codes. */
export function parseBucket(seg: string): number | null {
  if (!/^[1-9]\d*$/.test(seg)) return null
  const n = Number(seg)
  return n >= 1 && n <= BUCKET_COUNT ? n : null
}

export function entryPath(n: number): string { return `/tattoo-battle/entry/${n}` }
export function entryUrl(n: number): string { return `${QR_BASE_URL}${entryPath(n)}` }

/** '2027-04-16T13:00:00-04:00' + 4h -> '2027-04-16T17:00:00-04:00'. Offset preserved. */
export function judgingIso(startIso: string, hours: number): string {
  const m = startIso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)$/)
  if (!m) throw new Error(`BATTLE_START is not an ISO string with offset: ${startIso}`)
  const [, date, hh, mm, ss, off] = m
  const total = Number(hh) + hours
  if (total >= 24) throw new Error('judgingIso does not cross midnight; the Battle does not either')
  return `${date}T${String(total).padStart(2, '0')}:${mm}:${ss}${off}`
}

export interface ScheduleRowLite { title: string; day_date: string; start_time: string }
export interface TimelineStep { key: string; when: string; text: string }

function find(rows: ScheduleRowLite[], needle: RegExp): ScheduleRowLite | undefined {
  return rows.find(r => needle.test(r.title))
}
function when(row: ScheduleRowLite): string { return `${dayLabel(row.day_date)} · ${timeLabel(row.start_time)}` }

/**
 * Six steps. Times come from the schedule rows; the judging step is derived
 * from start + duration and CHECKED against the "Voting Opens" row. If they
 * disagree the schedule wins (it is the programme) and `mismatch` says so.
 */
export function buildTimeline(
  rows: ScheduleRowLite[],
  opts: { startIso: string; durationHours: number },
): { steps: TimelineStep[]; mismatch: string | null } {
  const begins = find(rows, /battle begins/i)
  const voting = find(rows, /voting opens/i)
  const crowned = find(rows, /champion crowned/i)

  const derived = judgingIso(opts.startIso, opts.durationHours)
  const derivedRow: ScheduleRowLite = { title: 'derived', day_date: derived.slice(0, 10), start_time: derived.slice(11, 19) }
  let mismatch: string | null = null
  let judging = derivedRow
  if (!voting) {
    mismatch = `schedule row "Voting Opens" missing; showing derived ${derivedRow.start_time}`
  } else if (voting.day_date !== derivedRow.day_date || voting.start_time.slice(0, 5) !== derivedRow.start_time.slice(0, 5)) {
    mismatch = `derived judging ${derivedRow.day_date} ${derivedRow.start_time} disagrees with schedule row ${voting.day_date} ${voting.start_time}; showing the schedule`
    judging = voting
  } else {
    judging = voting
  }

  const startRow: ScheduleRowLite = begins ?? { title: 'config', day_date: opts.startIso.slice(0, 10), start_time: opts.startIso.slice(11, 19) }

  const steps: TimelineStep[] = [
    { key: 'setup', when: 'Before Friday opening', text: 'Booth set up, station inspected and approved.' },
    { key: 'signup', when: 'Check-in day, up to 1 PM Friday', text: 'Sign up at the stage.' },
    { key: 'start', when: when(startRow), text: 'Stencil revealed; the clock starts.' },
    { key: 'judging', when: when(judging), text: 'Clients to the stage for judging.' },
    { key: 'buckets', when: 'Friday afternoon through Sunday', text: 'Buckets out. Scan, look, and vote with your dollars.' },
    { key: 'crowned', when: crowned ? when(crowned) : 'Sunday', text: 'Buckets counted, scores combined, champion crowned.' },
  ]
  return { steps, mismatch }
}

/** Instagram handles: letters, digits, dot, underscore, max 30. Leading @ and stray path/query characters are dropped. */
export function normalizeInstagram(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30)
}

/** Only http(s) URLs are ever rendered into an href; anything else (javascript:, data:) becomes null. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  return /^https?:\/\//i.test(v) ? v : null
}

export function entryAlt(bucket: number, artist: string): string {
  return `Tattoo Battle entry, Bucket #${bucket}, by ${artist}`
}

export function mediaPublicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`
}

/** First IMAGE item's URL, else the fallback. A video path is never an OG image. */
export function ogImageFor(media: MediaItem[], fallback: string): string {
  const img = media.find(m => m.type === 'image')
  return img ? mediaPublicUrl(img.path) : fallback
}
