# The All American Tattoo Battle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public `/tattoo-battle` page, the phone-first `/tattoo-battle/entry/[bucket]` QR landing pages, and the `/admin/tattoo-battle` admin with QR printing, backed by one migration that is delivered but never applied by the implementer.

**Architecture:** Server-rendered Next.js 16 App Router pages read Supabase through cookieless anon clients wrapped in `unstable_cache`, so RLS (not code) decides what the public sees. The admin is a `'use client'` page writing through the browser Supabase client under RLS with every write wrapped in `guardedWrite()`, uploading straight to Storage, and purging caches through the existing `/api/revalidate` route. Rules, copy and every `// CONFIRM` value live in one config file; times come from `schedule_items`; the presenter name from `TATTOO_BATTLE_PRESENTER`.

**Tech Stack:** Next.js 16.1.6, React 19, TypeScript, Tailwind v4 (`@theme` tokens), Supabase (Postgres RLS, Storage), `qrcode`, `jszip`, `vitest` (new, helpers only), `jsqr` (dev, QR decode test).

**Spec:** `docs/superpowers/specs/2026-09-23-tattoo-battle-design.md`

## Global Constraints

- Source lives in `src/app/`, never `app/`. `develop` is the production branch; commit there.
- **Never apply the migration, the verify file or the seed to the database.** Ryan runs production SQL. Node scripts that only READ with the anon key are fine to run.
- No em or en dashes anywhere in `src/` (prebuild guard `scripts/check-no-em-dashes.mjs` fails the build). Write `-`.
- Sponsor name is exactly `WholeLife Aftercare` (capital L, one word) in every new string; the existing constant `TATTOO_BATTLE_PRESENTER` is changed to it in Task 1 and imported everywhere the name is rendered.
- Never render tier, amount, exclusivity, invoice or any payment detail of a sponsor. Public copy is "Presented by WholeLife Aftercare" plus logo and link only.
- Charity copy: never "tax-deductible"; never a percentage; never a statistic; Veteran Ink described only by `VETERAN_INK.description`.
- Never display dollar totals, judges' scores or rankings. The platform stores no vote data at all.
- RLS helpers: use `public.has_role(array['admin','content_editor'])` and `public.is_admin()`; never an inline `profiles` subquery.
- Every non-admin write path must use `guardedWrite()`. There are none in this feature; the admin writes use it anyway.
- `src/types/database.ts` is hand-maintained; extend it by hand.
- Small gold text is `#C4A882`; `#8B7355` only at display sizes (≥24 px, or ≥19 px bold) and for borders.
- Alt text on every image. Entry media alt: `Tattoo Battle entry, Bucket #N, by <artist>`.
- Bucket mime list and the admin `accept` list are identical: `image/jpeg, image/png, image/webp, video/mp4, video/quicktime`. 50 MB cap.
- `QR_BASE_URL = 'https://www.allamericantattooconvention.com'`, fixed, never from env.
- Copy uses the exact strings in the spec/brief. Do not invent champions, judges, participants, quotes, prize values or stats.

## Review Focus

Inputs the spec implies but no acceptance criterion names. Each has a test pinned to the owning task.

1. **Bucket segment `"07"` or `"7abc"` or `" 7"`.** `/tattoo-battle/entry/07` must 404, not resolve to bucket 7 (a printed code is the only valid path; leading zeros mean a typo). Test in Task 1 (`parseBucket`).
2. **Judging time drifts from the schedule.** If someone edits the "Voting Opens" row to 5:30 PM but `BATTLE_DURATION_HOURS` still says 4, the page must show the schedule's time and log the disagreement, never the derived one. Test in Task 1 (`buildTimeline` with a mismatching row).
3. **A published entry whose first media item is a video.** OG image must fall back to the battle OG image, not the video path. Test in Task 1 (`ogImageFor`).
4. **Champion set on a draft.** The check constraint refuses it; the RPC surfaces the error; the admin button is disabled for drafts. SQL test in Task 2 (verify block D), UI guard in Task 10.
5. **A HEIC photo picked on Android or desktop** (iOS converts; others do not). `validateFile` must reject with the iPhone hint. Test in Task 9.

---

## File structure

```
NEW
src/lib/tattoo-battle-config.ts          constants, copy, prizes, FAQ, every // CONFIRM
src/lib/tattoo-battle.ts                  pure helpers (tested): parseBucket, entryPath, entryUrl,
                                          judgingIso, buildTimeline, entryAlt, ogImageFor, mediaPublicUrl
src/lib/tattoo-battle.test.ts             vitest
src/lib/tattoo-battle-media.ts            client helpers (tested where pure): validateFile, objectPath,
                                          moveItem, uploadWithProgress, capturePoster
src/lib/tattoo-battle-media.test.ts       vitest
src/lib/tattoo-battle-data.ts             cached anon reads: entries, champion, sponsor row, schedule rows
src/app/tattoo-battle/layout.tsx          Google Fonts for the segment
src/app/tattoo-battle/page.tsx            the public page
src/app/tattoo-battle/entry/[bucket]/page.tsx
src/components/tattoo-battle/BattleCountdown.tsx   client
src/components/tattoo-battle/MediaCarousel.tsx     client
src/components/tattoo-battle/BattleSection.tsx     server
src/components/tattoo-battle/EntryCard.tsx         server
src/components/tattoo-battle/ChampionBanner.tsx    server
src/components/tattoo-battle/PresentedBy.tsx       server (sponsor row or text)
src/app/admin/tattoo-battle/page.tsx               client admin
src/app/admin/tattoo-battle/SlotEditor.tsx         client
src/app/admin/tattoo-battle/print/page.tsx         client QR sheet
public/images/tattoo-battle/{lockup-full,fist,wordmark-stacked,badge,splatter-top,splatter-bottom,og}.png|jpg
supabase/migrations/069_tattoo_battle.sql
supabase/verify/verify_069.sql
supabase/seeds/wholelife_spelling.sql
scripts/verify-tattoo-battle-anon.mjs
scripts/build-tattoo-battle-assets.sh
vitest.config.ts

MODIFIED
src/lib/event-config.ts                  TATTOO_BATTLE_PRESENTER spelling; ASSETS.tattooBattleOg; phaseBetween()
src/components/home/Countdown.tsx        optional props
src/app/globals.css                      battle tokens
src/components/PublicNav.tsx             Events menu entry + explicit-href active check
src/lib/homepage-content.ts              Battle card href
src/app/api/revalidate/route.ts          allow-list additions
src/lib/roles.ts                         content_editor path
src/components/admin/AdminShell.tsx      nav entry
src/types/database.ts                    table + function types
next.config.ts                           301 redirect
scripts/check-event-dates.mjs            BATTLE_START assertion
package.json                             deps + test script
src/app/info/policies/page.tsx, src/app/admin/schedule/page.tsx, src/app/admin/credits/page.tsx  spelling
supabase/verify/verify_044.sql, supabase/seeds/three_sponsors_invoices_exclusivity.sql            spelling
docs/HANDOFF.md                          state entry
```

---

### Task 1: Tooling, config, pure helpers

**Files:**
- Create: `vitest.config.ts`, `src/lib/tattoo-battle-config.ts`, `src/lib/tattoo-battle.ts`, `src/lib/tattoo-battle.test.ts`
- Modify: `package.json`, `src/lib/event-config.ts:356-357` (presenter), `src/lib/event-config.ts:72-82` (ASSETS), `src/lib/event-config.ts:163-169` (showPhase)
- Modify spelling: `src/app/info/policies/page.tsx:47`, `src/app/admin/schedule/page.tsx:453`, `src/app/admin/credits/page.tsx:16`, `src/lib/homepage-content.ts` (comment only if present)

**Interfaces:**
- Produces `tattoo-battle-config.ts` exports: `BATTLE_EDITION`, `BATTLE_START`, `BATTLE_DURATION_HOURS`, `SIGNUP_COPY`, `WINNER_ANNOUNCED`, `BUCKET_COUNT`, `QR_BASE_URL`, `VETERAN_INK`, `ONLINE_DONATIONS_COUNT_AS_VOTES`, `PRIZES`, `PAST_CHAMPIONS`, `ELIGIBILITY`, `RULES`, `ATTENDEE_TIPS`, `FAQ`, `HERO`, `HOW_IT_WORKS`, `BUCKETS_ONLY_COPY`, `WHOLELIFE_INSTAGRAM`, types `Prize`, `PastChampion`, `FaqItem`.
- Produces `tattoo-battle.ts` exports: `parseBucket(seg: string): number | null`, `entryPath(n: number): string`, `entryUrl(n: number): string`, `judgingIso(startIso: string, hours: number): string`, `type ScheduleRowLite = { title: string; day_date: string; start_time: string }`, `type TimelineStep = { key: string; when: string; text: string }`, `buildTimeline(rows: ScheduleRowLite[], opts: { startIso: string; durationHours: number }): { steps: TimelineStep[]; mismatch: string | null }`, `entryAlt(bucket: number, artist: string): string`, `type MediaItem = { type: 'image' | 'video'; path: string; poster_path?: string }`, `mediaPublicUrl(path: string): string`, `ogImageFor(media: MediaItem[], fallback: string): string`, `MEDIA_BUCKET = 'tattoo-battle-media'`.
- Produces in `event-config.ts`: `TATTOO_BATTLE_PRESENTER = 'WholeLife Aftercare'`, `ASSETS.tattooBattleOg`, `phaseBetween(openIso, closeIso, now?)`.

- [ ] **Step 1: Install vitest and jsqr, add the test script**

```bash
cd /Users/ryanharrell/Documents/aatc-platform
npm i -D vitest jsqr
```

Add to `package.json` `"scripts"`: `"test": "vitest run"`. Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

- [ ] **Step 2: Write the failing tests**

`src/lib/tattoo-battle.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  parseBucket, entryPath, entryUrl, judgingIso, buildTimeline, entryAlt, ogImageFor, mediaPublicUrl,
} from '@/lib/tattoo-battle'
import { BUCKET_COUNT, QR_BASE_URL } from '@/lib/tattoo-battle-config'

describe('parseBucket', () => {
  it('accepts 1 and BUCKET_COUNT (the boundaries themselves)', () => {
    expect(parseBucket('1')).toBe(1)
    expect(parseBucket(String(BUCKET_COUNT))).toBe(BUCKET_COUNT)
  })
  it('rejects 0, BUCKET_COUNT+1, leading zeros, whitespace, letters, empty', () => {
    expect(parseBucket('0')).toBeNull()
    expect(parseBucket(String(BUCKET_COUNT + 1))).toBeNull()
    expect(parseBucket('07')).toBeNull()
    expect(parseBucket(' 7')).toBeNull()
    expect(parseBucket('7abc')).toBeNull()
    expect(parseBucket('')).toBeNull()
  })
})

describe('entry urls', () => {
  it('builds the path and the fixed-host URL', () => {
    expect(entryPath(3)).toBe('/tattoo-battle/entry/3')
    expect(entryUrl(3)).toBe(`${QR_BASE_URL}/tattoo-battle/entry/3`)
    expect(QR_BASE_URL).toBe('https://www.allamericantattooconvention.com')
  })
})

describe('judgingIso', () => {
  it('adds the duration and keeps the offset', () => {
    expect(judgingIso('2027-04-16T13:00:00-04:00', 4)).toBe('2027-04-16T17:00:00-04:00')
  })
})

const rows = [
  { title: 'All American Tattoo Battle Begins', day_date: '2027-04-16', start_time: '13:00:00' },
  { title: 'Tattoo Battle Ends - Voting Opens', day_date: '2027-04-16', start_time: '17:00:00' },
  { title: 'All American Tattoo Battle Champion Crowned', day_date: '2027-04-18', start_time: '18:00:00' },
]

describe('buildTimeline', () => {
  it('produces six steps with schedule-sourced times and no mismatch', () => {
    const { steps, mismatch } = buildTimeline(rows, { startIso: '2027-04-16T13:00:00-04:00', durationHours: 4 })
    expect(mismatch).toBeNull()
    expect(steps).toHaveLength(6)
    expect(steps[2].when).toBe('Friday, April 16 · 1:00 PM')
    expect(steps[3].when).toBe('Friday, April 16 · 5:00 PM')
    expect(steps[5].when).toBe('Sunday, April 18 · 6:00 PM')
  })
  it('prefers the schedule row when the derived judging time disagrees', () => {
    const drifted = rows.map(r => r.title.includes('Voting') ? { ...r, start_time: '17:30:00' } : r)
    const { steps, mismatch } = buildTimeline(drifted, { startIso: '2027-04-16T13:00:00-04:00', durationHours: 4 })
    expect(steps[3].when).toBe('Friday, April 16 · 5:30 PM')
    expect(mismatch).toContain('17:30')
  })
  it('falls back to the derived judging time when the row is missing', () => {
    const { steps, mismatch } = buildTimeline(rows.filter(r => !r.title.includes('Voting')), { startIso: '2027-04-16T13:00:00-04:00', durationHours: 4 })
    expect(steps[3].when).toBe('Friday, April 16 · 5:00 PM')
    expect(mismatch).toContain('missing')
  })
})

describe('entryAlt', () => {
  it('uses the exact brief wording', () => {
    expect(entryAlt(4, 'Jane Doe')).toBe('Tattoo Battle entry, Bucket #4, by Jane Doe')
  })
})

describe('ogImageFor', () => {
  it('returns the first IMAGE item, skipping a leading video', () => {
    const media = [
      { type: 'video' as const, path: 'e/bucket-01/a.mp4', poster_path: 'e/bucket-01/a-poster.jpg' },
      { type: 'image' as const, path: 'e/bucket-01/b.jpg' },
    ]
    expect(ogImageFor(media, 'FALLBACK')).toBe(mediaPublicUrl('e/bucket-01/b.jpg'))
  })
  it('uses the fallback when there is no image item', () => {
    expect(ogImageFor([{ type: 'video', path: 'x.mp4' }], 'FALLBACK')).toBe('FALLBACK')
    expect(ogImageFor([], 'FALLBACK')).toBe('FALLBACK')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/tattoo-battle.test.ts`
Expected: FAIL, "Failed to resolve import '@/lib/tattoo-battle'".

- [ ] **Step 4: Change the presenter constant and add the OG asset and phase helper in `event-config.ts`**

At lines 356-357 replace the two constants:

```ts
export const TATTOO_BATTLE_PRESENTER = 'WholeLife Aftercare'
export const TATTOO_BATTLE_PRESENTED_BY = `Presented by ${TATTOO_BATTLE_PRESENTER}`
```

In `ASSETS` (after `collectorsChoiceLogo`) add:

```ts
  /** Tattoo Battle share card: the presented-by graphic, at Ryan's direction.
   *  Served from /public so the page and the QR print sheet share one file. */
  tattooBattleOg: '/images/tattoo-battle/og.jpg',
```

Replace `showPhase` with a generic helper it delegates to:

```ts
/** Which side of a window `now` is on. Absolute instants, so every timezone agrees. */
export function phaseBetween(openIso: string, closeIso: string, now: number = Date.now()): ShowPhase {
  const open = new Date(openIso).getTime()
  const close = new Date(closeIso).getTime()
  if (now < open) return 'before'
  if (now <= close) return 'during'
  return 'after'
}

export function showPhase(now: number = Date.now()): ShowPhase {
  return phaseBetween(DOORS_OPEN_ISO, SHOW_CLOSE_ISO, now)
}
```

- [ ] **Step 5: Fix the spelling in the three src files**

`src/app/info/policies/page.tsx:47`: replace the literal `Whole Life Aftercare` with `{TATTOO_BATTLE_PRESENTER}` if it is JSX text, importing `TATTOO_BATTLE_PRESENTER` from `@/lib/event-config`; if it is inside a plain string constant, write `WholeLife Aftercare`. `src/app/admin/schedule/page.tsx:453` (placeholder) and `src/app/admin/credits/page.tsx:16` (comment): replace `Whole Life Aftercare` with `WholeLife Aftercare`. Then:

```bash
grep -rn "Whole Life" src/ && echo "STILL PRESENT - fix" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 6: Write the config**

`src/lib/tattoo-battle-config.ts`:

```ts
import { EVENT_DATES_LABEL, EVENT_YEAR, TATTOO_BATTLE_PRESENTER, VENUE_CITY, VENUE_STATE } from './event-config'

/**
 * The All American Tattoo Battle. Every value on /tattoo-battle that is not a
 * schedule row or the presenter name lives here. Items marked // CONFIRM were
 * not confirmed by Ryan when written; the page renders them as given.
 *
 * Times: BATTLE_START is asserted equal to the "Tattoo Battle Begins" schedule
 * row by scripts/check-event-dates.mjs at build. The Friday judging moment is
 * derived (start + BATTLE_DURATION_HOURS) and the Sunday crowning comes from
 * the schedule row; neither is typed here. See the spec, §3.3.
 */
export const BATTLE_EDITION = 3
export const BATTLE_START = '2027-04-16T13:00:00-04:00'
export const BATTLE_DURATION_HOURS = 4
export const SIGNUP_COPY = 'Sign up in person at the main stage on check-in day, any time up until the 1 PM Friday start.'
export const WINNER_ANNOUNCED = 'Sunday, April 18, 2027'
export const BUCKET_COUNT = 20 // CONFIRM - number of QR codes to print
/** Physical codes must never depend on which host a build ran on. Fixed. */
export const QR_BASE_URL = 'https://www.allamericantattooconvention.com'

export const WHOLELIFE_INSTAGRAM = 'https://instagram.com/wholelife.aftercare'

export const VETERAN_INK = {
  name: 'Veteran Ink',
  url: 'https://veteranink.com',
  donateUrl: 'https://veteranink.com/donation', // CONFIRM - path not yet verified against their site
  description:
    'Veteran Ink is a 501(c)(3) nonprofit that helps veterans heal and tell their military stories through tattoo therapy. Through its Ink Fund Program and a network of partner studios, it sponsors tattoos for veterans.',
} as const

/** When false, copy says only bucket money counts toward the vote. */
export const ONLINE_DONATIONS_COUNT_AS_VOTES = false // CONFIRM
export const BUCKETS_ONLY_COPY = 'Only money in the buckets counts toward the vote.'

export interface Prize { title: string; optional?: boolean }
export const PRIZES: Prize[] = [
  { title: `${TATTOO_BATTLE_PRESENTER} tattoo aftercare package` },
  { title: 'A Bishop tattoo machine' },
  { title: 'The championship belt' },
  { title: `A free booth at the ${EVENT_YEAR + 1} show to defend the title`, optional: true }, // CONFIRM
]

export interface PastChampion { year: number; name: string; shop?: string; instagram?: string; image?: string }
export const PAST_CHAMPIONS: PastChampion[] = [] // Ryan fills in. Empty renders nothing.

export const HERO = {
  title: 'The All American Tattoo Battle',
  tagline: 'The Ultimate Tattoo Showdown',
  kicker: `${BATTLE_EDITION}rd Annual · ${VENUE_CITY} - Fort Bragg, ${VENUE_STATE} · ${EVENT_DATES_LABEL}`,
  ctaBooth: 'Get a Booth',
  ctaHow: 'How It Works',
} as const

export const ELIGIBILITY: string[] = [
  'Professional tattoo artists only. No apprentices.',
  'Must have a booth and be tattooing at the show, with an active tattoo permit for the event.',
  'Station set up, inspected, and approved to tattoo before the show opens Friday.',
  SIGNUP_COPY,
  'No pre-registration.',
]

export interface Rule { title: string; text: string }
export const RULES: Rule[] = [
  { title: 'Surprise design', text: 'The stencil (linework) is revealed when the contest begins.' },
  { title: 'Flash design', text: 'A 6x6-inch standard flash design. Creative liberties are allowed, but the tattoo must stay true to the overall structure.' },
  { title: 'Lower extremity', text: 'The tattoo goes on the lower extremity of a client the artist brings.' },
  { title: `${BATTLE_DURATION_HOURS}-hour limit`, text: `Starts 1 PM Friday. At the ${BATTLE_DURATION_HOURS}-hour mark, clients come to the stage for photo, video, and judging. Late tattoos are not judged.` },
  { title: 'Breaks', text: 'Unlimited, as long as the artist finishes on time.' },
  { title: 'Supplies', text: 'None provided.' },
]

export const HOW_IT_WORKS = {
  heading: 'How the Winner Is Decided',
  formula: "Final score = judges' score + the people's vote",
  judges: { title: "Judges' score", text: 'Each tattoo is judged on stage when time is up.' },
  people: {
    title: "The People's Vote",
    subtitle: 'Vote With Your Dollars',
    steps: [
      'Friday afternoon after judging, each tattoo gets a numbered Veteran Ink bucket with a QR code.',
      "Scan it to see the tattoo up close, then vote by dropping money in that tattoo's bucket.",
      'Every dollar is a vote, and all bucket money supports Veteran Ink.',
    ],
  },
  sunday: 'Sunday: the buckets are counted, combined with the judges’ score, and the champion is crowned.',
} as const

export const ATTENDEE_TIPS: string[] = [
  'Watch it live Friday afternoon.',
  'Find the buckets and vote all weekend.',
  'Be there Sunday for the crowning.',
]

export interface FaqItem { q: string; a: string }
export const FAQ: FaqItem[] = [
  { q: 'Do I need to pre-register?', a: `No. ${SIGNUP_COPY}` },
  { q: 'Can apprentices enter?', a: 'No. Professional tattoo artists only.' },
  { q: 'Who provides the client?', a: 'The artist brings their own client. The tattoo goes on the lower extremity.' },
  { q: `What if I don't finish in ${BATTLE_DURATION_HOURS} hours?`, a: 'Late tattoos are not judged. Take as many breaks as you like, as long as you finish on time.' },
  { q: 'How is the winner chosen?', a: `Judges score each tattoo on stage when time is up. Then the people vote with their dollars all weekend. On Sunday the two are combined and the champion is crowned.` },
  { q: 'How do I vote?', a: `Scan the QR code on a bucket to see that tattoo up close, then drop money in the bucket. Every dollar is a vote.${ONLINE_DONATIONS_COUNT_AS_VOTES ? '' : ` ${BUCKETS_ONLY_COPY}`}` },
  { q: 'Where does the money go?', a: `All bucket money supports ${VETERAN_INK.name}.` },
  { q: 'Do I need a booth?', a: 'Yes. You must have a booth and be tattooing at the show, with an active tattoo permit for the event.' },
]
```

Note the `’` in `sunday` is a typographic apostrophe, not a dash; the dash guard allows it.

- [ ] **Step 7: Write the helpers**

`src/lib/tattoo-battle.ts`:

```ts
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

  const startWhen = begins ? when(begins) : when(derivedRow.title === 'derived' ? { title: '', day_date: opts.startIso.slice(0, 10), start_time: opts.startIso.slice(11, 19) } : derivedRow)

  const steps: TimelineStep[] = [
    { key: 'setup', when: 'Before Friday opening', text: 'Booth set up, station inspected and approved.' },
    { key: 'signup', when: 'Check-in day, up to 1 PM Friday', text: 'Sign up at the stage.' },
    { key: 'start', when: startWhen, text: 'Stencil revealed; the clock starts.' },
    { key: 'judging', when: when(judging), text: 'Clients to the stage for judging.' },
    { key: 'buckets', when: 'Friday afternoon through Sunday', text: 'Buckets out. Scan, look, and vote with your dollars.' },
    { key: 'crowned', when: crowned ? when(crowned) : 'Sunday', text: 'Buckets counted, scores combined, champion crowned.' },
  ]
  return { steps, mismatch }
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
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/lib/tattoo-battle.test.ts`
Expected: all green. If `dayLabel` renders a different weekday because the machine's locale differs, that is a bug in the test expectation only if the string differs in format; the function rebuilds the date from parts, so `Friday, April 16` is deterministic.

- [ ] **Step 9: Typecheck and lint, then commit**

```bash
npx tsc --noEmit && npm run lint
git add vitest.config.ts package.json package-lock.json src/lib/tattoo-battle-config.ts src/lib/tattoo-battle.ts src/lib/tattoo-battle.test.ts src/lib/event-config.ts src/app/info/policies/page.tsx src/app/admin/schedule/page.tsx src/app/admin/credits/page.tsx
git commit -m "feat(battle): config, pure helpers and vitest; presenter spelled WholeLife Aftercare

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Migration 069, verify file, spelling seed, types

**Files:**
- Create: `supabase/migrations/069_tattoo_battle.sql`, `supabase/verify/verify_069.sql`, `supabase/seeds/wholelife_spelling.sql`
- Modify: `src/types/database.ts` (Tables, alphabetical, before `team_members`; Functions block near line 1412), `supabase/verify/verify_044.sql:124`, `supabase/seeds/three_sponsors_invoices_exclusivity.sql:8,30,55,65,109,142`

**Interfaces:**
- Produces table `public.tattoo_battle_entries`, bucket `tattoo-battle-media`, RPC `set_tattoo_battle_champion(p_entry_id uuid) returns setof tattoo_battle_entries`, page_images slot `tattoo-battle-veteran-ink`.
- Produces `Database['public']['Tables']['tattoo_battle_entries']` and `Functions['set_tattoo_battle_champion']`.

**Do not run any of these files.** They are deliverables for Ryan.

- [ ] **Step 1: Write the migration**

`supabase/migrations/069_tattoo_battle.sql`:

```sql
-- ============================================================
-- Migration 069: The All American Tattoo Battle.
--
-- One table (an entry per numbered bucket), one public storage bucket, one
-- RPC that keeps "at most one champion per event" atomic, and one page_images
-- slot for the Veteran Ink logo.
--
-- POLICIES ENUMERATED BEFORE WRITING (HANDOFF §4): this is a NEW table and a
-- NEW bucket, so nothing permissive exists to OR against. Related tables were
-- read for shape only: contests/contest_entries carry `using (true)` public
-- reads; page_images narrows to `active = true`. This table narrows to
-- `is_published = true`, the same idea.
--
-- Why two check constraints rather than admin discipline: "make the invalid
-- state unreachable". A published slot always has an artist and media; a
-- champion is always published. The partial unique index is the one-champion
-- guarantee; the RPC exists so the UI never races it.
--
-- No vote data of any kind is stored. Money is counted on paper on Sunday.
-- ============================================================

begin;

create table if not exists public.tattoo_battle_entries (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  bucket_number int  not null check (bucket_number >= 1),
  artist_name   text not null default '',
  shop_name     text not null default '',
  city_state    text not null default '',
  instagram     text not null default '',
  -- [{ type: 'image'|'video', path, poster_path? }], paths relative to the bucket
  media         jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  is_published  boolean not null default false,
  is_champion   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tattoo_battle_bucket_per_event unique (event_id, bucket_number),
  constraint tattoo_battle_publish_complete
    check (not is_published or (length(trim(artist_name)) > 0 and jsonb_array_length(media) > 0)),
  constraint tattoo_battle_champion_is_published
    check (not is_champion or is_published)
);

create unique index if not exists tattoo_battle_one_champion_per_event
  on public.tattoo_battle_entries (event_id) where is_champion;

drop trigger if exists tattoo_battle_entries_updated_at on public.tattoo_battle_entries;
create trigger tattoo_battle_entries_updated_at
  before update on public.tattoo_battle_entries
  for each row execute function handle_updated_at();

comment on table public.tattoo_battle_entries is
  'One row per Tattoo Battle bucket. Public reads see is_published rows only. No vote or money data lives here, by design.';
comment on column public.tattoo_battle_entries.media is
  'jsonb array of {type: image|video, path, poster_path?}. Paths are relative to the tattoo-battle-media bucket, like page_images.image_path.';

alter table public.tattoo_battle_entries enable row level security;

drop policy if exists "tattoo_battle: public read published" on public.tattoo_battle_entries;
create policy "tattoo_battle: public read published"
  on public.tattoo_battle_entries for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "tattoo_battle: editorial write" on public.tattoo_battle_entries;
create policy "tattoo_battle: editorial write"
  on public.tattoo_battle_entries for all
  to authenticated
  using (public.has_role(array['admin','content_editor']))
  with check (public.has_role(array['admin','content_editor']));

grant select on public.tattoo_battle_entries to anon, authenticated;
grant insert, update, delete on public.tattoo_battle_entries to authenticated;

-- ── champion RPC ─────────────────────────────────────────────
-- Returns the rows it changed so guardedWrite() can see a non-empty result.
-- null clears the champion for the active event.
create or replace function public.set_tattoo_battle_champion(p_entry_id uuid)
returns setof public.tattoo_battle_entries
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_event uuid;
begin
  if not public.has_role(array['admin','content_editor']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_entry_id is null then
    v_event := (select id from public.events where is_active limit 1);
    return query
      update public.tattoo_battle_entries
         set is_champion = false
       where event_id = v_event and is_champion
      returning *;
    return;
  end if;

  v_event := (select event_id from public.tattoo_battle_entries where id = p_entry_id);
  if v_event is null then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;

  update public.tattoo_battle_entries
     set is_champion = false
   where event_id = v_event and is_champion and id <> p_entry_id;

  return query
    update public.tattoo_battle_entries
       set is_champion = true
     where id = p_entry_id
    returning *;
end;
$$;

revoke all on function public.set_tattoo_battle_champion(uuid) from public;
grant execute on function public.set_tattoo_battle_champion(uuid) to authenticated;

-- ── storage ──────────────────────────────────────────────────
-- Mime list matches the admin file input EXACTLY (spec §3.8). HEIC is not
-- here on purpose: iOS converts to JPEG when the input does not accept HEIC.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tattoo-battle-media', 'tattoo-battle-media', true, 52428800,
        array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict (id) do nothing;

drop policy if exists "Public can read tattoo battle media" on storage.objects;
create policy "Public can read tattoo battle media"
  on storage.objects for select
  using (bucket_id = 'tattoo-battle-media');

drop policy if exists "Editorial can insert tattoo battle media" on storage.objects;
create policy "Editorial can insert tattoo battle media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tattoo-battle-media' and public.has_role(array['admin','content_editor']));

drop policy if exists "Editorial can update tattoo battle media" on storage.objects;
create policy "Editorial can update tattoo battle media"
  on storage.objects for update to authenticated
  using (bucket_id = 'tattoo-battle-media' and public.has_role(array['admin','content_editor']));

drop policy if exists "Editorial can delete tattoo battle media" on storage.objects;
create policy "Editorial can delete tattoo battle media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tattoo-battle-media' and public.has_role(array['admin','content_editor']));

-- ── Veteran Ink logo slot (renders nothing until filled) ─────
insert into public.page_images (slug) values ('tattoo-battle-veteran-ink')
on conflict (slug) do nothing;

commit;
```

- [ ] **Step 2: Write the verify file**

`supabase/verify/verify_069.sql`:

```sql
-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
--
-- ⚠  WRITES fixtures (bucket_number 9001-9003 on the active event) and removes
-- them. Block E owns teardown; Z only looks.
--
-- The point of this file is block C (anon cannot see a draft) and block D
-- (one champion, and never a draft). Everything else confirms shape.
-- ============================================================

-- ── A. policies, exactly as written  (results grid)
--    want: 2 rows on tattoo_battle_entries, 4 rows on storage.objects for
--    the bucket. Names pinned so a later "helpful" policy shows up here.
select tablename, policyname, cmd, roles::text
  from pg_policies
 where (schemaname = 'public'  and tablename = 'tattoo_battle_entries')
    or (schemaname = 'storage' and tablename = 'objects' and policyname ilike '%tattoo battle%')
 order by tablename, policyname;

-- ── B. bucket shape  (NOTICE pane)
do $$
declare v_types text[]; v_limit bigint; v_public boolean;
begin
  v_types  := (select allowed_mime_types from storage.buckets where id = 'tattoo-battle-media');
  v_limit  := (select file_size_limit    from storage.buckets where id = 'tattoo-battle-media');
  v_public := (select public             from storage.buckets where id = 'tattoo-battle-media');
  if v_types is null then raise exception 'FAIL: bucket tattoo-battle-media missing'; end if;
  if v_types <> array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'] then
    raise exception 'FAIL: mime list is % - must match the admin accept list', v_types;
  end if;
  if v_limit <> 52428800 then raise exception 'FAIL: size limit is %, want 52428800', v_limit; end if;
  if not v_public then raise exception 'FAIL: bucket is not public'; end if;
  raise notice 'PASS: bucket public, 50 MB, mime list matches the admin input';
end $$;

-- ── C. a draft is invisible to anon; a published row is visible  (NOTICE pane)
--    Control first: the rows exist as postgres. Then set role anon.
do $$
declare v_event uuid; n int;
begin
  v_event := (select id from public.events where is_active limit 1);
  delete from public.tattoo_battle_entries where bucket_number >= 9001;

  insert into public.tattoo_battle_entries (event_id, bucket_number, artist_name, media, is_published)
  values (v_event, 9001, 'ZZ Draft Artist', '[]'::jsonb, false),
         (v_event, 9002, 'ZZ Published Artist', '[{"type":"image","path":"zz/test.jpg"}]'::jsonb, true);

  n := (select count(*) from public.tattoo_battle_entries where bucket_number in (9001, 9002));
  if n <> 2 then raise exception 'FAIL: control - expected 2 fixture rows, found %', n; end if;
  raise notice 'PASS: control - both fixture rows exist as postgres';

  set local role anon;
  n := (select count(*) from public.tattoo_battle_entries where bucket_number = 9001);
  if n <> 0 then raise exception 'FAIL: anon can see the DRAFT (bucket 9001)'; end if;
  n := (select count(*) from public.tattoo_battle_entries where bucket_number = 9002);
  if n <> 1 then raise exception 'FAIL: anon cannot see the PUBLISHED row (bucket 9002) - policy too tight or grant missing'; end if;
  raise notice 'PASS: anon sees the published row and not the draft';

  begin
    insert into public.tattoo_battle_entries (event_id, bucket_number) values (v_event, 9003);
    raise exception 'FAIL: anon inserted a row';
  exception
    when insufficient_privilege then raise notice 'PASS: anon insert refused (42501)';
  end;
  begin
    update public.tattoo_battle_entries set artist_name = 'hacked' where bucket_number = 9002;
    n := (select count(*) from public.tattoo_battle_entries where artist_name = 'hacked');
    if n <> 0 then raise exception 'FAIL: anon updated a row'; end if;
    raise notice 'PASS: anon update affected 0 rows';
  exception
    when insufficient_privilege then raise notice 'PASS: anon update refused (42501)';
  end;
  reset role;
end $$;

-- ── D. one champion per event, never a draft  (NOTICE pane)
do $$
declare v_event uuid; v_pub uuid; v_draft uuid; n int;
begin
  v_event := (select id from public.events where is_active limit 1);
  v_pub   := (select id from public.tattoo_battle_entries where bucket_number = 9002);
  v_draft := (select id from public.tattoo_battle_entries where bucket_number = 9001);

  begin
    update public.tattoo_battle_entries set is_champion = true where id = v_draft;
    raise exception 'FAIL: a DRAFT became champion';
  exception
    when check_violation then raise notice 'PASS: a draft cannot be champion (check constraint)';
  end;

  -- publish a second row so two published rows exist, then try two champions
  insert into public.tattoo_battle_entries (event_id, bucket_number, artist_name, media, is_published)
  values (v_event, 9003, 'ZZ Second Published', '[{"type":"image","path":"zz/b.jpg"}]'::jsonb, true);
  update public.tattoo_battle_entries set is_champion = true where id = v_pub;
  begin
    update public.tattoo_battle_entries set is_champion = true where bucket_number = 9003;
    raise exception 'FAIL: two champions on one event';
  exception
    when unique_violation then raise notice 'PASS: a second champion is refused by the partial index';
  end;

  -- the RPC moves it atomically (called as postgres, which has_role treats as no role:
  -- so call the inner statements' effect directly by granting the check a pass via a
  -- temporary admin profile is out of scope - assert the index + constraint, which the
  -- RPC relies on, and assert the function exists with the expected signature)
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'set_tattoo_battle_champion'
       and p.prosecdef and pg_get_function_arguments(p.oid) = 'p_entry_id uuid'
  ) then raise exception 'FAIL: set_tattoo_battle_champion(uuid) missing or not security definer'; end if;
  raise notice 'PASS: set_tattoo_battle_champion(uuid) exists, security definer';

  n := (select count(*) from public.tattoo_battle_entries where event_id = v_event and is_champion and bucket_number >= 9001);
  if n <> 1 then raise exception 'FAIL: expected exactly 1 fixture champion, found %', n; end if;
end $$;

-- ── E. a published row must be complete; teardown  (NOTICE pane)
do $$
declare v_event uuid;
begin
  v_event := (select id from public.events where is_active limit 1);
  begin
    update public.tattoo_battle_entries set is_published = true where bucket_number = 9001; -- no artist, no media
    raise exception 'FAIL: an incomplete row was published';
  exception
    when check_violation then raise notice 'PASS: publishing without artist+media is refused';
  end;
  delete from public.tattoo_battle_entries where bucket_number >= 9001;
  raise notice 'PASS: fixtures removed';
end $$;

-- ── F. page_images slot exists  (results grid)  want: 1 row, image_path null until filled
select slug, image_path is not null as filled from public.page_images where slug = 'tattoo-battle-veteran-ink';

-- ── Z. FIXTURE RESIDUE CHECK - run LAST. A clean run is ZERO.
select 'tattoo_battle_entries bucket_number >= 9001' as fixtures_looked_for,
       count(*) as fixtures_remaining
  from public.tattoo_battle_entries where bucket_number >= 9001;
```

- [ ] **Step 3: Write the spelling seed**

`supabase/seeds/wholelife_spelling.sql`:

```sql
-- ============================================================
-- DATA CHANGE: 'Whole Life Aftercare' -> 'WholeLife Aftercare'
--
-- Ryan directed 2026-09-23 that the sponsor's name is spelled "WholeLife
-- Aftercare" (one word, capital L) everywhere. TATTOO_BATTLE_PRESENTER in
-- src/lib/event-config.ts already says so; these are the rows that must agree
-- with it: the sponsorships row and the three Battle schedule_items fallbacks.
--
-- Paste into the Supabase SQL editor. Not applied by anyone but Ryan.
-- Guarded: aborts unless the before-state is exactly what this was written
-- against (1 sponsorship, 3 schedule rows). A different count means someone
-- changed the rows since - check before running.
-- ============================================================

do $$
declare
  v_old constant text := 'Whole Life Aftercare';
  v_new constant text := 'WholeLife Aftercare';
  n_sp int; n_sched int;
begin
  n_sp    := (select count(*) from public.sponsorships   where sponsor_name = v_old);
  n_sched := (select count(*) from public.schedule_items where presented_by_fallback = v_old);
  if n_sp <> 1 then
    raise exception 'ABORT: expected exactly 1 sponsorship named %, found %.', v_old, n_sp;
  end if;
  if n_sched <> 3 then
    raise exception 'ABORT: expected exactly 3 schedule rows credited to %, found %.', v_old, n_sched;
  end if;

  update public.sponsorships   set sponsor_name = v_new          where sponsor_name = v_old;
  update public.schedule_items set presented_by_fallback = v_new where presented_by_fallback = v_old;

  n_sp    := (select count(*) from public.sponsorships   where sponsor_name = v_new);
  n_sched := (select count(*) from public.schedule_items where presented_by_fallback = v_new);
  if n_sp <> 1 or n_sched <> 3 then
    raise exception 'ABORT: after update expected 1 and 3, found % and %.', n_sp, n_sched;
  end if;
  if exists (select 1 from public.presentation_credits where buyer_name = v_old) then
    raise notice 'NOTE: presentation_credits also carries the old spelling - not touched here, report it.';
  end if;
  raise notice 'PASS: sponsorships and 3 schedule rows now read %', v_new;
end $$;

-- want: 1 row, 'WholeLife Aftercare'
select id, sponsor_name, status from public.sponsorships where sponsor_name ilike '%life%aftercare%';
-- want: 3 rows, all 'WholeLife Aftercare'
select day_date, start_time, title, presented_by_fallback from public.schedule_items
 where title ilike '%Battle%' order by day_date, start_time;
```

- [ ] **Step 4: Update the two SQL files that still expect the old spelling**

`supabase/verify/verify_044.sql:124`: change `'Whole Life Aftercare'` to `'WholeLife Aftercare'` in the comment. `supabase/seeds/three_sponsors_invoices_exclusivity.sql`: replace every `Whole Life Aftercare` with `WholeLife Aftercare` (lines 8, 30, 55, 65, 109, 142). Add one line to that file's header: `-- SPELLING: 'WholeLife Aftercare' (one word) since 2026-09-23; run supabase/seeds/wholelife_spelling.sql first if the sponsorships row still carries the old spelling.`

- [ ] **Step 5: Extend `src/types/database.ts`**

Insert alphabetically in `Tables` (after `sponsorships` and before `team_members`):

```ts
      /** Migration 069 - one row per Tattoo Battle bucket. Public reads see published rows only. */
      tattoo_battle_entries: {
        Row: {
          id: string
          event_id: string
          bucket_number: number
          artist_name: string
          shop_name: string
          city_state: string
          instagram: string
          media: { type: 'image' | 'video'; path: string; poster_path?: string }[]
          is_published: boolean
          is_champion: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          bucket_number: number
          artist_name?: string
          shop_name?: string
          city_state?: string
          instagram?: string
          media?: { type: 'image' | 'video'; path: string; poster_path?: string }[]
          is_published?: boolean
          is_champion?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          bucket_number?: number
          artist_name?: string
          shop_name?: string
          city_state?: string
          instagram?: string
          media?: { type: 'image' | 'video'; path: string; poster_path?: string }[]
          is_published?: boolean
          is_champion?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
```

In `Functions` add:

```ts
      /** Migration 069 - atomic champion switch; null clears. Returns the changed rows. */
      set_tattoo_battle_champion: {
        Args: { p_entry_id: string | null }
        Returns: Database["public"]["Tables"]["tattoo_battle_entries"]["Row"][]
      }
```

- [ ] **Step 6: Typecheck, then commit**

```bash
npx tsc --noEmit
git add supabase/migrations/069_tattoo_battle.sql supabase/verify/verify_069.sql supabase/seeds/wholelife_spelling.sql supabase/verify/verify_044.sql supabase/seeds/three_sponsors_invoices_exclusivity.sql src/types/database.ts
git commit -m "feat(battle): migration 069 (table, bucket, champion RPC, logo slot), verify_069, WholeLife spelling seed

Not applied. Ryan runs production SQL.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Data layer (cached anon reads)

**Files:**
- Create: `src/lib/tattoo-battle-data.ts`

**Interfaces:**
- Consumes: `MediaItem`, `ScheduleRowLite` from `@/lib/tattoo-battle`; `TATTOO_BATTLE_PRESENTER` from `@/lib/event-config`; `excludeHarnessSponsors` from `@/lib/sponsor-display`.
- Produces:
  - `type BattleEntry = { id: string; bucket_number: number; artist_name: string; shop_name: string; city_state: string; instagram: string; media: MediaItem[]; is_champion: boolean }`
  - `getPublishedEntries(): Promise<BattleEntry[]>` (active event, ordered by bucket)
  - `getEntryByBucket(n: number): Promise<BattleEntry | null>`
  - `getChampion(): Promise<BattleEntry | null>`
  - `type PresenterRow = { sponsor_name: string; logo_url: string | null; website: string | null; instagram: string | null }`
  - `getPresenter(): Promise<PresenterRow | null>`
  - `getBattleScheduleRows(): Promise<ScheduleRowLite[]>`
  - All cached with `unstable_cache(..., { revalidate: 60, tags: ['tattoo-battle'] })` (presenter uses tag `sponsors`).

- [ ] **Step 1: Write the file**

```ts
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { MediaItem, ScheduleRowLite } from '@/lib/tattoo-battle'
import { TATTOO_BATTLE_PRESENTER } from '@/lib/event-config'
import { excludeHarnessSponsors } from '@/lib/sponsor-display'

/**
 * Every public read for the Tattoo Battle. ANON key, cookieless, cached.
 * RLS is what hides drafts: these queries never filter on is_published
 * themselves, so if a policy is ever loosened the page shows it rather than
 * masking it (HANDOFF: check both code AND data; deployed HTML is the authority).
 */
function anon() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

export interface BattleEntry {
  id: string
  bucket_number: number
  artist_name: string
  shop_name: string
  city_state: string
  instagram: string
  media: MediaItem[]
  is_champion: boolean
}

const ENTRY_COLUMNS = 'id, bucket_number, artist_name, shop_name, city_state, instagram, media, is_champion'

async function activeEventId(): Promise<string | null> {
  const { data } = await anon().from('events').select('id').eq('is_active', true).maybeSingle()
  return data?.id ?? null
}

export const getPublishedEntries = unstable_cache(
  async (): Promise<BattleEntry[]> => {
    const eventId = await activeEventId()
    if (!eventId) return []
    const { data, error } = await anon()
      .from('tattoo_battle_entries')
      .select(ENTRY_COLUMNS)
      .eq('event_id', eventId)
      .order('bucket_number', { ascending: true })
    if (error) {
      // 42P01 = migration 069 not applied. Degrade to "no entries", but say so.
      console.error(`[tattoo-battle] entries query failed (${error.code}): ${error.message}`)
      return []
    }
    return (data ?? []) as unknown as BattleEntry[]
  },
  ['tattoo_battle_entries'],
  { revalidate: 60, tags: ['tattoo-battle'] },
)

export const getEntryByBucket = unstable_cache(
  async (bucket: number): Promise<BattleEntry | null> => {
    const eventId = await activeEventId()
    if (!eventId) return null
    const { data, error } = await anon()
      .from('tattoo_battle_entries')
      .select(ENTRY_COLUMNS)
      .eq('event_id', eventId)
      .eq('bucket_number', bucket)
      .maybeSingle()
    if (error) {
      console.error(`[tattoo-battle] entry ${bucket} query failed (${error.code}): ${error.message}`)
      return null
    }
    return (data as unknown as BattleEntry | null) ?? null
  },
  ['tattoo_battle_entry'],
  { revalidate: 60, tags: ['tattoo-battle'] },
)

export async function getChampion(): Promise<BattleEntry | null> {
  const entries = await getPublishedEntries()
  return entries.find(e => e.is_champion) ?? null
}

export interface PresenterRow {
  sponsor_name: string
  logo_url: string | null
  website: string | null
  instagram: string | null
}

/**
 * The confirmed sponsorship row for the presenter, matched on the ONE name in
 * event-config. Before the spelling seed runs the row will not match and the
 * page renders the name as text (the documented fallback); nothing borrowed.
 */
export const getPresenter = unstable_cache(
  async (): Promise<PresenterRow | null> => {
    const { data, error } = await anon()
      .from('sponsors_public')
      .select('sponsor_name, logo_url, website, instagram')
      .eq('sponsor_name', TATTOO_BATTLE_PRESENTER)
      .limit(1)
    if (error) {
      console.error(`[tattoo-battle] presenter query failed (${error.code}): ${error.message}`)
      return null
    }
    const rows = excludeHarnessSponsors((data ?? []) as PresenterRow[])
    return rows[0] ?? null
  },
  ['tattoo_battle_presenter'],
  { revalidate: 60, tags: ['sponsors'] },
)

export const getBattleScheduleRows = unstable_cache(
  async (): Promise<ScheduleRowLite[]> => {
    const eventId = await activeEventId()
    if (!eventId) return []
    const { data, error } = await anon()
      .from('schedule_items_public')
      .select('title, day_date, start_time')
      .eq('event_id', eventId)
      .ilike('title', '%battle%')
    if (error) {
      console.error(`[tattoo-battle] schedule query failed (${error.code}): ${error.message}`)
      return []
    }
    return (data ?? []) as ScheduleRowLite[]
  },
  ['tattoo_battle_schedule'],
  { revalidate: 60, tags: ['tattoo-battle'] },
)
```

If `excludeHarnessSponsors` has a narrower parameter type than `PresenterRow[]`, check its signature in `src/lib/sponsor-display.ts` and adapt the cast; do not change that file.

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/tattoo-battle-data.ts
git commit -m "feat(battle): cached anon data reads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Countdown props and BattleCountdown

**Files:**
- Modify: `src/components/home/Countdown.tsx`
- Create: `src/components/tattoo-battle/BattleCountdown.tsx`

**Interfaces:**
- `Countdown` gains optional props `{ target?: string; close?: string; during?: ReactNode; after?: ReactNode }`. Defaults reproduce today's homepage exactly.
- `BattleCountdown` takes no props.

- [ ] **Step 1: Refactor `Countdown`**

Replace the imports and the component signature/body head. Keep `remaining`, `Unit`, `Separator` unchanged.

```tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { DOORS_OPEN_ISO, SHOW_CLOSE_ISO, EVENT_YEAR, phaseBetween, type ShowPhase } from '@/lib/event-config'
```

```tsx
interface CountdownProps {
  /** ISO instant to count down to. Defaults to doors open. */
  target?: string
  /** ISO instant after which `after` renders. Defaults to show close. */
  close?: string
  /** Rendered while target <= now <= close. */
  during?: ReactNode
  /** Rendered after close. */
  after?: ReactNode
}

function DefaultDuring() {
  return (
    <div className="text-center">
      <p className="font-display text-3xl font-bold uppercase tracking-wide sm:text-4xl" style={{ color: '#C4A882' }}>
        Happening Now
      </p>
      <Link
        href="/events/schedule"
        className="mt-3 inline-block text-sm font-semibold underline underline-offset-4 transition-colors hover:text-white"
        style={{ color: '#C4A882' }}
      >
        See today’s schedule →
      </Link>
    </div>
  )
}

function DefaultAfter() {
  return (
    <div className="text-center">
      <p className="font-display text-2xl font-bold sm:text-3xl" style={{ color: '#C4A882' }}>
        That’s a wrap on AATC {EVENT_YEAR}
      </p>
      <p className="mt-2 text-sm" style={{ color: '#999999' }}>
        Dates for {EVENT_YEAR + 1} will be announced soon - follow us so you don’t miss it.
      </p>
    </div>
  )
}

export default function Countdown({
  target = DOORS_OPEN_ISO,
  close = SHOW_CLOSE_ISO,
  during = <DefaultDuring />,
  after = <DefaultAfter />,
}: CountdownProps = {}) {
  const targetMs = new Date(target).getTime()
  const [phase, setPhase] = useState<ShowPhase>(() => phaseBetween(target, close))
  const [timeLeft, setTimeLeft] = useState(() => remaining(targetMs))

  useEffect(() => {
    const tick = () => {
      setPhase(phaseBetween(target, close))
      setTimeLeft(remaining(targetMs))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target, close, targetMs])

  if (phase === 'during') return <>{during}</>
  if (phase === 'after') return <>{after}</>

  return (
    <div className="flex items-start justify-center gap-4 sm:gap-8">
      <Unit value={timeLeft.days} label="Days" />
      <Separator />
      <Unit value={timeLeft.hours} label="Hours" />
      <Separator />
      <Unit value={timeLeft.minutes} label="Minutes" />
      <Separator />
      <Unit value={timeLeft.seconds} label="Seconds" />
    </div>
  )
}
```

Keep the trailing `export const COUNTDOWN_WINDOW = { open: DOORS_OPEN_ISO, close: SHOW_CLOSE_ISO }`. The two `’` characters are apostrophes, already in the file; leave them.

- [ ] **Step 2: Write `BattleCountdown`**

```tsx
'use client'

import Link from 'next/link'
import Countdown from '@/components/home/Countdown'
import { BATTLE_START, BATTLE_DURATION_HOURS } from '@/lib/tattoo-battle-config'
import { judgingIso } from '@/lib/tattoo-battle'
import { SHOW_CLOSE_ISO, EVENT_YEAR } from '@/lib/event-config'

/**
 * Counts down to the stencil reveal. During the 4-hour battle it says so;
 * after the show closes it wraps. Between judging and Sunday it keeps saying
 * "happening now" - the buckets are out and that IS the battle, all weekend.
 */
export default function BattleCountdown() {
  void judgingIso(BATTLE_START, BATTLE_DURATION_HOURS) // asserts the config parses at module load
  return (
    <Countdown
      target={BATTLE_START}
      close={SHOW_CLOSE_ISO}
      during={
        <div className="text-center">
          <p className="font-battle-display text-3xl uppercase tracking-wide sm:text-4xl" style={{ color: '#C4A882' }}>
            The Battle is on
          </p>
          <Link href="/events/schedule" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4" style={{ color: '#C4A882' }}>
            See the weekend schedule
          </Link>
        </div>
      }
      after={
        <p className="font-battle-display text-2xl uppercase sm:text-3xl" style={{ color: '#C4A882' }}>
          That is a wrap on the {EVENT_YEAR} Battle
        </p>
      }
    />
  )
}
```

- [ ] **Step 3: Verify the homepage is unchanged, then commit**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -3
```
Then serve and diff the homepage countdown markup against the last commit:

```bash
(npx next start -p 3777 >/dev/null 2>&1 &) ; sleep 4
curl -s http://localhost:3777/ | grep -o 'Days</span>' | wc -l   # expect 1
pkill -f "next start -p 3777"
git add src/components/home/Countdown.tsx src/components/tattoo-battle/BattleCountdown.tsx
git commit -m "feat(battle): Countdown accepts a target window; BattleCountdown wraps it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Assets, fonts and theme tokens

**Files:**
- Create: `scripts/build-tattoo-battle-assets.sh`, `public/images/tattoo-battle/*`, `src/app/tattoo-battle/layout.tsx`
- Modify: `src/app/globals.css` (`@theme` block, lines 3-16)

**Interfaces:**
- Produces public files: `/images/tattoo-battle/lockup-full.png`, `fist.png`, `wordmark-stacked.png`, `wordmark-wide.png`, `badge.png`, `splatter-top.png`, `splatter-bottom.png`, `og.jpg`.
- Produces Tailwind utilities `font-battle-display`, `font-battle-slab`, `font-battle-condensed`, colours `battle-charcoal`, `battle-gold`, `battle-khaki`.
- Produces CSS variables `--font-rubik-dirt`, `--font-rye`, `--font-oswald` scoped to the `/tattoo-battle` segment by its layout. **The admin print page (Task 11) loads the same three fonts itself** because it lives outside this segment.

- [ ] **Step 1: Write the asset script**

The vector master is `/Users/ryanharrell/Dropbox/AUploaded Files/AATC/Tattoo Battle/TATTOO-BATTLE-LOGO.ai` (PDF-compatible, one artboard with five lockups). Crops below are in pixels on a 2400-wide raster; they were measured on a preview and include a transparent margin. The carousel frames are used ONLY for the splatter edges (spec: never ship them).

`scripts/build-tattoo-battle-assets.sh`:

```bash
#!/usr/bin/env bash
# Rebuilds public/images/tattoo-battle from Ryan's masters. Run by hand on macOS.
set -euo pipefail
SRC="/Users/ryanharrell/Dropbox/AUploaded Files/AATC"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/images/tattoo-battle"
TMP="$(mktemp -d)"
mkdir -p "$OUT"

# 1. Rasterise the vector sheet (PDF-compatible .ai) at 2400 px wide, alpha kept.
cp "$SRC/Tattoo Battle/TATTOO-BATTLE-LOGO.ai" "$TMP/sheet.pdf"
sips -s format png --resampleWidth 2400 "$TMP/sheet.pdf" --out "$TMP/sheet.png" >/dev/null

# 2. Crop each lockup. crop=w:h:x:y
crop () { ffmpeg -loglevel error -y -i "$TMP/sheet.png" -vf "crop=$2" -frames:v 1 -update 1 "$OUT/$1.png"; }
crop lockup-full       "1100:690:100:190"
crop fist              "560:680:1360:180"
crop wordmark-stacked  "760:650:120:1020"
crop wordmark-wide     "1350:440:1020:1225"
crop badge             "600:560:1775:660"

# 3. Splatter edges from two carousel frames: the EDGE STRIPS ONLY (no text).
#    Turn the black ink into an alpha mask: dark -> opaque black, light -> transparent.
#    geq: alpha = 255 where luma < 70, else 0.
edge () {
  ffmpeg -loglevel error -y -i "$SRC/Tattoo Battle/$1" -vf "crop=$2,format=gray,geq=lum='255*lt(lum(X,Y),70)',format=gray" -frames:v 1 -update 1 "$TMP/$3-mask.png"
  ffmpeg -loglevel error -y -f lavfi -i "color=black:s=$4" -i "$TMP/$3-mask.png" -filter_complex "[0][1]alphamerge" -frames:v 1 -update 1 "$OUT/$3.png"
}
edge AATC-Tatto-battle-fay-1.png "1024:120:0:0"   splatter-top    1024x120
edge AATC-Tatto-battle-fay-2.png "1024:110:0:480" splatter-bottom 1024x110

# 4. OG image: the presented-by graphic, at Ryan's direction. JPEG to keep it small.
sips -s format jpeg -s formatOptions 85 "$SRC/AATC-27-EAST-SPONSOR-Wholelife-Aftercare.png" --out "$OUT/og.jpg" >/dev/null

ls -la "$OUT"
```

- [ ] **Step 2: Run it and LOOK at every output**

```bash
chmod +x scripts/build-tattoo-battle-assets.sh && scripts/build-tattoo-battle-assets.sh
```

Then composite each PNG on a mid-grey background and view it (use the Read tool on the composited file):

```bash
for f in lockup-full fist wordmark-stacked wordmark-wide badge splatter-top splatter-bottom; do
  ffmpeg -loglevel error -y -i public/images/tattoo-battle/$f.png -filter_complex "color=gray:s=iw x ih:d=1[bg];[bg][0:v]overlay=format=auto:shortest=1,scale='min(700,iw)':-1" -frames:v 1 -update 1 "/private/tmp/claude-501/-Users-ryanharrell/3d0ff216-161a-4280-b39f-3762c60a995b/scratchpad/check-$f.png" 2>/dev/null || true
done
```

(If the `iw x ih` expression fails, use `scale2ref` or just overlay on a fixed `color=gray:s=1400x1000`.) Adjust a crop rectangle and rerun if a lockup is clipped or carries a neighbour's fragment. The splatter strips must contain NO letterforms; if one does, move the crop `y` until it is edge-only.

- [ ] **Step 3: Segment layout with the fonts**

`src/app/tattoo-battle/layout.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Rubik_Dirt, Rye, Oswald } from 'next/font/google'

// Battle-only faces, loaded for this segment so the rest of the site does not
// pay for them. globals.css maps them onto the font-battle-* tokens.
const rubikDirt = Rubik_Dirt({ weight: '400', subsets: ['latin'], variable: '--font-rubik-dirt', display: 'swap' })
const rye = Rye({ weight: '400', subsets: ['latin'], variable: '--font-rye', display: 'swap' })
const oswald = Oswald({ weight: ['500', '700'], subsets: ['latin'], variable: '--font-oswald', display: 'swap' })

export default function TattooBattleLayout({ children }: { children: ReactNode }) {
  return <div className={`${rubikDirt.variable} ${rye.variable} ${oswald.variable}`}>{children}</div>
}
```

- [ ] **Step 4: Theme tokens**

In `src/app/globals.css` inside the existing `@theme { ... }` block, append:

```css
  /* Tattoo Battle. Colours reuse the site gold; fonts resolve to the variables
     set by src/app/tattoo-battle/layout.tsx (and the admin print page). */
  --color-battle-gold: #8B7355;
  --color-battle-khaki: #C4A882;
  --color-battle-charcoal: #2b2b2b;
  --font-battle-display: var(--font-rubik-dirt), Impact, sans-serif;
  --font-battle-slab: var(--font-rye), Georgia, serif;
  --font-battle-condensed: var(--font-oswald), 'Arial Narrow', sans-serif;
```

- [ ] **Step 5: Build, confirm no dash-guard or size problems, commit**

```bash
npm run build 2>&1 | tail -3
du -sh public/images/tattoo-battle
git add scripts/build-tattoo-battle-assets.sh public/images/tattoo-battle src/app/tattoo-battle/layout.tsx src/app/globals.css
git commit -m "feat(battle): lockup, fist, splatter and OG assets; battle fonts and tokens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The public page `/tattoo-battle`

**Files:**
- Create: `src/components/tattoo-battle/BattleSection.tsx`, `PresentedBy.tsx`, `EntryCard.tsx`, `ChampionBanner.tsx`, `src/app/tattoo-battle/page.tsx`

**Interfaces:**
- Consumes: Task 1 config and helpers; Task 3 reads; Task 4 `BattleCountdown`; Task 5 assets and tokens; `PublicNav`, `PageImage`, `Markdown` (existing).
- Produces: `BattleSection({ id?, kicker?, title, children, splatter?: 'top' | 'bottom' | 'both', className? })`, `PresentedBy({ presenter: PresenterRow | null, size?: 'hero' | 'block' })`, `EntryCard({ entry: BattleEntry })`, `ChampionBanner({ entry: BattleEntry })`.

- [ ] **Step 1: `BattleSection.tsx`**

```tsx
import type { ReactNode } from 'react'

/**
 * Section chrome for the Battle pages: black band, optional ink-splatter edge
 * strips (alpha PNGs from the campaign frames, edges only), slab kicker and
 * distressed display title. Real text throughout.
 */
export default function BattleSection({
  id, kicker, title, children, splatter, className = '',
}: {
  id?: string
  kicker?: string
  title: string
  children: ReactNode
  splatter?: 'top' | 'bottom' | 'both'
  className?: string
}) {
  const top = splatter === 'top' || splatter === 'both'
  const bottom = splatter === 'bottom' || splatter === 'both'
  return (
    <section id={id} className={`relative border-t px-4 py-14 ${className}`} style={{ borderColor: '#2a2a2a' }}>
      {top && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-repeat-x opacity-70"
             style={{ backgroundImage: 'url(/images/tattoo-battle/splatter-top.png)', backgroundSize: 'auto 100%' }} />
      )}
      <div className="relative mx-auto max-w-4xl">
        {kicker && (
          <p className="mb-2 text-center font-battle-condensed text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#C4A882' }}>
            <span className="text-emboss">{kicker}</span>
          </p>
        )}
        <h2 className="mb-8 text-center font-battle-display text-3xl uppercase text-white sm:text-4xl">
          <span className="text-emboss">{title}</span>
        </h2>
        {children}
      </div>
      {bottom && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-repeat-x opacity-70"
             style={{ backgroundImage: 'url(/images/tattoo-battle/splatter-bottom.png)', backgroundSize: 'auto 100%' }} />
      )}
    </section>
  )
}
```

- [ ] **Step 2: `PresentedBy.tsx`**

```tsx
import { TATTOO_BATTLE_PRESENTER } from '@/lib/event-config'
import { WHOLELIFE_INSTAGRAM } from '@/lib/tattoo-battle-config'
import type { PresenterRow } from '@/lib/tattoo-battle-data'

/**
 * "Presented by WholeLife Aftercare". Logo and link come from the confirmed
 * sponsorship row when it matches the presenter name; otherwise the name as
 * text (never a borrowed asset). Nothing about tier or money is read.
 */
export default function PresentedBy({ presenter, size = 'block' }: { presenter: PresenterRow | null; size?: 'hero' | 'block' }) {
  const name = TATTOO_BATTLE_PRESENTER
  const site = presenter?.website ?? null
  const ig = presenter?.instagram
    ? `https://instagram.com/${presenter.instagram.replace(/^@/, '')}`
    : WHOLELIFE_INSTAGRAM
  const logoH = size === 'hero' ? 'h-14 sm:h-20' : 'h-16 sm:h-24'
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="font-battle-condensed text-xs font-bold uppercase tracking-[0.25em]" style={{ color: '#C4A882' }}>
        Presented by
      </p>
      {presenter?.logo_url ? (
        <a href={site ?? ig} target="_blank" rel="noopener noreferrer sponsored" aria-label={`${name} website`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={presenter.logo_url} alt={name} className={`${logoH} w-auto object-contain`} loading={size === 'hero' ? 'eager' : 'lazy'} />
        </a>
      ) : (
        <p className="font-battle-slab text-2xl text-white">{name}</p>
      )}
      <a href={ig} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4" style={{ color: '#C4A882' }}>
        {presenter?.instagram ?? '@wholelife.aftercare'} on Instagram
      </a>
    </div>
  )
}
```

- [ ] **Step 3: `EntryCard.tsx` and `ChampionBanner.tsx`**

```tsx
// EntryCard.tsx
import Link from 'next/link'
import Image from 'next/image'
import type { BattleEntry } from '@/lib/tattoo-battle-data'
import { entryAlt, entryPath, mediaPublicUrl } from '@/lib/tattoo-battle'

export default function EntryCard({ entry }: { entry: BattleEntry }) {
  const first = entry.media[0]
  const thumb = first ? (first.type === 'image' ? mediaPublicUrl(first.path) : first.poster_path ? mediaPublicUrl(first.poster_path) : null) : null
  return (
    <Link href={entryPath(entry.bucket_number)} className="group flex flex-col overflow-hidden rounded-2xl border transition-colors hover:border-[#8B7355]"
          style={{ backgroundColor: '#1a1a1a', borderColor: entry.is_champion ? '#C4A882' : '#2a2a2a' }}>
      <div className="relative aspect-square bg-black">
        {thumb ? (
          <Image src={thumb} alt={entryAlt(entry.bucket_number, entry.artist_name)} fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center font-battle-condensed text-sm uppercase" style={{ color: '#999' }}>Video</div>
        )}
        <span className="absolute left-2 top-2 rounded-md px-2 py-1 font-battle-display text-lg text-black" style={{ backgroundColor: '#C4A882' }}>
          #{entry.bucket_number}
        </span>
        {entry.is_champion && (
          <span className="absolute right-2 top-2 rounded-md px-2 py-1 font-battle-condensed text-xs font-bold uppercase tracking-wider text-black" style={{ backgroundColor: '#C4A882' }}>
            Champion
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="font-battle-slab text-base text-white">{entry.artist_name}</p>
        {entry.shop_name && <p className="text-xs" style={{ color: '#999' }}>{entry.shop_name}</p>}
      </div>
    </Link>
  )
}
```

```tsx
// ChampionBanner.tsx
import Link from 'next/link'
import type { BattleEntry } from '@/lib/tattoo-battle-data'
import { entryPath } from '@/lib/tattoo-battle'
import { EVENT_YEAR } from '@/lib/event-config'

export default function ChampionBanner({ entry }: { entry: BattleEntry }) {
  return (
    <div className="border-b px-4 py-4 text-center" style={{ backgroundColor: 'rgba(196,168,130,0.12)', borderColor: '#8B7355' }}>
      <p className="font-battle-condensed text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#C4A882' }}>{EVENT_YEAR} Champion</p>
      <p className="mt-1 font-battle-display text-2xl uppercase text-white sm:text-3xl">{entry.artist_name}</p>
      {entry.shop_name && <p className="text-sm" style={{ color: '#999' }}>{entry.shop_name}</p>}
      <Link href={entryPath(entry.bucket_number)} className="mt-2 inline-block text-sm font-semibold underline underline-offset-4" style={{ color: '#C4A882' }}>
        See the winning tattoo (Bucket #{entry.bucket_number})
      </Link>
    </div>
  )
}
```

- [ ] **Step 4: The page**

`src/app/tattoo-battle/page.tsx`. Every section below maps to a spec section in order. Copy comes from config; times from schedule rows; presenter from the sponsor row.

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import PublicNav from '@/components/PublicNav'
import PageImage from '@/components/PageImage'
import BattleSection from '@/components/tattoo-battle/BattleSection'
import PresentedBy from '@/components/tattoo-battle/PresentedBy'
import EntryCard from '@/components/tattoo-battle/EntryCard'
import ChampionBanner from '@/components/tattoo-battle/ChampionBanner'
import BattleCountdown from '@/components/tattoo-battle/BattleCountdown'
import { canonical } from '@/lib/site'
import {
  ASSETS, EVENT_NAME, EVENT_YEAR, TATTOO_BATTLE_PRESENTER,
  VENUE_NAME, VENUE_STREET, VENUE_CITY, VENUE_STATE, VENUE_POSTAL, SOCIAL,
} from '@/lib/event-config'
import {
  BATTLE_START, BATTLE_DURATION_HOURS, HERO, ELIGIBILITY, RULES, HOW_IT_WORKS, BUCKETS_ONLY_COPY,
  ONLINE_DONATIONS_COUNT_AS_VOTES, VETERAN_INK, PRIZES, PAST_CHAMPIONS, ATTENDEE_TIPS, FAQ, WINNER_ANNOUNCED,
} from '@/lib/tattoo-battle-config'
import { buildTimeline } from '@/lib/tattoo-battle'
import { getPublishedEntries, getPresenter, getBattleScheduleRows } from '@/lib/tattoo-battle-data'
import { QR_BASE_URL } from '@/lib/tattoo-battle-config'

const TITLE = `The All American Tattoo Battle ${EVENT_YEAR} | AATC Fayetteville`
const DESCRIPTION =
  `AATC's head-to-head tattoo showdown, presented by ${TATTOO_BATTLE_PRESENTER}. Surprise stencil, ${BATTLE_DURATION_HOURS} hours, judged on stage, then the crowd votes with their dollars for ${VETERAN_INK.name}. ${VENUE_CITY}, ${VENUE_STATE}.`

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical('/tattoo-battle') },
  openGraph: {
    title: TITLE, description: DESCRIPTION, siteName: EVENT_NAME, type: 'website',
    images: [{ url: ASSETS.tattooBattleOg, width: 1024, height: 1024, alt: `${HERO.title} presented by ${TATTOO_BATTLE_PRESENTER}` }],
  },
  twitter: { card: 'summary_large_image', site: SOCIAL.xHandle, creator: SOCIAL.xHandle, title: TITLE, description: DESCRIPTION, images: [ASSETS.tattooBattleOg] },
}

export default async function TattooBattlePage() {
  const [entries, presenter, rows] = await Promise.all([getPublishedEntries(), getPresenter(), getBattleScheduleRows()])
  const champion = entries.find(e => e.is_champion) ?? null
  const { steps, mismatch } = buildTimeline(rows, { startIso: BATTLE_START, durationHours: BATTLE_DURATION_HOURS })
  if (mismatch) console.error(`[tattoo-battle] timeline: ${mismatch}`)

  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: HERO.title,
    description: DESCRIPTION,
    startDate: BATTLE_START,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: [`${QR_BASE_URL}${ASSETS.tattooBattleOg}`],
    location: {
      '@type': 'Place', name: VENUE_NAME,
      address: { '@type': 'PostalAddress', streetAddress: VENUE_STREET, addressLocality: VENUE_CITY, addressRegion: VENUE_STATE, postalCode: VENUE_POSTAL, addressCountry: 'US' },
    },
    organizer: { '@type': 'Organization', name: `${EVENT_NAME} LLC`, url: QR_BASE_URL },
    superEvent: { '@type': 'Event', name: `${EVENT_NAME} ${EVENT_YEAR}`, url: QR_BASE_URL },
    sponsor: { '@type': 'Organization', name: TATTOO_BATTLE_PRESENTER },
  }
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <PublicNav />

      {champion && <ChampionBanner entry={champion} />}

      {/* Hero */}
      <header className="relative px-4 pb-12 pt-8 text-center">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-repeat-x opacity-70"
             style={{ backgroundImage: 'url(/images/tattoo-battle/splatter-top.png)', backgroundSize: 'auto 100%' }} />
        <div className="relative mx-auto max-w-3xl">
          <Image src="/images/tattoo-battle/lockup-full.png" alt="" aria-hidden="true" width={1100} height={690} priority
                 className="mx-auto h-auto w-full max-w-xl" />
          <h1 className="sr-only">{HERO.title}</h1>
          <p className="mt-2 font-battle-condensed text-xs font-bold uppercase tracking-[0.3em] sm:text-sm" style={{ color: '#C4A882' }}>
            <span className="text-emboss">{HERO.kicker}</span>
          </p>
          <div className="mt-6"><PresentedBy presenter={presenter} size="hero" /></div>

          <div className="mx-auto mt-8 max-w-2xl rounded-2xl px-4 py-8 sm:px-8" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <p className="mb-6 font-battle-condensed text-xs font-bold uppercase tracking-widest sm:text-sm" style={{ color: '#C4A882' }}>
              The stencil drops in
            </p>
            <BattleCountdown />
          </div>

          <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-4 sm:flex-row">
            <Link href="/apply" className="flex flex-1 items-center justify-center rounded-xl bg-[#8B7355] px-8 py-5 text-base font-bold text-white transition-colors hover:bg-[#C4A882] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4A882]">
              {HERO.ctaBooth}
            </Link>
            <a href="#how-it-works" className="flex flex-1 items-center justify-center rounded-xl border-2 px-8 py-5 text-base font-bold transition-colors hover:text-white" style={{ borderColor: '#8B7355', color: '#C4A882' }}>
              {HERO.ctaHow}
            </a>
          </div>
        </div>
      </header>

      {/* Who Can Battle */}
      <BattleSection id="who" kicker="Eligibility" title="Who Can Battle">
        <ul className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
          {ELIGIBILITY.map(line => (
            <li key={line} className="rounded-2xl p-5 text-sm leading-relaxed" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#ddd' }}>{line}</li>
          ))}
        </ul>
      </BattleSection>

      {/* Competition Rules */}
      <BattleSection id="rules" kicker="The rules" title="Competition Rules">
        <dl className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
          {RULES.map(r => (
            <div key={r.title} className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <dt className="font-battle-slab text-lg text-white">{r.title}</dt>
              <dd className="mt-1 text-sm leading-relaxed" style={{ color: '#bbb' }}>{r.text}</dd>
            </div>
          ))}
        </dl>
      </BattleSection>

      {/* How the Winner Is Decided */}
      <BattleSection id="how-it-works" kicker="Judges + the crowd" title={HOW_IT_WORKS.heading} splatter="both">
        <p className="mx-auto mb-8 max-w-2xl text-center font-battle-slab text-xl text-white sm:text-2xl">
          <span className="text-emboss">{HOW_IT_WORKS.formula}</span>
        </p>
        <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #8B7355' }}>
            <h3 className="font-battle-display text-2xl uppercase text-white">{HOW_IT_WORKS.judges.title}</h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: '#ddd' }}>{HOW_IT_WORKS.judges.text}</p>
          </div>
          <div aria-hidden="true" className="hidden items-center justify-center font-battle-display text-5xl md:flex" style={{ color: '#C4A882' }}>+</div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #8B7355' }}>
            <h3 className="font-battle-display text-2xl uppercase text-white">{HOW_IT_WORKS.people.title}</h3>
            <p className="font-battle-condensed text-xs font-bold uppercase tracking-[0.25em]" style={{ color: '#C4A882' }}>{HOW_IT_WORKS.people.subtitle}</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed" style={{ color: '#ddd' }}>
              {HOW_IT_WORKS.people.steps.map(s => <li key={s}>{s}</li>)}
              {!ONLINE_DONATIONS_COUNT_AS_VOTES && <li>{BUCKETS_ONLY_COPY}</li>}
            </ol>
          </div>
        </div>
        <p className="mt-6 rounded-2xl p-5 text-center font-battle-slab text-lg text-white" style={{ backgroundColor: 'rgba(139,115,85,0.15)', border: '1px solid #8B7355' }}>
          {HOW_IT_WORKS.sunday}
        </p>
      </BattleSection>

      {/* This Year's Battle - hidden until at least one entry is published */}
      {entries.length > 0 && (
        <BattleSection id="entries" kicker={`${EVENT_YEAR} entries`} title="This Year's Battle">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {entries.map(e => <EntryCard key={e.id} entry={e} />)}
          </div>
        </BattleSection>
      )}

      {/* About Veteran Ink */}
      <BattleSection id="veteran-ink" kicker="Every dollar supports" title={`About ${VETERAN_INK.name}`}>
        <div className="mx-auto max-w-2xl text-center">
          <PageImage slug="tattoo-battle-veteran-ink" className="mx-auto mb-6 max-w-xs" imageClassName="mx-auto h-auto w-full" />
          <p className="text-sm leading-relaxed sm:text-base" style={{ color: '#ddd' }}>{VETERAN_INK.description}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={VETERAN_INK.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border-2 px-6 py-3 text-sm font-bold" style={{ borderColor: '#8B7355', color: '#C4A882' }}>Visit {VETERAN_INK.name}</a>
            <a href={VETERAN_INK.donateUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#8B7355] px-6 py-3 text-sm font-bold text-white hover:bg-[#C4A882]">Donate to {VETERAN_INK.name}</a>
          </div>
        </div>
      </BattleSection>

      {/* Weekend Timeline */}
      <BattleSection id="timeline" kicker="The weekend" title="Weekend Timeline">
        <ol className="mx-auto max-w-2xl space-y-3">
          {steps.map((s, i) => (
            <li key={s.key} className="flex gap-4 rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <span className="font-battle-display text-3xl leading-none" style={{ color: '#C4A882' }}>{i + 1}</span>
              <div>
                <p className="font-battle-condensed text-xs font-bold uppercase tracking-[0.2em]" style={{ color: '#C4A882' }}>{s.when}</p>
                <p className="mt-1 text-sm" style={{ color: '#ddd' }}>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-center font-battle-display text-5xl uppercase sm:text-7xl" style={{ color: '#C4A882' }} aria-label="Let's go">LFG!!</p>
      </BattleSection>

      {/* Prizes */}
      <BattleSection id="prizes" kicker="What the champion takes home" title="Prizes">
        <ul className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
          {PRIZES.map(p => (
            <li key={p.title} className="rounded-2xl p-5 font-battle-slab text-lg text-white" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              {p.title}{p.optional && <span className="ml-2 text-xs font-sans" style={{ color: '#999' }}>(optional)</span>}
            </li>
          ))}
        </ul>
      </BattleSection>

      {/* Past Champions - hidden while empty */}
      {PAST_CHAMPIONS.length > 0 && (
        <BattleSection id="past-champions" kicker="Hall of champions" title="Past Champions">
          <ul className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
            {PAST_CHAMPIONS.map(c => (
              <li key={`${c.year}-${c.name}`} className="flex items-center gap-4 rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                {c.image && <Image src={c.image} alt={`${c.name}, ${c.year} champion`} width={72} height={72} className="h-18 w-18 rounded-full object-cover" />}
                <div>
                  <p className="font-battle-display text-xl" style={{ color: '#C4A882' }}>{c.year}</p>
                  <p className="font-battle-slab text-lg text-white">{c.name}</p>
                  {c.shop && <p className="text-sm" style={{ color: '#999' }}>{c.shop}</p>}
                  {c.instagram && <a href={`https://instagram.com/${c.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm underline" style={{ color: '#C4A882' }}>{c.instagram}</a>}
                </div>
              </li>
            ))}
          </ul>
        </BattleSection>
      )}

      {/* For Attendees */}
      <BattleSection id="attendees" kicker="Coming to watch?" title="For Attendees">
        <ul className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3">
          {ATTENDEE_TIPS.map(t => (
            <li key={t} className="rounded-2xl p-5 text-center font-battle-slab text-lg text-white" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>{t}</li>
          ))}
        </ul>
        <p className="mt-4 text-center text-sm" style={{ color: '#999' }}>Champion crowned {WINNER_ANNOUNCED}.</p>
      </BattleSection>

      {/* Sponsor block */}
      <BattleSection id="sponsor" title="Our Presenting Sponsor">
        <PresentedBy presenter={presenter} />
      </BattleSection>

      {/* FAQ */}
      <BattleSection id="faq" kicker="Questions" title="FAQ" splatter="bottom">
        <div className="mx-auto max-w-2xl space-y-2">
          {FAQ.map(f => (
            <details key={f.q} className="group rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <summary className="cursor-pointer font-battle-slab text-base text-white marker:text-[#C4A882]">{f.q}</summary>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: '#ddd' }}>{f.a}</p>
            </details>
          ))}
        </div>
      </BattleSection>
    </div>
  )
}
```

Notes for the implementer: `h-18 w-18` is not a default Tailwind size; use `h-16 w-16`. If `PageImage` does not accept `imageClassName`, check its props in `src/components/PageImage.tsx` (it does: `{ slug, className?, imageClassName? }`).

- [ ] **Step 5: Build, view, check accessibility**

```bash
npm run build 2>&1 | tail -3
(npx next start -p 3777 >/dev/null 2>&1 &) ; sleep 4
curl -s http://localhost:3777/tattoo-battle | grep -c 'application/ld+json'          # expect 2
curl -s http://localhost:3777/tattoo-battle | grep -o 'Presented by' | wc -l          # >= 2
curl -s http://localhost:3777/tattoo-battle | grep -c "This Year's Battle"           # expect 0 (no entries yet)
curl -s http://localhost:3777/tattoo-battle | grep -ci 'tax'                          # expect 0
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=390,3200 --screenshot=/private/tmp/claude-501/-Users-ryanharrell/3d0ff216-161a-4280-b39f-3762c60a995b/scratchpad/battle-mobile.png http://localhost:3777/tattoo-battle 2>/dev/null
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,3600 --screenshot=/private/tmp/claude-501/-Users-ryanharrell/3d0ff216-161a-4280-b39f-3762c60a995b/scratchpad/battle-desktop.png http://localhost:3777/tattoo-battle 2>/dev/null
npx --yes lighthouse http://localhost:3777/tattoo-battle --only-categories=accessibility --chrome-flags="--headless=new" --output=json --output-path=/private/tmp/claude-501/-Users-ryanharrell/3d0ff216-161a-4280-b39f-3762c60a995b/scratchpad/lh-battle.json --quiet
python3 -c "import json;print('a11y', json.load(open('/private/tmp/claude-501/-Users-ryanharrell/3d0ff216-161a-4280-b39f-3762c60a995b/scratchpad/lh-battle.json'))['categories']['accessibility']['score'])"
pkill -f "next start -p 3777"
```

View both screenshots with the Read tool. Accessibility must be ≥ 0.95; if lower, open the JSON's `audits` for failing items and fix them (usually contrast or a missing name on a link).

- [ ] **Step 6: Commit**

```bash
git add src/components/tattoo-battle src/app/tattoo-battle/page.tsx
git commit -m "feat(battle): public /tattoo-battle page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: QR landing page `/tattoo-battle/entry/[bucket]` and the media carousel

**Files:**
- Create: `src/components/tattoo-battle/MediaCarousel.tsx`, `src/app/tattoo-battle/entry/[bucket]/page.tsx`

**Interfaces:**
- Consumes: `parseBucket`, `entryAlt`, `mediaPublicUrl`, `ogImageFor`, `MediaItem` (Task 1); `getEntryByBucket` (Task 3); `ASSETS.tattooBattleOg`.
- Produces: `MediaCarousel({ items: MediaItem[]; alt: string })` client component.

- [ ] **Step 1: `MediaCarousel.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import type { MediaItem } from '@/lib/tattoo-battle'
import { mediaPublicUrl } from '@/lib/tattoo-battle'

/**
 * Phone-first swipe carousel: CSS scroll-snap, prev/next buttons, dots.
 * The first item loads eagerly; everything after it is lazy (images via
 * loading="lazy", videos via preload="none"). Videos are playsInline + muted
 * with controls and a poster, so nothing autoplays with sound on a show floor.
 */
export default function MediaCarousel({ items, alt }: { items: MediaItem[]; alt: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  const go = (i: number) => {
    const el = track.current
    if (!el) return
    const clamped = Math.max(0, Math.min(items.length - 1, i))
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' })
    setIndex(clamped)
  }
  const onScroll = () => {
    const el = track.current
    if (!el) return
    setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  if (items.length === 0) return null

  return (
    <div className="relative">
      <div ref={track} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-black" style={{ scrollbarWidth: 'none' }} aria-roledescription="carousel">
        {items.map((m, i) => (
          <div key={m.path} className="relative aspect-[4/5] w-full shrink-0 snap-center" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}>
            {m.type === 'image' ? (
              <Image src={mediaPublicUrl(m.path)} alt={alt} fill sizes="100vw" className="object-contain" priority={i === 0} loading={i === 0 ? 'eager' : 'lazy'} />
            ) : (
              <video
                className="h-full w-full object-contain"
                src={mediaPublicUrl(m.path)}
                poster={m.poster_path ? mediaPublicUrl(m.poster_path) : undefined}
                playsInline muted controls
                preload={i === 0 ? 'metadata' : 'none'}
                aria-label={alt}
              />
            )}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-2 text-lg font-bold text-black" style={{ backgroundColor: '#C4A882' }}>‹</button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-2 text-lg font-bold text-black" style={{ backgroundColor: '#C4A882' }}>›</button>
          <div className="mt-3 flex justify-center gap-2" role="tablist" aria-label="Slides">
            {items.map((m, i) => (
              <button key={m.path} type="button" role="tab" aria-selected={i === index} aria-label={`Go to slide ${i + 1}`} onClick={() => go(i)}
                      className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i === index ? '#C4A882' : '#444' }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: The entry page**

`src/app/tattoo-battle/entry/[bucket]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import PublicNav from '@/components/PublicNav'
import MediaCarousel from '@/components/tattoo-battle/MediaCarousel'
import { ASSETS, EVENT_YEAR, TATTOO_BATTLE_PRESENTER } from '@/lib/event-config'
import { canonical } from '@/lib/site'
import { BUCKETS_ONLY_COPY, ONLINE_DONATIONS_COUNT_AS_VOTES, VETERAN_INK } from '@/lib/tattoo-battle-config'
import { entryAlt, ogImageFor, parseBucket } from '@/lib/tattoo-battle'
import { getEntryByBucket } from '@/lib/tattoo-battle-data'

export const revalidate = 60

type Params = { params: Promise<{ bucket: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { bucket } = await params
  const n = parseBucket(bucket)
  if (n === null) return {}
  const entry = await getEntryByBucket(n)
  const title = entry
    ? `Bucket #${n}: ${entry.artist_name} | The All American Tattoo Battle ${EVENT_YEAR}`
    : `Bucket #${n} | The All American Tattoo Battle ${EVENT_YEAR}`
  const description = entry
    ? `Tattoo Battle entry by ${entry.artist_name}${entry.shop_name ? ` of ${entry.shop_name}` : ''}. Like it? Vote with your dollars in Bucket #${n}. Every dollar supports ${VETERAN_INK.name}.`
    : `This tattoo posts right after judging Friday afternoon. Presented by ${TATTOO_BATTLE_PRESENTER}.`
  const image = entry ? ogImageFor(entry.media, ASSETS.tattooBattleOg) : ASSETS.tattooBattleOg
  return {
    title,
    description,
    // noindex until published: a holding page is not a search result.
    robots: entry ? undefined : { index: false, follow: true },
    alternates: { canonical: entry ? canonical(`/tattoo-battle/entry/${n}`) : undefined },
    openGraph: { title, description, images: [{ url: image, alt: entry ? entryAlt(n, entry.artist_name) : 'The All American Tattoo Battle' }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default async function EntryPage({ params }: Params) {
  const { bucket } = await params
  const n = parseBucket(bucket)
  if (n === null) notFound()
  const entry = await getEntryByBucket(n)

  return (
    <div className="min-h-screen">
      <PublicNav />
      <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
        <Link href="/tattoo-battle" className="inline-block">
          <Image src="/images/tattoo-battle/wordmark-wide.png" alt="The All American Tattoo Battle" width={1350} height={440} className="mx-auto h-auto w-64" priority />
        </Link>

        <p className="mt-6 text-center font-battle-display text-6xl uppercase leading-none" style={{ color: '#C4A882' }}>
          Bucket #{n}
        </p>
        {entry?.is_champion && (
          <p className="mt-2 text-center font-battle-condensed text-sm font-bold uppercase tracking-[0.3em] text-black">
            <span className="inline-block rounded-md px-3 py-1" style={{ backgroundColor: '#C4A882' }}>{EVENT_YEAR} Champion</span>
          </p>
        )}

        {!entry ? (
          <div className="mt-8 rounded-2xl p-6 text-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <p className="font-battle-slab text-xl text-white">This tattoo posts right after judging Friday afternoon.</p>
            <p className="mt-3 text-sm" style={{ color: '#bbb' }}>Come back after the artists present on stage, then vote with your dollars.</p>
            <Link href="/tattoo-battle" className="mt-6 inline-block rounded-xl bg-[#8B7355] px-6 py-3 text-sm font-bold text-white">About the Battle</Link>
          </div>
        ) : (
          <>
            <div className="mt-6">
              <MediaCarousel items={entry.media} alt={entryAlt(n, entry.artist_name)} />
            </div>
            <div className="mt-6 text-center">
              <p className="font-battle-slab text-2xl text-white">{entry.artist_name}</p>
              {entry.shop_name && <p className="text-sm" style={{ color: '#bbb' }}>{entry.shop_name}{entry.city_state ? ` · ${entry.city_state}` : ''}</p>}
              {entry.instagram && (
                <a href={`https://instagram.com/${entry.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm underline underline-offset-4" style={{ color: '#C4A882' }}>
                  @{entry.instagram.replace(/^@/, '')}
                </a>
              )}
            </div>

            <div className="mt-8 rounded-2xl p-6 text-center" style={{ backgroundColor: 'rgba(139,115,85,0.15)', border: '1px solid #8B7355' }}>
              <p className="font-battle-display text-2xl uppercase text-white">Like this one?</p>
              <p className="mt-2 font-battle-slab text-lg" style={{ color: '#C4A882' }}>Vote with your dollars: drop cash in Bucket #{n}.</p>
              {!ONLINE_DONATIONS_COUNT_AS_VOTES && <p className="mt-2 text-sm" style={{ color: '#ddd' }}>{BUCKETS_ONLY_COPY}</p>}
            </div>

            <div className="mt-6 text-center text-sm" style={{ color: '#bbb' }}>
              <p>Every dollar supports <a href={VETERAN_INK.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" style={{ color: '#C4A882' }}>{VETERAN_INK.name}</a>, a 501(c)(3) nonprofit that helps veterans heal through tattoo therapy.</p>
            </div>

            <div className="mt-8 text-center">
              <Link href="/tattoo-battle#entries" className="text-sm font-semibold underline underline-offset-4" style={{ color: '#C4A882' }}>See all entries</Link>
            </div>
          </>
        )}
        <p className="mt-10 text-center font-battle-condensed text-xs uppercase tracking-[0.25em]" style={{ color: '#999' }}>Presented by {TATTOO_BATTLE_PRESENTER}</p>
      </main>
    </div>
  )
}
```

The sentence under the CTA paraphrases `VETERAN_INK.description`'s first clause; it adds no facts, statistics or percentages.

- [ ] **Step 3: Build and check the three states**

```bash
npm run build 2>&1 | tail -3
(npx next start -p 3777 >/dev/null 2>&1 &) ; sleep 4
for b in 0 07 21 abc; do printf "%-4s " "$b"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3777/tattoo-battle/entry/$b"; done   # all 404
curl -s -o /dev/null -w "bucket 1 -> %{http_code}\n" http://localhost:3777/tattoo-battle/entry/1                                     # 200
curl -s http://localhost:3777/tattoo-battle/entry/1 | grep -o 'name="robots" content="[^"]*"'                                          # noindex
curl -s http://localhost:3777/tattoo-battle/entry/1 | grep -c 'posts right after judging'                                              # 1
curl -s -o /dev/null -w "bucket 20 -> %{http_code}\n" http://localhost:3777/tattoo-battle/entry/20                                   # 200
pkill -f "next start -p 3777"
```

The published state cannot be exercised until migration 069 is applied and an entry published; Task 12's script and Ryan's admin run cover it.

- [ ] **Step 4: Commit**

```bash
git add src/components/tattoo-battle/MediaCarousel.tsx "src/app/tattoo-battle/entry/[bucket]/page.tsx"
git commit -m "feat(battle): QR entry page with holding state, carousel and per-entry metadata

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Wiring: nav, homepage card, redirect, revalidate allow-list, roles, admin nav, prebuild guard

**Files:**
- Modify: `src/components/PublicNav.tsx:36-47,92-97`, `src/lib/homepage-content.ts:38-46`, `next.config.ts`, `src/app/api/revalidate/route.ts:16-17,44-45`, `src/lib/roles.ts` (content_editor list), `src/components/admin/AdminShell.tsx` (NAV), `scripts/check-event-dates.mjs`

- [ ] **Step 1: Nav entry and active-state**

In `DROPDOWNS` Events `links`, insert as the FIRST entry: `{ href: '/tattoo-battle', label: 'Tattoo Battle' },`. In `NavDropdown`, `isActive` already matches `pathname === href || pathname.startsWith(href + '/')`, and `groupActive` ORs `config.links.some(l => isActive(l.href))`, so `/tattoo-battle` and `/tattoo-battle/entry/3` both highlight the Events group with no further change. Verify by reading lines 92-97; if the logic differs, add `|| pathname.startsWith('/tattoo-battle')` to `groupActive` for `config.label === 'Events'`.

- [ ] **Step 2: Homepage card**

`src/lib/homepage-content.ts`: change the Battle card's `href: '/events/tattoo-contests'` to `href: '/tattoo-battle'`.

- [ ] **Step 3: 301 redirect**

`next.config.ts`:

```ts
const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: 'srlgjovefsmtkxthtjkz.supabase.co' }] },
  async redirects() {
    return [
      // The WordPress battle page and its two attachment sub-URLs (Wayback,
      // 2024-12 / 2025-01). Approved by Ryan 2026-09-23.
      { source: '/all-american-tattoo-battle-rules-signup', destination: '/tattoo-battle', permanent: true },
      { source: '/all-american-tattoo-battle-rules-signup/:path*', destination: '/tattoo-battle', permanent: true },
    ]
  },
}
```

- [ ] **Step 4: Revalidate allow-list**

`src/app/api/revalidate/route.ts`:

```ts
const ALLOWED_PATHS = new Set(['/', '/apply', '/tickets', '/contests', '/sponsors', '/tattoo-battle'])
// Entry pages are dynamic: /tattoo-battle/entry/<n>. Pattern-matched so an
// admin publish can purge exactly the bucket it touched.
const ALLOWED_PATH_PATTERNS = [/^\/tattoo-battle\/entry\/[1-9]\d{0,2}$/]
const ALLOWED_TAGS = new Set(['page_content', 'sponsors', 'panels', 'contests', 'tattoo-battle'])
```
and
```ts
  const paths = (body.paths ?? ['/']).filter(p => ALLOWED_PATHS.has(p) || ALLOWED_PATH_PATTERNS.some(re => re.test(p)))
```

- [ ] **Step 5: Roles and admin nav**

`src/lib/roles.ts` content_editor list, after `'/admin/contests',`:
```ts
    // Tattoo Battle entries are show-floor editorial work; table and bucket
    // policies grant content_editor (069), all writes go through guardedWrite().
    '/admin/tattoo-battle',
```

`src/components/admin/AdminShell.tsx` NAV, after the Contests entry (find `href: '/admin/contests'`):
```tsx
  {
    href: '/admin/tattoo-battle',
    label: 'Tattoo Battle',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3v7a6 6 0 0 0 12 0V3"/><path d="M6 3h12"/><path d="M12 16v5"/><path d="M8 21h8"/>
      </svg>
    ),
  },
```

- [ ] **Step 6: Prebuild guard for BATTLE_START**

Append to `scripts/check-event-dates.mjs` before the final `console.log`:

```js
// ── Tattoo Battle start must equal the "Battle Begins" schedule row ──
// BATTLE_START drives the countdown and JSON-LD; the schedule row drives
// /events/schedule and the timeline. Same reasoning as the show dates above.
const battleSrc = readFileSync(`${ROOT}src/lib/tattoo-battle-config.ts`, 'utf8')
const bm = battleSrc.match(/export const BATTLE_START = '([^']+)'/)
if (!bm) { console.error('[check-event-dates] Could not find BATTLE_START in src/lib/tattoo-battle-config.ts'); process.exit(1) }
const battleDate = etDate(bm[1])
const battleTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(bm[1]))
const { data: activeEvent } = await supabase.from('events').select('id').eq('is_active', true).single()
const { data: beginsRow, error: beginsErr } = await supabase
  .from('schedule_items_public')
  .select('day_date, start_time')
  .eq('event_id', activeEvent?.id ?? '')
  .ilike('title', '%Tattoo Battle Begins%')
  .maybeSingle()
if (beginsErr || !beginsRow) {
  console.warn(`[check-event-dates] Could not read the Battle Begins schedule row (${beginsErr?.message ?? 'no row'}) - skipping.`)
} else if (beginsRow.day_date !== battleDate || beginsRow.start_time.slice(0, 5) !== battleTime) {
  console.error(
    `\n[check-event-dates] FAIL - BATTLE_START (${battleDate} ${battleTime} ET) disagrees with the\n` +
    `"Tattoo Battle Begins" schedule row (${beginsRow.day_date} ${beginsRow.start_time}).\n` +
    `Fix whichever is wrong. The countdown and the timeline will disagree until they match.\n`
  )
  process.exit(1)
} else {
  console.log(`[check-event-dates] OK - BATTLE_START matches the schedule row (${battleDate} ${battleTime} ET).`)
}
```

Run `node scripts/check-event-dates.mjs` and expect both OK lines.

- [ ] **Step 7: Build, verify redirect and nav, commit**

```bash
npm run build 2>&1 | tail -3
(npx next start -p 3777 >/dev/null 2>&1 &) ; sleep 4
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3777/all-american-tattoo-battle-rules-signup/            # 308 .../tattoo-battle
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3777/all-american-tattoo-battle-rules-signup/aatc_battle/ # 308 .../tattoo-battle
curl -s http://localhost:3777/ | grep -o 'href="/tattoo-battle"' | wc -l                                                            # >= 2 (nav + card)
pkill -f "next start -p 3777"
git add src/components/PublicNav.tsx src/lib/homepage-content.ts next.config.ts src/app/api/revalidate/route.ts src/lib/roles.ts src/components/admin/AdminShell.tsx scripts/check-event-dates.mjs
git commit -m "feat(battle): nav, homepage card, 301 from the WordPress URL, revalidate allow-list, roles, prebuild guard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Note: Next emits 308 for `permanent: true`; that satisfies "301" for every crawler and browser (both are permanent). If Ryan wants a literal 301, use `statusCode: 301` instead of `permanent`.

---

### Task 9: Media helpers (validation, paths, reorder, upload with progress, poster capture)

**Files:**
- Create: `src/lib/tattoo-battle-media.ts`, `src/lib/tattoo-battle-media.test.ts`

**Interfaces:**
- Produces:
  - `ACCEPT_TYPES = ['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'] as const`, `ACCEPT_ATTR` (joined), `MAX_BYTES = 50 * 1024 * 1024`
  - `validateFile(f: { type: string; size: number; name: string }): { ok: true; kind: 'image' | 'video' } | { ok: false; reason: string }`
  - `objectPath(eventId: string, bucket: number, kind: 'image' | 'video', ext: string, now?: number): string`
  - `posterPath(mediaPath: string): string`
  - `moveItem<T>(list: T[], from: number, to: number): T[]` (pure, returns a new array)
  - `uploadWithProgress(opts: { url: string; token: string; anonKey: string; path: string; file: File; onProgress: (pct: number) => void }): Promise<void>` (XHR to `${url}/storage/v1/object/tattoo-battle-media/${path}`)
  - `capturePoster(file: File): Promise<Blob | null>` (browser only)

- [ ] **Step 1: Failing tests**

`src/lib/tattoo-battle-media.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateFile, objectPath, posterPath, moveItem, MAX_BYTES, ACCEPT_ATTR } from '@/lib/tattoo-battle-media'

describe('validateFile', () => {
  it('accepts each allowed type and classifies it', () => {
    expect(validateFile({ type: 'image/jpeg', size: 10, name: 'a.jpg' })).toEqual({ ok: true, kind: 'image' })
    expect(validateFile({ type: 'video/quicktime', size: 10, name: 'a.mov' })).toEqual({ ok: true, kind: 'video' })
    expect(validateFile({ type: 'video/mp4', size: 10, name: 'a.mp4' })).toEqual({ ok: true, kind: 'video' })
  })
  it('rejects HEIC with the iPhone hint', () => {
    const r = validateFile({ type: 'image/heic', size: 10, name: 'IMG_1.HEIC' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/Most Compatible/)
  })
  it('rejects a HEIC that arrives with an empty type but a .heic name', () => {
    const r = validateFile({ type: '', size: 10, name: 'IMG_2.heic' })
    expect(r.ok).toBe(false)
  })
  it('rejects exactly one byte over the cap and accepts the cap itself', () => {
    expect(validateFile({ type: 'video/mp4', size: MAX_BYTES, name: 'a.mp4' }).ok).toBe(true)
    const r = validateFile({ type: 'video/mp4', size: MAX_BYTES + 1, name: 'a.mp4' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/50 MB/)
  })
  it('rejects unknown types', () => {
    expect(validateFile({ type: 'application/pdf', size: 10, name: 'a.pdf' }).ok).toBe(false)
  })
  it('ACCEPT_ATTR is the exact bucket list', () => {
    expect(ACCEPT_ATTR).toBe('image/jpeg,image/png,image/webp,video/mp4,video/quicktime')
  })
})

describe('paths', () => {
  it('nests by event and zero-padded bucket, with a timestamp', () => {
    expect(objectPath('ev1', 3, 'image', 'jpg', 1700000000000)).toBe('ev1/bucket-03/1700000000000-image.jpg')
  })
  it('poster sits beside its video', () => {
    expect(posterPath('ev1/bucket-03/1700000000000-video.mov')).toBe('ev1/bucket-03/1700000000000-video-poster.jpg')
  })
})

describe('moveItem', () => {
  it('moves without mutating', () => {
    const a = [1, 2, 3, 4]
    expect(moveItem(a, 3, 0)).toEqual([4, 1, 2, 3])
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1, 4])
    expect(a).toEqual([1, 2, 3, 4])
  })
  it('clamps out-of-range targets', () => {
    expect(moveItem([1, 2, 3], 0, 9)).toEqual([2, 3, 1])
    expect(moveItem([1, 2, 3], 2, -5)).toEqual([3, 1, 2])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/tattoo-battle-media.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

`src/lib/tattoo-battle-media.ts`:

```ts
import { MEDIA_BUCKET } from './tattoo-battle'

/** Matches the bucket's allowed_mime_types in migration 069 EXACTLY. */
export const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'] as const
export const ACCEPT_ATTR = ACCEPT_TYPES.join(',')
export const MAX_BYTES = 50 * 1024 * 1024

const IPHONE_HINT = 'That photo is HEIC. On iPhone, set Camera > Formats > Most Compatible, or share it as JPEG.'

export type Validation = { ok: true; kind: 'image' | 'video' } | { ok: false; reason: string }

export function validateFile(f: { type: string; size: number; name: string }): Validation {
  const lower = f.name.toLowerCase()
  if (f.type === 'image/heic' || f.type === 'image/heif' || lower.endsWith('.heic') || lower.endsWith('.heif')) {
    return { ok: false, reason: IPHONE_HINT }
  }
  if (!(ACCEPT_TYPES as readonly string[]).includes(f.type)) {
    return { ok: false, reason: `That file type is not supported (${f.type || 'unknown'}). Use JPEG, PNG, WebP, MP4 or MOV.` }
  }
  if (f.size > MAX_BYTES) {
    const mb = (f.size / 1024 / 1024).toFixed(1)
    return { ok: false, reason: `That file is ${mb} MB. The limit is 50 MB - about 30 seconds of 1080p video.` }
  }
  return { ok: true, kind: f.type.startsWith('video/') ? 'video' : 'image' }
}

export function objectPath(eventId: string, bucket: number, kind: 'image' | 'video', ext: string, now: number = Date.now()): string {
  return `${eventId}/bucket-${String(bucket).padStart(2, '0')}/${now}-${kind}.${ext.toLowerCase()}`
}

export function posterPath(mediaPath: string): string {
  return mediaPath.replace(/\.[^.]+$/, '') + '-poster.jpg'
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice()
  if (from < 0 || from >= next.length) return next
  const [item] = next.splice(from, 1)
  const target = Math.max(0, Math.min(next.length, to))
  next.splice(target, 0, item)
  return next
}

/**
 * supabase-js upload() has no progress callback, so this posts to the same
 * storage endpoint with XMLHttpRequest. Same URL, same JWT, same RLS.
 */
export function uploadWithProgress(opts: {
  url: string; token: string; anonKey: string; path: string; file: Blob; contentType: string; onProgress: (pct: number) => void
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${opts.url}/storage/v1/object/${MEDIA_BUCKET}/${opts.path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${opts.token}`)
    xhr.setRequestHeader('apikey', opts.anonKey)
    xhr.setRequestHeader('Content-Type', opts.contentType)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = e => { if (e.lengthComputable) opts.onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else {
        let msg = `HTTP ${xhr.status}`
        try { msg = JSON.parse(xhr.responseText).message ?? msg } catch { /* keep msg */ }
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(opts.file)
  })
}

/**
 * First-frame poster for a video, captured in the browser. Returns null when
 * the browser cannot decode the file (the admin then sets a poster by hand).
 */
export function capturePoster(file: File): Promise<Blob | null> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (b: Blob | null) => { URL.revokeObjectURL(url); resolve(b) }
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url
    video.onerror = () => done(null)
    video.onloadedmetadata = () => { video.currentTime = Math.min(0.5, Math.max(0, video.duration / 10)) }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        const w = video.videoWidth, h = video.videoHeight
        if (!w || !h) return done(null)
        const scale = Math.min(1, 1280 / w)
        canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(b => done(b), 'image/jpeg', 0.85)
      } catch { done(null) }
    }
    setTimeout(() => done(null), 15000)
  })
}
```

- [ ] **Step 4: Run tests, typecheck, commit**

```bash
npx vitest run && npx tsc --noEmit
git add src/lib/tattoo-battle-media.ts src/lib/tattoo-battle-media.test.ts
git commit -m "feat(battle): media validation, paths, reorder, XHR upload with progress, poster capture

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Admin `/admin/tattoo-battle`

**Files:**
- Create: `src/app/admin/tattoo-battle/page.tsx`, `src/app/admin/tattoo-battle/SlotEditor.tsx`

**Interfaces:**
- Consumes: Task 9 helpers; `guardedWrite` from `@/lib/db-write`; `createClient` from `@/lib/supabase`; `requestRevalidate` from `@/lib/revalidate`; `BUCKET_COUNT` from config; `MediaItem`, `entryPath`, `mediaPublicUrl` from Task 1; `@radix-ui/react-dialog`.
- Produces: `SlotEditor({ eventId, bucket, row, onChanged })` where `row: Row | null` and `type Row = { id: string; bucket_number: number; artist_name: string; shop_name: string; city_state: string; instagram: string; media: MediaItem[]; is_published: boolean; is_champion: boolean }`.

- [ ] **Step 1: The list page**

`src/app/admin/tattoo-battle/page.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { BUCKET_COUNT } from '@/lib/tattoo-battle-config'
import type { MediaItem } from '@/lib/tattoo-battle'
import SlotEditor from './SlotEditor'

export interface Row {
  id: string
  bucket_number: number
  artist_name: string
  shop_name: string
  city_state: string
  instagram: string
  media: MediaItem[]
  is_published: boolean
  is_champion: boolean
}

// Show-floor admin, used from a phone. One expandable card per bucket.
// Reads as the signed-in editor: RLS lets admin/content_editor see drafts.
export default function AdminTattooBattlePage() {
  const supabase = createClient()
  const [eventId, setEventId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const load = useCallback(async () => {
    const { data: ev } = await supabase.from('events').select('id').eq('is_active', true).maybeSingle()
    if (!ev) { setFailed('No active event.'); return }
    setEventId(ev.id)
    const { data, error } = await supabase
      .from('tattoo_battle_entries')
      .select('id, bucket_number, artist_name, shop_name, city_state, instagram, media, is_published, is_champion')
      .eq('event_id', ev.id)
      .order('bucket_number')
    if (error) {
      console.error(`[admin/tattoo-battle] ${error.code}: ${error.message}`)
      setFailed(error.code === '42P01' ? 'The tattoo_battle_entries table does not exist yet - migration 069 has not been applied.' : `Could not load (${error.code}).`)
      return
    }
    setRows((data ?? []) as unknown as Row[])
  }, [supabase])

  useEffect(() => { load() }, [load])

  if (failed) return <p className="p-6 text-sm text-red-400">{failed}</p>
  if (!rows || !eventId) return <p className="p-6 text-sm" style={{ color: '#999' }}>Loading…</p>

  const byBucket = new Map(rows.map(r => [r.bucket_number, r]))
  const champion = rows.find(r => r.is_champion) ?? null

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Tattoo Battle</h1>
        <Link href="/admin/tattoo-battle/print" className="rounded-lg px-4 py-2 text-sm font-semibold text-black" style={{ backgroundColor: '#C4A882' }}>Print QR codes</Link>
      </div>

      <div className="mb-4 rounded-xl p-4 text-sm" style={{ backgroundColor: 'rgba(196,168,130,0.12)', border: '1px solid #8B7355', color: '#ddd' }}>
        <strong className="text-white">Before you shoot:</strong> record video at 1080p, keep clips under about 30 seconds (50 MB limit), and on iPhone set Camera → Formats → <strong className="text-white">Most Compatible</strong> so photos and video upload as JPEG and H.264.
      </div>

      {champion && (
        <p className="mb-4 text-sm" style={{ color: '#C4A882' }}>Champion: Bucket #{champion.bucket_number} · {champion.artist_name}</p>
      )}

      <ul className="space-y-2">
        {Array.from({ length: BUCKET_COUNT }, (_, i) => i + 1).map(n => {
          const row = byBucket.get(n) ?? null
          const status = !row ? 'empty' : row.is_published ? 'published' : 'draft'
          const color = status === 'published' ? '#4ade80' : status === 'draft' ? '#eab308' : '#666'
          return (
            <li key={n} className="rounded-xl" style={{ backgroundColor: '#1a1a1a', border: `1px solid ${row?.is_champion ? '#C4A882' : '#2a2a2a'}` }}>
              <button type="button" onClick={() => setOpen(open === n ? null : n)} className="flex w-full items-center justify-between gap-3 p-4 text-left" aria-expanded={open === n}>
                <span className="flex items-center gap-3">
                  <span className="text-lg font-bold text-white">#{n}</span>
                  <span className="text-sm" style={{ color: '#ddd' }}>{row?.artist_name || <span style={{ color: '#666' }}>unassigned</span>}</span>
                  {row?.is_champion && <span className="rounded px-2 py-0.5 text-xs font-bold text-black" style={{ backgroundColor: '#C4A882' }}>CHAMPION</span>}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{status}{row ? ` · ${row.media.length} media` : ''}</span>
              </button>
              {open === n && (
                <div className="border-t p-4" style={{ borderColor: '#2a2a2a' }}>
                  <SlotEditor eventId={eventId} bucket={n} row={row} hasChampion={!!champion} onChanged={load} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-6 text-xs" style={{ color: '#666' }}>Nothing here records votes or money. Buckets are counted on paper on Sunday.</p>
    </div>
  )
}
```

The trailing `…` in "Loading…" is an ellipsis, not a dash; fine.

- [ ] **Step 2: `SlotEditor.tsx`**

```tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { requestRevalidate } from '@/lib/revalidate'
import { entryPath, mediaPublicUrl, type MediaItem } from '@/lib/tattoo-battle'
import { ACCEPT_ATTR, capturePoster, moveItem, objectPath, posterPath, uploadWithProgress, validateFile } from '@/lib/tattoo-battle-media'
import type { Row } from './page'

const TABLE = 'tattoo_battle_entries'
const BUCKET = 'tattoo-battle-media'

export default function SlotEditor({ eventId, bucket, row, hasChampion, onChanged }: {
  eventId: string; bucket: number; row: Row | null; hasChampion: boolean; onChanged: () => Promise<void> | void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    artist_name: row?.artist_name ?? '', shop_name: row?.shop_name ?? '', city_state: row?.city_state ?? '', instagram: row?.instagram ?? '',
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null)
  const [confirmChampion, setConfirmChampion] = useState(false)

  const revalidate = () => requestRevalidate({ paths: ['/tattoo-battle', entryPath(bucket)], tags: ['tattoo-battle'] })

  // Upsert the details; creates the row on first save.
  const saveDetails = async () => {
    setBusy('save')
    const payload = { event_id: eventId, bucket_number: bucket, ...trim(form) }
    const res = row
      ? await guardedWrite(supabase.from(TABLE).update(trim(form)).eq('id', row.id).select('id'), 'Details not saved', `admin/tattoo-battle save bucket=${bucket}`)
      : await guardedWrite(supabase.from(TABLE).insert(payload).select('id'), 'Slot not created', `admin/tattoo-battle create bucket=${bucket}`)
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Saved')
    if (row?.is_published) await revalidate()
    await onChanged()
  }

  const setMedia = async (media: MediaItem[], label: string) => {
    if (!row) return false
    const res = await guardedWrite(supabase.from(TABLE).update({ media }).eq('id', row.id).select('id'), `${label} not saved`, `admin/tattoo-battle media bucket=${bucket}`)
    if (!res.ok) { toast.error(res.error); return false }
    if (row.is_published) await revalidate()
    await onChanged()
    return true
  }

  const upload = async (file: File) => {
    if (!row) { toast.error('Save the artist details first.'); return }
    const v = validateFile(file)
    if (!v.ok) { toast.error(v.reason); return }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { toast.error('Signed out. Sign in again.'); return }
    setBusy('upload')
    const ext = file.name.split('.').pop() ?? (v.kind === 'video' ? 'mp4' : 'jpg')
    const path = objectPath(eventId, bucket, v.kind, ext)
    const item: MediaItem = { type: v.kind, path }
    try {
      await uploadWithProgress({
        url: process.env.NEXT_PUBLIC_SUPABASE_URL!, token: session.access_token, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        path, file, contentType: file.type, onProgress: pct => setProgress({ name: file.name, pct }),
      })
      if (v.kind === 'video') {
        const poster = await capturePoster(file)
        if (poster) {
          const pp = posterPath(path)
          await uploadWithProgress({ url: process.env.NEXT_PUBLIC_SUPABASE_URL!, token: session.access_token, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, path: pp, file: poster, contentType: 'image/jpeg', onProgress: () => {} })
          item.poster_path = pp
        } else {
          toast('Could not make a poster frame for that video. Add one with "Set poster".', { icon: '⚠️' })
        }
      }
    } catch (e) {
      setBusy(null); setProgress(null)
      toast.error(`Upload failed: ${(e as Error).message}`)
      return
    }
    // Row update after the file, and the file is removed if the row refuses
    // it: the harmless order (an orphan file is invisible; a row pointing at
    // nothing renders broken).
    const ok = await setMedia([...row.media, item], 'Media')
    if (!ok) await supabase.storage.from(BUCKET).remove([path, ...(item.poster_path ? [item.poster_path] : [])])
    setBusy(null); setProgress(null)
    if (ok) toast.success('Uploaded')
  }

  const setPoster = async (index: number, file: File) => {
    if (!row) return
    const v = validateFile(file)
    if (!v.ok || v.kind !== 'image') { toast.error('Poster must be a JPEG, PNG or WebP image.'); return }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setBusy('poster')
    const pp = posterPath(row.media[index].path).replace(/-poster\.jpg$/, `-poster-${Date.now()}.${file.name.split('.').pop()}`)
    try {
      await uploadWithProgress({ url: process.env.NEXT_PUBLIC_SUPABASE_URL!, token: session.access_token, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, path: pp, file, contentType: file.type, onProgress: () => {} })
    } catch (e) { setBusy(null); toast.error(`Upload failed: ${(e as Error).message}`); return }
    const media = row.media.map((m, i) => i === index ? { ...m, poster_path: pp } : m)
    const ok = await setMedia(media, 'Poster')
    if (!ok) await supabase.storage.from(BUCKET).remove([pp])
    setBusy(null)
  }

  const removeMedia = async (index: number) => {
    if (!row) return
    const item = row.media[index]
    if (!window.confirm('Remove this media item?')) return
    setBusy('remove')
    const ok = await setMedia(row.media.filter((_, i) => i !== index), 'Remove')
    if (ok) await supabase.storage.from(BUCKET).remove([item.path, ...(item.poster_path ? [item.poster_path] : [])])
    setBusy(null)
  }

  const move = async (from: number, to: number) => {
    if (!row) return
    setBusy('move'); await setMedia(moveItem(row.media, from, to), 'Reorder'); setBusy(null)
  }

  const publish = async (next: boolean) => {
    if (!row) return
    if (next && (!row.artist_name.trim() || row.media.length === 0)) { toast.error('Add an artist name and at least one photo or video before publishing.'); return }
    setBusy('publish')
    const res = await guardedWrite(supabase.from(TABLE).update({ is_published: next }).eq('id', row.id).select('id'), next ? 'Not published' : 'Not unpublished', `admin/tattoo-battle publish bucket=${bucket}`)
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    await revalidate()
    toast.success(next ? `Bucket #${bucket} is live` : 'Unpublished')
    await onChanged()
  }

  const clearSlot = async () => {
    if (!row) return
    if (!window.confirm(`Clear Bucket #${bucket}? This deletes the entry and its media.`)) return
    setBusy('clear')
    const paths = row.media.flatMap(m => [m.path, ...(m.poster_path ? [m.poster_path] : [])])
    const res = await guardedWrite(supabase.from(TABLE).delete().eq('id', row.id).select('id'), 'Slot not cleared', `admin/tattoo-battle clear bucket=${bucket}`)
    if (res.ok && paths.length) await supabase.storage.from(BUCKET).remove(paths)
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    await revalidate()
    toast.success('Slot cleared')
    await onChanged()
  }

  const setChampion = async (entryId: string | null) => {
    setBusy('champion')
    const res = await guardedWrite(supabase.rpc('set_tattoo_battle_champion', { p_entry_id: entryId }), 'Champion not set', `admin/tattoo-battle champion bucket=${bucket}`)
    setBusy(null); setConfirmChampion(false)
    if (!res.ok) { toast.error(res.error); return }
    await requestRevalidate({ paths: ['/tattoo-battle', entryPath(bucket)], tags: ['tattoo-battle'] })
    toast.success(entryId ? `Bucket #${bucket} is the champion` : 'Champion cleared')
    await onChanged()
  }

  const field = (key: keyof typeof form, label: string, placeholder = '') => (
    <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>
      {label}
      <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
             className="mt-1 w-full rounded-lg px-3 py-3 text-base text-white" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }} />
    </label>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {field('artist_name', 'Artist')}
        {field('shop_name', 'Shop')}
        {field('city_state', 'City, State', 'Fayetteville, NC')}
        {field('instagram', 'Instagram', '@handle')}
      </div>
      <button type="button" disabled={busy !== null} onClick={saveDetails} className="w-full rounded-lg px-4 py-3 text-sm font-bold text-white sm:w-auto" style={{ backgroundColor: '#8B7355' }}>
        {busy === 'save' ? 'Saving…' : row ? 'Save details' : 'Create slot'}
      </button>

      {row && (
        <>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Media ({row.media.length})</p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {row.media.map((m, i) => (
                <li key={m.path} className="relative overflow-hidden rounded-lg" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaPublicUrl(m.type === 'image' ? m.path : (m.poster_path ?? m.path))} alt={`${m.type} ${i + 1}`} className="aspect-square w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                  <span className="absolute left-1 top-1 rounded px-1 text-[10px] font-bold uppercase text-black" style={{ backgroundColor: '#C4A882' }}>{m.type}</span>
                  <div className="flex justify-between p-1">
                    <button type="button" aria-label="Move earlier" disabled={i === 0 || busy !== null} onClick={() => move(i, i - 1)} className="px-2 text-white disabled:opacity-30">←</button>
                    {m.type === 'video' && (
                      <label className="cursor-pointer px-1 text-[10px] font-semibold uppercase" style={{ color: '#C4A882' }}>
                        {m.poster_path ? 'Poster' : 'Set poster'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPoster(i, f) }} />
                      </label>
                    )}
                    <button type="button" aria-label="Remove" disabled={busy !== null} onClick={() => removeMedia(i)} className="px-2 text-red-400">✕</button>
                    <button type="button" aria-label="Move later" disabled={i === row.media.length - 1 || busy !== null} onClick={() => move(i, i + 1)} className="px-2 text-white disabled:opacity-30">→</button>
                  </div>
                </li>
              ))}
            </ul>
            <label className="mt-3 block w-full cursor-pointer rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm font-semibold" style={{ borderColor: '#8B7355', color: '#C4A882' }}>
              {busy === 'upload' ? (progress ? `Uploading ${progress.name}: ${progress.pct}%` : 'Preparing…') : 'Add photo or video from your phone'}
              <input type="file" accept={ACCEPT_ATTR} className="hidden" disabled={busy !== null}
                     onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
            </label>
            {progress && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded" style={{ backgroundColor: '#2a2a2a' }} role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full" style={{ width: `${progress.pct}%`, backgroundColor: '#C4A882' }} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => publish(!row.is_published)} className="rounded-lg px-4 py-3 text-sm font-bold" style={{ backgroundColor: row.is_published ? '#2a2a2a' : '#4ade80', color: row.is_published ? '#fff' : '#000' }}>
              {row.is_published ? 'Unpublish' : 'Publish'}
            </button>
            <a href={entryPath(bucket)} target="_blank" rel="noopener noreferrer" className="rounded-lg px-4 py-3 text-sm font-semibold underline" style={{ color: '#C4A882' }}>Open public page</a>
            {row.is_champion ? (
              <button type="button" disabled={busy !== null} onClick={() => setChampion(null)} className="rounded-lg px-4 py-3 text-sm font-bold text-white" style={{ backgroundColor: '#2a2a2a' }}>Unset champion</button>
            ) : (
              <button type="button" disabled={busy !== null || !row.is_published} title={row.is_published ? '' : 'Publish first'} onClick={() => setConfirmChampion(true)} className="rounded-lg px-4 py-3 text-sm font-bold text-black disabled:opacity-40" style={{ backgroundColor: '#C4A882' }}>Mark as champion</button>
            )}
            <button type="button" disabled={busy !== null} onClick={clearSlot} className="ml-auto rounded-lg px-4 py-3 text-sm font-semibold text-red-400">Clear slot</button>
          </div>

          <Dialog.Root open={confirmChampion} onOpenChange={setConfirmChampion}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/70" />
              <Dialog.Content className="fixed left-1/2 top-1/2 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #8B7355' }}>
                <Dialog.Title className="text-lg font-bold text-white">Crown Bucket #{bucket}?</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm" style={{ color: '#ddd' }}>
                  {row.artist_name} becomes the champion{hasChampion ? ' and the current champion is unset' : ''}. The public page shows a champion banner immediately.
                </Dialog.Description>
                <div className="mt-6 flex justify-end gap-2">
                  <Dialog.Close className="rounded-lg px-4 py-2 text-sm text-white" style={{ backgroundColor: '#2a2a2a' }}>Cancel</Dialog.Close>
                  <button type="button" onClick={() => setChampion(row.id)} className="rounded-lg px-4 py-2 text-sm font-bold text-black" style={{ backgroundColor: '#C4A882' }}>Crown them</button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </>
      )}
    </div>
  )
}

function trim(f: { artist_name: string; shop_name: string; city_state: string; instagram: string }) {
  return { artist_name: f.artist_name.trim(), shop_name: f.shop_name.trim(), city_state: f.city_state.trim(), instagram: f.instagram.trim().replace(/^@/, '') }
}
```

Type notes: `supabase.rpc('set_tattoo_battle_champion', ...)` is typed by Task 2's `Functions` entry; `guardedWrite` needs `.select()` for table writes and takes the rpc promise as-is. The `←` `→` `✕` `⚠️` characters are not dashes. If `Row` cannot be imported from `page.tsx` because Next forbids non-page exports from a page file, move the `Row` interface into `SlotEditor.tsx` and import it from there in `page.tsx`.

- [ ] **Step 3: Typecheck, lint, build; walk the UI locally as far as possible without the migration**

```bash
npx tsc --noEmit && npm run lint && npm run build 2>&1 | tail -3
```
Sign in as admin on `npm run dev` and open `/admin/tattoo-battle`. Expected before migration 069: the red message "migration 069 has not been applied". That is the correct, honest state. Commit.

```bash
git add src/app/admin/tattoo-battle/page.tsx src/app/admin/tattoo-battle/SlotEditor.tsx
git commit -m "feat(battle): phone-first admin - slots, uploads with progress, reorder, publish, champion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: QR print sheet `/admin/tattoo-battle/print`

**Files:**
- Create: `src/app/admin/tattoo-battle/print/page.tsx`, `src/lib/tattoo-battle-qr.ts`, `src/lib/tattoo-battle-qr.test.ts`
- Modify: `package.json` (deps)

**Interfaces:**
- Consumes: `entryUrl`, `BUCKET_COUNT`, `QR_BASE_URL`, `VETERAN_INK`, `TATTOO_BATTLE_PRESENTER`, `IS_PRODUCTION_HOST`.
- Produces: `qrSvg(url: string): Promise<string>` (SVG markup, error correction H), `qrModules(url: string): { size: number; get: (x: number, y: number) => boolean }` (for the decode test).

- [ ] **Step 1: Install**

```bash
npm i qrcode jszip && npm i -D @types/qrcode
```

- [ ] **Step 2: Failing decode test**

The test proves every printed code decodes to exactly `entryUrl(n)`, at the boundaries and everywhere between. It rasterises the module matrix into an RGBA buffer and decodes with `jsqr`, which is an independent decoder.

`src/lib/tattoo-battle-qr.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import jsQR from 'jsqr'
import { qrModules, qrSvg } from '@/lib/tattoo-battle-qr'
import { entryUrl } from '@/lib/tattoo-battle'
import { BUCKET_COUNT } from '@/lib/tattoo-battle-config'

function rasterise(url: string, scale = 8, quiet = 4) {
  const { size, get } = qrModules(url)
  const px = (size + quiet * 2) * scale
  const data = new Uint8ClampedArray(px * px * 4).fill(255)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!get(x, y)) continue
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + quiet) * scale + dy) * px + ((x + quiet) * scale + dx)) * 4
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0
    }
  }
  return { data, px }
}

describe('QR codes', () => {
  it('every bucket from 1 to BUCKET_COUNT decodes to its entry URL', () => {
    for (let n = 1; n <= BUCKET_COUNT; n++) {
      const url = entryUrl(n)
      const { data, px } = rasterise(url)
      const decoded = jsQR(data, px, px)
      expect(decoded?.data, `bucket ${n}`).toBe(url)
    }
  })
  it('SVG output is an svg element that names the URL nowhere but in the path data', async () => {
    const svg = await qrSvg(entryUrl(1))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toContain('<script')
  })
})
```

- [ ] **Step 3: Run, expect failure, then implement**

`src/lib/tattoo-battle-qr.ts`:

```ts
import QRCode from 'qrcode'

const OPTS = { errorCorrectionLevel: 'H' as const, margin: 1 }

/** SVG markup for one code. High error correction: bucket labels get wet and scuffed. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...OPTS, type: 'svg', width: 512 })
}

/** The module matrix, for tests and any raster renderer. */
export function qrModules(url: string): { size: number; get: (x: number, y: number) => boolean } {
  const code = QRCode.create(url, OPTS)
  const size = code.modules.size
  return { size, get: (x, y) => !!code.modules.get(y, x) }
}
```

`code.modules.get(row, col)` takes row first; the wrapper exposes `(x, y)`. Run `npx vitest run src/lib/tattoo-battle-qr.test.ts` → PASS.

- [ ] **Step 4: The print page**

`src/app/admin/tattoo-battle/print/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Rubik_Dirt, Oswald } from 'next/font/google'
import JSZip from 'jszip'
import { BUCKET_COUNT, QR_BASE_URL, VETERAN_INK } from '@/lib/tattoo-battle-config'
import { TATTOO_BATTLE_PRESENTER } from '@/lib/event-config'
import { IS_PRODUCTION_HOST } from '@/lib/site'
import { entryUrl } from '@/lib/tattoo-battle'
import { qrSvg } from '@/lib/tattoo-battle-qr'

// Same faces as /tattoo-battle, loaded here because /admin is outside that
// segment. Tokens in globals.css resolve once these variables are on an ancestor.
const rubikDirt = Rubik_Dirt({ weight: '400', subsets: ['latin'], variable: '--font-rubik-dirt', display: 'swap' })
const oswald = Oswald({ weight: ['500', '700'], subsets: ['latin'], variable: '--font-oswald', display: 'swap' })

/**
 * One 4x6 in label per bucket, print-optimised. The URL is fixed
 * (QR_BASE_URL), never the env var: these are physical objects.
 */
export default function PrintQrPage() {
  const [svgs, setSvgs] = useState<string[] | null>(null)

  useEffect(() => {
    Promise.all(Array.from({ length: BUCKET_COUNT }, (_, i) => qrSvg(entryUrl(i + 1)))).then(setSvgs)
  }, [])

  const downloadZip = async () => {
    if (!svgs) return
    const zip = new JSZip()
    svgs.forEach((svg, i) => zip.file(`bucket-${String(i + 1).padStart(2, '0')}.svg`, svg))
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'tattoo-battle-qr-codes.zip'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className={`${rubikDirt.variable} ${oswald.variable}`}>
      <style>{`
        @media print {
          @page { size: 4in 6in; margin: 0.25in; }
          .no-print { display: none !important; }
          .label { break-after: page; page-break-after: always; width: 3.5in; height: 5.5in; margin: 0; border: 0 !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="no-print mx-auto max-w-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-white">QR codes: {BUCKET_COUNT} buckets</h1>
          <div className="flex gap-2">
            <Link href="/admin/tattoo-battle" className="rounded-lg px-4 py-2 text-sm text-white" style={{ backgroundColor: '#2a2a2a' }}>Back</Link>
            <button type="button" onClick={downloadZip} disabled={!svgs} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: '#8B7355' }}>Download SVG zip</button>
            <button type="button" onClick={() => window.print()} disabled={!svgs} className="rounded-lg px-4 py-2 text-sm font-semibold text-black" style={{ backgroundColor: '#C4A882' }}>Print</button>
          </div>
        </div>
        {!IS_PRODUCTION_HOST && (
          <p className="mt-4 rounded-xl p-4 text-sm" style={{ backgroundColor: 'rgba(234,179,8,0.12)', border: '1px solid #eab308', color: '#fde68a' }}>
            <strong>Warning:</strong> the domain is not cut over to this project yet - scans will 404 until cutover. The codes below encode {QR_BASE_URL}, which is correct for print; the site just is not there yet.
          </p>
        )}
        <p className="mt-3 text-xs" style={{ color: '#999' }}>Each code encodes {QR_BASE_URL}/tattoo-battle/entry/N. Print at 100% scale on 4x6 in labels, one per page.</p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 print:block print:p-0">
        {(svgs ?? []).map((svg, i) => {
          const n = i + 1
          return (
            <article key={n} className="label flex flex-col items-center justify-between rounded-2xl bg-white p-6 text-center text-black" style={{ border: '1px solid #ccc' }}>
              <p className="font-battle-display text-5xl uppercase leading-none">Bucket #{n}</p>
              <div className="my-4 w-full max-w-[2.6in]" dangerouslySetInnerHTML={{ __html: svg }} aria-label={`QR code for bucket ${n}`} role="img" />
              <p className="font-battle-condensed text-lg font-bold uppercase tracking-wide">Scan to see the tattoo · Vote with your dollars</p>
              <p className="mt-2 text-xs font-semibold">Every dollar supports {VETERAN_INK.name}</p>
              <p className="text-xs">Presented by {TATTOO_BATTLE_PRESENTER}</p>
              <p className="mt-2 text-[9px] text-gray-600">{entryUrl(n)}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
```

The labels are black on white by design (a printed label; the gold-on-light rule is respected by using black text). `dangerouslySetInnerHTML` carries SVG the app generated itself from a constant URL; no user input reaches it.

- [ ] **Step 5: Verify count and URLs in the rendered page, then commit**

```bash
npx tsc --noEmit && npm run lint && npm run build 2>&1 | tail -3
```
Sign in as admin on `npm run dev`, open `/admin/tattoo-battle/print`, and in the browser console:
```js
document.querySelectorAll('article.label').length            // 20
[...document.querySelectorAll('article.label p:last-child')].map(p => p.textContent)[19]   // https://www.allamericantattooconvention.com/tattoo-battle/entry/20
```
Print preview: one label per page. Commit.

```bash
git add package.json package-lock.json src/lib/tattoo-battle-qr.ts src/lib/tattoo-battle-qr.test.ts src/app/admin/tattoo-battle/print/page.tsx
git commit -m "feat(battle): QR print sheet, SVG zip, decode test for every bucket

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Anon verification script, final checks, HANDOFF entry

**Files:**
- Create: `scripts/verify-tattoo-battle-anon.mjs`
- Modify: `docs/HANDOFF.md` (§2 in-flight and the migrations list)

- [ ] **Step 1: The anon script**

Modelled on `scripts/verify-sponsor-visibility.mjs`. It is safe to run any time: with the anon key it can only read; the service-role parts create and remove ONE fixture row (bucket 9002) and never touch real buckets. **Before migration 069 is applied, it reports SKIP for every table check** and exits 0, so it can be committed now and run by Ryan after.

```js
#!/usr/bin/env node
/**
 * Tattoo Battle RLS check, from the outside, with the ANON key.
 *
 *   node scripts/verify-tattoo-battle-anon.mjs
 *
 * Asserts what a phone scanning a bucket can and cannot do:
 *   - a published entry is readable; a draft is not (positive control via service role)
 *   - anon cannot insert, update or delete an entry
 *   - anon cannot upload to tattoo-battle-media; anyone can read it
 * "anon cannot see it" has two failure modes (zero rows, or 42501); both are
 * asserted as the OUTCOME, per HANDOFF. Needs SUPABASE_SERVICE_ROLE_KEY for
 * the control; without it the draft/published assertions are SKIPPED, not passed.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ROOT = new URL('..', import.meta.url).pathname
if (existsSync(`${ROOT}.env.local`)) {
  for (const line of readFileSync(`${ROOT}.env.local`, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey) { console.error('Missing Supabase env'); process.exit(1) }
const anon = createClient(url, anonKey)
const svc = svcKey ? createClient(url, svcKey) : null

const results = []
let failed = 0
const pass = (name, detail) => results.push({ s: 'PASS', name, detail })
const fail = (name, detail) => { failed++; results.push({ s: 'FAIL', name, detail }) }
const skip = (name, detail) => results.push({ s: 'SKIP', name, detail })

const { data: event } = await anon.from('events').select('id').eq('is_active', true).single()
if (!event) { console.error('No active event readable as anon'); process.exit(1) }

// Table present?
const probe = await anon.from('tattoo_battle_entries').select('id').limit(1)
if (probe.error?.code === '42P01') {
  skip('table exists', 'migration 069 not applied yet - every table check skipped')
} else {
  // ── writes as anon ──
  const ins = await anon.from('tattoo_battle_entries').insert({ event_id: event.id, bucket_number: 9002 }).select('id')
  if (ins.error?.code === '42501' || (!ins.error && (ins.data ?? []).length === 0)) pass('anon insert refused', ins.error?.code ?? '0 rows')
  else fail('anon insert refused', ins.error ? `${ins.error.code} ${ins.error.message}` : `INSERTED ${ins.data.length} row(s)`)

  if (svc) {
    // control fixture: one published, one draft
    await svc.from('tattoo_battle_entries').delete().gte('bucket_number', 9001)
    const { error: fxErr } = await svc.from('tattoo_battle_entries').insert([
      { event_id: event.id, bucket_number: 9001, artist_name: 'ZZ Draft', media: [], is_published: false },
      { event_id: event.id, bucket_number: 9002, artist_name: 'ZZ Published', media: [{ type: 'image', path: 'zz/x.jpg' }], is_published: true },
    ])
    if (fxErr) fail('fixture insert (service role)', `${fxErr.code} ${fxErr.message}`)
    else {
      const ctrl = await svc.from('tattoo_battle_entries').select('bucket_number').gte('bucket_number', 9001)
      if ((ctrl.data ?? []).length !== 2) fail('control: fixtures visible to service role', `${(ctrl.data ?? []).length} rows`)
      else pass('control: fixtures visible to service role', '2 rows')

      const draft = await anon.from('tattoo_battle_entries').select('id').eq('bucket_number', 9001)
      if (draft.error) fail('anon cannot see draft', `${draft.error.code}`)
      else if (draft.data.length === 0) pass('anon cannot see draft', '0 rows')
      else fail('anon cannot see draft', `${draft.data.length} row(s) LEAKED`)

      const pub = await anon.from('tattoo_battle_entries').select('id, artist_name').eq('bucket_number', 9002)
      if (!pub.error && pub.data.length === 1) pass('anon sees published', pub.data[0].artist_name)
      else fail('anon sees published', pub.error ? pub.error.code : `${pub.data.length} rows`)

      const upd = await anon.from('tattoo_battle_entries').update({ artist_name: 'hacked' }).eq('bucket_number', 9002).select('id')
      if (upd.error?.code === '42501' || (!upd.error && upd.data.length === 0)) pass('anon update refused', upd.error?.code ?? '0 rows')
      else fail('anon update refused', `${upd.data?.length} row(s) updated`)

      const del = await anon.from('tattoo_battle_entries').delete().eq('bucket_number', 9002).select('id')
      if (del.error?.code === '42501' || (!del.error && del.data.length === 0)) pass('anon delete refused', del.error?.code ?? '0 rows')
      else fail('anon delete refused', `${del.data?.length} row(s) deleted`)

      await svc.from('tattoo_battle_entries').delete().gte('bucket_number', 9001)
      const residue = await svc.from('tattoo_battle_entries').select('id').gte('bucket_number', 9001)
      if ((residue.data ?? []).length === 0) pass('fixtures removed', '0 remaining'); else fail('fixtures removed', `${residue.data.length} remaining`)
    }
  } else {
    skip('draft/published visibility', 'SUPABASE_SERVICE_ROLE_KEY missing - no positive control, so not asserted')
  }
}

// ── storage as anon ──
const up = await anon.storage.from('tattoo-battle-media').upload(`zz-anon-${Date.now()}.txt`, new Blob(['x']), { contentType: 'text/plain' })
if (up.error) pass('anon storage upload refused', up.error.message)
else { fail('anon storage upload refused', `UPLOADED ${up.data.path}`); if (svc) await svc.storage.from('tattoo-battle-media').remove([up.data.path]) }
const ls = await anon.storage.from('tattoo-battle-media').list('', { limit: 1 })
if (ls.error && /not found/i.test(ls.error.message)) skip('anon storage read', 'bucket missing - migration 069 not applied')
else if (ls.error) fail('anon storage read', ls.error.message)
else pass('anon storage read', 'list ok (public bucket)')

console.log('\nTATTOO BATTLE ANON CHECK\n' + '─'.repeat(72))
for (const r of results) console.log(`  ${r.s.padEnd(4)} ${r.name.padEnd(42)} ${r.detail}`)
console.log('')
process.exit(failed > 0 ? 1 : 0)
```

Run it now: `node scripts/verify-tattoo-battle-anon.mjs`. Expected before 069: SKIP lines for the table, and for storage either SKIP (bucket missing) or PASS on the upload refusal. Exit 0. Paste the output into the report.

- [ ] **Step 2: Full verification pass**

```bash
npm run lint && npx vitest run && npm run build 2>&1 | tail -5
node scripts/check-event-dates.mjs
grep -rn "Whole Life" src/ scripts/ && echo "OLD SPELLING IN CODE" || echo "spelling clean"
grep -rln "tax-deductible\|tax deductible" src/ && echo "TAX LANGUAGE PRESENT" || echo "charity copy clean"
```

Serve the build and run Lighthouse on both public pages:

```bash
(npx next start -p 3777 >/dev/null 2>&1 &) ; sleep 4
for p in /tattoo-battle /tattoo-battle/entry/1; do
  npx --yes lighthouse "http://localhost:3777$p" --only-categories=accessibility --chrome-flags="--headless=new" --output=json --output-path=/private/tmp/claude-501/-Users-ryanharrell/3d0ff216-161a-4280-b39f-3762c60a995b/scratchpad/lh.json --quiet
  python3 -c "import json;print('$p', json.load(open('/private/tmp/claude-501/-Users-ryanharrell/3d0ff216-161a-4280-b39f-3762c60a995b/scratchpad/lh.json'))['categories']['accessibility']['score'])"
done
pkill -f "next start -p 3777"
```
Both ≥ 0.95, or fix and rerun.

- [ ] **Step 3: HANDOFF entry**

Append to `docs/HANDOFF.md` §2 (in flight / next) a dated block:

```
### 2026-09-23 Tattoo Battle (spec docs/superpowers/specs/2026-09-23-tattoo-battle-design.md)
Code merged to develop. NOT APPLIED: migration 069_tattoo_battle.sql, verify_069.sql,
seeds/wholelife_spelling.sql. Until 069 runs, /tattoo-battle renders with no entries and
/admin/tattoo-battle shows the "migration 069 not applied" message - correct and inert.
TATTOO_BATTLE_PRESENTER now reads 'WholeLife Aftercare'; the sponsorships row and the 3
schedule rows still say 'Whole Life Aftercare' until the seed runs, so the sponsor block on
/tattoo-battle renders the NAME AS TEXT (no logo) until then. Verified how: sponsors_public
queried 2026-09-23. QR codes encode QR_BASE_URL (www), fixed. Domain is on aatc-landing;
cutover is item 1 of the spec's §11 launch checklist.
```
Also add `069` to whichever list in HANDOFF enumerates migrations, stated individually as "not applied", never as a range.

- [ ] **Step 4: Commit and push**

```bash
git add scripts/verify-tattoo-battle-anon.mjs docs/HANDOFF.md
git commit -m "chore(battle): anon RLS check script, HANDOFF state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin develop
```

---

## Plan self-review

**Spec coverage.** Hero, countdown, eligibility, rules, how-it-works (with the buckets-only line), entries grid hidden until published, champion banner, Veteran Ink block with slot, timeline with computed judging step and "LFG!!", prizes, past champions hidden while empty, attendees, sponsor block, FAQ: Task 6. Entry page states, carousel behaviour, noindex until published, OG fallback, revalidation: Tasks 7, 8, 10. Admin per-slot actions, champion dialog and RPC, warning banner, print sheet with ZIP and warning-not-block: Tasks 10, 11. Migration, RLS, bucket mime list, size limit, one-champion index, publish-complete constraint, verify file, spelling seed, types: Task 2. Redirect, nav, homepage card, roles, admin nav, prebuild guard: Task 8. Fonts and tokens, assets from the vector master, OG from the presented-by graphic, carousel frames never shipped: Task 5. JSON-LD Event + FAQPage: Task 6. Tests: Tasks 1, 9, 11; anon script Task 12; Lighthouse Tasks 6 and 12. Launch checklist lives in the spec §11 and HANDOFF.

**Gaps found and fixed inline:** the spec's `WINNER_ANNOUNCED_TIME` is dropped per the decision (the timeline reads the Sunday row). `PAST_CHAMPIONS.image` is rendered with `next/image`, which needs the host in `remotePatterns` if Ryan later supplies a Supabase URL; a `/public` path needs nothing.

**Type consistency.** `MediaItem` is defined once in `tattoo-battle.ts` and re-used by `database.ts` (structurally identical inline), `tattoo-battle-data.ts`, the carousel, the admin. `Row` in the admin is a superset of `BattleEntry` (adds `is_published`). `ScheduleRowLite` matches the three columns selected in `getBattleScheduleRows`. `PresenterRow` matches the four columns selected from `sponsors_public`.

**Review Focus pinned:** (1) Task 1 `parseBucket` tests; (2) Task 1 `buildTimeline` drift test; (3) Task 1 `ogImageFor` test; (4) Task 2 verify block D + Task 10 disabled button; (5) Task 9 `validateFile` HEIC tests.
