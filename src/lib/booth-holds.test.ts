import { describe, it, expect } from 'vitest'
import { activeHold, holdUntilLabel, defaultHoldUntilInput } from '@/lib/booth-holds'

const base = { held_for_application_id: null, held_for_sponsorship_id: null }
const now = new Date('2026-10-01T12:00:00Z')

describe('booth holds', () => {
  it('a hold counts only while held_until is in the future', () => {
    expect(activeHold({ ...base, held_for: 'X', held_until: '2026-10-02T00:00:00Z' }, now)).toBe(true)
    expect(activeHold({ ...base, held_for: 'X', held_until: '2026-10-01T12:00:00Z' }, now)).toBe(false)
    expect(activeHold({ ...base, held_for: 'X', held_until: '2026-09-30T00:00:00Z' }, now)).toBe(false)
    expect(activeHold({ ...base, held_for: null, held_until: null }, now)).toBe(false)
  })
  it('labels the end in Eastern time', () => {
    expect(holdUntilLabel('2026-10-08T03:59:00Z')).toBe('Oct 7, 2026, 11:59 PM')
  })
  it('defaults a new hold to 7 days out at 23:59', () => {
    expect(defaultHoldUntilInput(new Date(2026, 9, 1, 9, 30))).toBe('2026-10-08T23:59')
  })
})
