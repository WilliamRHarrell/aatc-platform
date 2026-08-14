/**
 * Date/time formatting for schedule items and panels.
 *
 * These live in one place because the UTC trap below was independently
 * re-introducible in four files, and because the free-text alternative already
 * shipped one live bug: /events/tattoo-panels rendered the literal string
 * "Invalid Date" as its day heading for every seeded panel.
 *
 * Since migration 046 both `schedule_items` and `panels` store real `date` and
 * `time` columns, so formatting is a pure display concern and no page needs to
 * parse a human-readable string back into a date.
 */

/**
 * 'YYYY-MM-DD' → 'Friday, April 16'.
 *
 * Rebuilt from parts on purpose. `new Date('2027-04-16')` is parsed as UTC
 * midnight and renders as the PREVIOUS DAY anywhere west of Greenwich — a
 * schedule showing Thursday for Friday's programme, which nobody reports
 * because it looks deliberate.
 */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

/** 'HH:MM:SS' (or 'HH:MM') → '1:30 PM'. */
export function timeLabel(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

/** 'HH:MM:SS' → minutes since midnight, for sorting a merged day. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
