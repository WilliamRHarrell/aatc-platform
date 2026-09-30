import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * One home per fact: the exhibitor page's "Event" card reads the show name,
 * year, dates and venue from event-config. It had them typed in by hand.
 */
describe('/directory/[id] event card', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/directory/[id]/page.tsx'), 'utf8')
  it('types no dates, year or venue by hand', () => {
    expect(src).not.toMatch(/\b20\d\d\b/)
    expect(src).not.toMatch(/April|Crown Complex|Fayetteville/)
  })
  it('renders them from event-config', () => {
    expect(src).toContain('{EVENT_DATES_LABEL} · {VENUE_NAME} · {VENUE_CITY}, {VENUE_STATE}')
    expect(src).toContain('{EVENT_NAME} {EVENT_YEAR}')
  })
})
