import { describe, it, expect } from 'vitest'
import { artistCapacity, isIdVerified } from '@/lib/artist-roster'

describe('artist capacity (2 per single, 4 per double)', () => {
  it('2027 rows by quantity', () => {
    expect(artistCapacity({ booth_size: null, artist_single_qty: 1, artist_double_qty: 0 })).toBe(2)
    expect(artistCapacity({ booth_size: null, artist_single_qty: 0, artist_double_qty: 2 })).toBe(8) // Chop Shop
    expect(artistCapacity({ booth_size: null, artist_single_qty: 2, artist_double_qty: 1 })).toBe(8)
  })
  it('2026 rows by booth size: 2 per 10x10 slot', () => {
    expect(artistCapacity({ booth_size: 'single', artist_single_qty: 0, artist_double_qty: 0 })).toBe(2)
    expect(artistCapacity({ booth_size: 'double', artist_single_qty: 0, artist_double_qty: 0 })).toBe(4)
    expect(artistCapacity({ booth_size: 'quad', artist_single_qty: 0, artist_double_qty: 0 })).toBe(8)
  })
  it('verified only with a timestamp', () => {
    expect(isIdVerified({ id_verified_at: '2026-10-02T00:00:00Z' })).toBe(true)
    expect(isIdVerified({})).toBe(false)
    expect(isIdVerified({ id_verified_at: null })).toBe(false)
  })
})
