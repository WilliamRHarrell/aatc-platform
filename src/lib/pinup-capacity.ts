/**
 * Pinup contest capacity - the client side of ONE home.
 *
 * The number lives in events.pinup_capacity (migration 074). The database
 * function reads it; the route, the admin pages and the public page take it
 * from a query and pass it here. Nothing in src/ writes the number itself
 * (pinup-capacity.test.ts reads the tree to make sure). `null` means the
 * column could not be read (074 not applied): copy degrades to "limited".
 */
export function parseCapacity(input: string): { ok: true; value: number } | { ok: false; error: string } {
  const s = input.trim()
  if (!/^\d+$/.test(s)) return { ok: false, error: 'Enter a whole number of places.' }
  const value = Number(s)
  if (value < 1) return { ok: false, error: 'Capacity must be at least 1.' }
  return { ok: true, value }
}

/** Never negative: a cap lowered below the current entries shows 0 remaining. */
export function spotsRemaining(capacity: number, taken: number): number {
  return Math.max(0, capacity - taken)
}

export const LOWER_CAPACITY_NOTE =
  'Lowering the capacity below the current confirmed entries does not remove anyone. Existing entries keep their status; only new entries go to the waitlist.'

export function capacityCopy(capacity: number | null): { intro: string; waitlist: string; email: string } {
  if (capacity == null) {
    return {
      intro: 'Places are limited and online registration comes first. If places remain, additional entries are taken at the contest table on the day.',
      waitlist: 'All places are currently taken. We\'ll contact you if one opens up.',
      email: 'All places were taken when your entry arrived.',
    }
  }
  return {
    intro: `Places are limited to ${capacity} contestants and online registration comes first. If fewer than ${capacity} register in advance, additional entries are taken at the contest table on the day.`,
    waitlist: `All ${capacity} places are currently taken. We\'ll contact you if one opens up.`,
    email: `All ${capacity} places were taken when your entry arrived.`,
  }
}
