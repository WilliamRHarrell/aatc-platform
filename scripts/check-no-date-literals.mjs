#!/usr/bin/env node
/**
 * Build guard: no hardcoded calendar dates in outbound email templates or
 * payment-facing UI.
 *
 * Five places restated "January 1, 2027" as literal text while FINAL_DUE_AT was
 * the value the lifecycle sweep actually enforced. An email telling an exhibitor
 * their balance is due must FORMAT the field, never repeat it — otherwise
 * changing the deadline silently leaves the emails wrong, and the person who
 * changes it has no way to know.
 *
 * Runs as prebuild. Fails on a match.
 */
import { readFileSync, existsSync } from 'node:fs'

const FILES = [
  'src/app/api/send-email/route.ts',
  'src/app/portal/pay/page.tsx',
  'src/app/portal/page.tsx',
  'src/app/api/panel-register/route.ts',
]

// "January 1, 2027" / "Jan 1 2027" / "2027-01-01" — but not a $-amount or a
// bare year, and not inside a // or * comment line.
const PATTERNS = [
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}\b/,
  /\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+20\d{2}\b/,
  /\b20\d{2}-\d{2}-\d{2}\b/,
]

let failures = 0

for (const file of FILES) {
  if (!existsSync(file)) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
    // Stripe apiVersion is a version string, not a calendar date.
    if (/apiVersion/.test(line)) return
    for (const re of PATTERNS) {
      if (re.test(line)) {
        console.error(`[check-no-date-literals] ${file}:${i + 1}`)
        console.error(`  ${trimmed}`)
        failures++
        break
      }
    }
  })
}

if (failures > 0) {
  console.error(
    `\n[check-no-date-literals] FAIL — ${failures} hardcoded date(s) in email/payment templates.\n` +
    `Import a derived label from src/lib/event-config.ts (e.g. FINAL_DUE_LABEL) instead of\n` +
    `writing the date out. A restated date silently drifts from the value that is enforced.\n`
  )
  process.exit(1)
}

console.log('[check-no-date-literals] OK — no date literals in email/payment templates.')
