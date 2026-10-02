import { getMaxArtists } from '@/lib/pricing'

/**
 * Artist roster rules shared by the portal and admin (migration 088).
 *
 * Capacity is the county rule, 2 artists per single (10x10) booth and 4 per
 * double, from getMaxArtists. 2026 rows priced by booth_size count 2 per
 * 10x10 slot (a triple is three slots, so 6).
 */
const SLOTS: Record<'single' | 'double' | 'triple' | 'quad', number> = { single: 1, double: 2, triple: 3, quad: 4 }

export function artistCapacity(app: {
  booth_size: 'single' | 'double' | 'triple' | 'quad' | null
  artist_single_qty: number
  artist_double_qty: number
}): number {
  if (app.booth_size) return SLOTS[app.booth_size] * getMaxArtists({ artistSingleQty: 1, artistDoubleQty: 0 })
  return getMaxArtists({ artistSingleQty: app.artist_single_qty, artistDoubleQty: app.artist_double_qty })
}

/** Verified by AATC (set_artist_id_verified, admin only). The database locks name and ID once set. */
export function isIdVerified(a: object): boolean {
  const v = (a as { id_verified_at?: unknown }).id_verified_at
  return typeof v === 'string' && v.length > 0
}
