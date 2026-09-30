/**
 * Booth holds (migration 087). A hold is ACTIVE while held_for is set and
 * held_until is in the future; the database applies the same rule in
 * assign_booths(), so an expired hold stops counting everywhere at once.
 */
export interface HoldFields {
  held_for: string | null
  held_until: string | null
  held_for_application_id: string | null
  held_for_sponsorship_id: string | null
}

export function activeHold<T extends HoldFields>(b: T, now: Date = new Date()): boolean {
  return !!b.held_for && !!b.held_until && new Date(b.held_until).getTime() > now.getTime()
}

/** "Oct 7, 2026, 11:59 PM" in Eastern time: the show's clock. */
export function holdUntilLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/** Default end for a new hold: 7 days from now at 23:59 local, as a datetime-local value. */
export function defaultHoldUntilInput(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`
}

/** An ISO time as a datetime-local value in the admin's local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
