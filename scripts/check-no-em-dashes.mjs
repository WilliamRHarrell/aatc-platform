#!/usr/bin/env node
/**
 * Build guard: no em or en dashes in application source.
 *
 * The site's copy uses hyphens. A dash arrives one of two ways and neither is
 * deliberate: pasted from a word processor, or emitted by a model. Both look
 * fine in the editor and both survive review, so the guard is the only thing
 * that actually catches them.
 *
 * Checks all four encodings, because a literal grep for the character misses
 * three of them — src/app/events/tattoo-contests held eight — escapes that
 * rendered as em dashes on the page while reading as ASCII in the file.
 *
 * Scope is src/ only. docs/ is prose written for people, and pasting a spec
 * that happens to contain a dash should not fail a build.
 *
 * Runs as prebuild. Fails on a match.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.mdx']

const FORMS = [
  { re: /[—]/, name: 'em dash (literal)' },
  { re: /[–]/, name: 'en dash (literal)' },
  { re: /&mdash;/i, name: '&mdash;' },
  { re: /&ndash;/i, name: '&ndash;' },
  { re: /&#8212;/, name: '&#8212;' },
  { re: /&#8211;/, name: '&#8211;' },
  // The escaped forms. These read as plain ASCII in the file and render as a
  // dash in the browser, which is exactly why they outlive a manual sweep.
  { re: /\\u2014/, name: '\\u2014' },
  { re: /\\u2013/, name: '\\u2013' },
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (EXTENSIONS.some(e => path.endsWith(e))) out.push(path)
  }
  return out
}

let failures = 0

for (const file of walk(ROOT)) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const { re, name } of FORMS) {
      if (re.test(line)) {
        console.error(`[check-no-em-dashes] ${file}:${i + 1}  ${name}`)
        console.error(`  ${line.trim().slice(0, 100)}`)
        failures++
        break
      }
    }
  })
}

// ---------------------------------------------------------------------------
// The inverse check: literals that MUST KEEP their dash.
//
// Pointed the opposite way to everything above, and it has to be. The failure
// this exists for was a dash being REMOVED: a repo-wide sweep rewrote the
// harness LIKE patterns in supabase/seeds/ from an em dash to a hyphen while
// the rows in the database still stored an em dash, taking every teardown from
// two matches to zero. Both teardown scripts then aborted their preflight and
// the harness became unremovable, all while reporting success.
//
// A guard that fails on dashes PRESENT cannot catch that - after the sweep
// there is no dash left to find, so it passes. Only asserting the dash is
// still there catches it.
//
// supabase/migrations/ is not covered and must not be: those are applied, and
// editing one cannot change what is already in the database. supabase/seeds/
// is swept by hand for the same reason - see docs/HANDOFF.md.
// ---------------------------------------------------------------------------

const HARNESS_NAME = 'ZZ TEST \u2014 RLS Harness'
const HARNESS_FILES = [
  'supabase/seeds/rls_harness_records.sql',
  'supabase/seeds/teardown_test_applications.sql',
  'supabase/seeds/teardown_test_event_content.sql',
]

for (const file of HARNESS_FILES) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue // file removed at cutover; nothing to protect
  }
  if (!text.includes(HARNESS_NAME)) {
    console.error(`[check-no-em-dashes] ${file}`)
    console.error(`  expected the literal "${HARNESS_NAME}" (em dash) and did not find it.`)
    failures++
  }
  if (text.includes('ZZ TEST - RLS Harness')) {
    console.error(`[check-no-em-dashes] ${file}`)
    console.error('  contains the HYPHEN form "ZZ TEST - RLS Harness". The database rows')
    console.error('  store an em dash, so this pattern matches zero rows and the teardown')
    console.error('  scripts will abort. Restore the em dash.')
    failures++
  }
}

if (failures > 0) {
  console.error(
    `\n[check-no-em-dashes] FAIL - ${failures} problem(s).\n\n` +
    `Replace with a hyphen, minding which of the three cases applies:\n` +
    `  spaced    'word - word'    keep the spaces\n` +
    `  unspaced  'word-word'      ADD spaces: 'word - word'. Collapsing it\n` +
    `                             turns a dash into a compound word and\n` +
    `                             changes the meaning.\n` +
    `  numeric   'April 16-18'    no spaces, for ranges\n`
  )
  process.exit(1)
}

console.log('[check-no-em-dashes] OK - src/ is dash free, harness literals intact.')
