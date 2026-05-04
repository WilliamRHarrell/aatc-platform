import type { Database } from '@/types/database'

type App = Database['public']['Tables']['applications']['Row']

export function describeBooths(
  app: Pick<
    App,
    'booth_size' | 'artist_single_qty' | 'artist_double_qty' | 'vendor_single_qty' | 'vendor_double_qty' | 'corner_count'
  >
): string {
  // 2026 rows have booth_size set; describe via that.
  if (app.booth_size) return app.booth_size

  // 2027 rows: list quantities.
  const parts: string[] = []
  if (app.artist_single_qty > 0) parts.push(`${app.artist_single_qty}× Artist Single`)
  if (app.artist_double_qty > 0) parts.push(`${app.artist_double_qty}× Artist Double`)
  if (app.vendor_single_qty > 0) parts.push(`${app.vendor_single_qty}× Vendor Single`)
  if (app.vendor_double_qty > 0) parts.push(`${app.vendor_double_qty}× Vendor Double`)
  if (app.corner_count > 0) parts.push(`${app.corner_count} corner`)
  return parts.length > 0 ? parts.join(', ') : '—'
}

export function totalBoothCount(
  app: Pick<App, 'artist_single_qty' | 'artist_double_qty' | 'vendor_single_qty' | 'vendor_double_qty'>
): number {
  return app.artist_single_qty + app.artist_double_qty + app.vendor_single_qty + app.vendor_double_qty
}

// Number of physical booth-number slots an application occupies. A "double"
// takes two adjacent slot numbers; a "triple" takes three; a "quad" takes four.
// 2026 rows: derived from booth_size. 2027 rows: derived from per-size qty.
const SIZE_TO_SLOTS: Record<NonNullable<App['booth_size']>, number> = {
  single: 1,
  double: 2,
  triple: 3,
  quad: 4,
}

export function boothSlotCount(
  app: Pick<
    App,
    'booth_size' | 'artist_single_qty' | 'artist_double_qty' | 'vendor_single_qty' | 'vendor_double_qty'
  >
): number {
  if (app.booth_size) return SIZE_TO_SLOTS[app.booth_size] ?? 1
  return (
    app.artist_single_qty +
    app.artist_double_qty * 2 +
    app.vendor_single_qty +
    app.vendor_double_qty * 2
  )
}
