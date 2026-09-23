#!/usr/bin/env node
/**
 * Build-time assertion: src/lib/event-config.ts must agree with the active
 * `events` row in Supabase.
 *
 * The show dates necessarily live in two places - event-config drives the
 * public countdown and copy, the events row drives booth/application logic. A
 * comment asking people to keep them in sync does not survive a date change;
 * this does. Runs as `prebuild`, so a disagreement fails the deploy.
 *
 * Fails ONLY on genuine disagreement. Missing env vars or an unreachable
 * database warn and pass, so a network blip never blocks a deploy.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ROOT = new URL('..', import.meta.url).pathname

// Load .env.local for local runs; on Vercel the vars are already in the env.
if (existsSync(`${ROOT}.env.local`)) {
  for (const line of readFileSync(`${ROOT}.env.local`, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('[check-event-dates] Supabase env vars missing - skipping date check.')
  process.exit(0)
}

/** Calendar date in America/New_York for an absolute instant. */
function etDate(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

// Parse the constants straight out of the source so this cannot drift from it.
const src = readFileSync(`${ROOT}src/lib/event-config.ts`, 'utf8')
const grab = name => {
  const m = src.match(new RegExp(`export const ${name} = '([^']+)'`))
  if (!m) {
    console.error(`[check-event-dates] Could not find ${name} in src/lib/event-config.ts`)
    process.exit(1)
  }
  return m[1]
}

const configStart = etDate(grab('DOORS_OPEN_ISO'))
const configEnd = etDate(grab('SHOW_CLOSE_ISO'))

const supabase = createClient(url, key)
const { data, error } = await supabase
  .from('events')
  .select('name, start_date, end_date')
  .eq('is_active', true)
  .single()

if (error || !data) {
  console.warn(`[check-event-dates] Could not read active event (${error?.message ?? 'no row'}) - skipping.`)
  process.exit(0)
}

const problems = []
if (data.start_date !== configStart) {
  problems.push(`  start: events.start_date=${data.start_date}  vs  DOORS_OPEN_ISO=${configStart}`)
}
if (data.end_date !== configEnd) {
  problems.push(`  end:   events.end_date=${data.end_date}  vs  SHOW_CLOSE_ISO=${configEnd}`)
}

if (problems.length > 0) {
  console.error(
    `\n[check-event-dates] FAIL - src/lib/event-config.ts disagrees with the active\n` +
    `events row ("${data.name}"):\n\n${problems.join('\n')}\n\n` +
    `Fix whichever is wrong: update the constants in src/lib/event-config.ts, or\n` +
    `correct the events row in Supabase. The countdown and the booth/application\n` +
    `flow will behave inconsistently until they match.\n`
  )
  process.exit(1)
}

console.log(`[check-event-dates] OK - ${configStart} to ${configEnd} matches the active event row.`)

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
