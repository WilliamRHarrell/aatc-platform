/**
 * Display a DATE column (no time, e.g. invoices.due_date '2027-01-01').
 *
 * `new Date('2027-01-01')` is UTC midnight, and toLocaleDateString() in any US
 * time zone renders that as 12/31/2026 - the portal showed every due date one
 * day early. A date-only value is formatted in UTC so it is the same calendar
 * date everywhere. Anything that is not YYYY-MM-DD is returned unchanged.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function formatDateOnly(value: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!DATE_ONLY.test(value)) return value
  const [y, m, d] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** Today's calendar date in Eastern time, as YYYY-MM-DD (the show's time zone). */
export function todayEastern(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const utc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}
