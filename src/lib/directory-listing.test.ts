import { describe, it, expect } from 'vitest'
import { directoryListing } from '@/lib/directory-listing'

const app = (o: Partial<{ status: string; needs_roster: boolean; directory_override: boolean }> = {}) =>
  ({ status: 'approved', needs_roster: false, directory_override: false, ...o })

describe('directoryListing', () => {
  it('the override lists an approved, roster-complete exhibitor before any deposit (Chop Shop)', () => {
    expect(directoryListing(app({ directory_override: true }), false)).toEqual({ listed: true, reason: 'Listed before deposit (override on).' })
  })
  it('without it, a deposit is needed', () => {
    expect(directoryListing(app(), false).listed).toBe(false)
    expect(directoryListing(app(), true).listed).toBe(true)
  })
  it('the override never skips approval or the roster', () => {
    expect(directoryListing(app({ directory_override: true, status: 'pending' }), true).listed).toBe(false)
    expect(directoryListing(app({ directory_override: true, needs_roster: true }), true).listed).toBe(false)
  })
  it('a comped booth is listed with no deposit and no override (089)', () => {
    expect(directoryListing({ ...app(), comped_at: '2026-10-03' }, false)).toEqual({ listed: true, reason: 'Listed: booth comped.' })
    expect(directoryListing({ ...app({ needs_roster: true }), comped_at: '2026-10-03' }, false).listed).toBe(false)
  })
})
