/**
 * Public "Veteran" badges (100), shared by server and client code. Ticked
 * only by an admin, after checking with the person (Ryan, 2026-10-10); never
 * derived from is_veteran (the discount).
 */

/** Badge text (Ryan, 2026-10-10). Always a text label, never icon-only. */
export const VETERAN_LABEL = {
  /** An artist (artist card, profile roster, VIP and homepage cards). */
  artist: 'Veteran',
  /** A vendor's business. */
  vendor: 'Veteran-owned',
} as const

/** An artist shop's card on /directory: how many of its artists are badged. */
export function shopVeteranLabel(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? 'Veteran artist' : 'Veteran artists'
}

/** Server-rendered pages that show badges; purged with tag 'veteran' after an admin change. */
export const VETERAN_PATHS = ['/events/vip-meet-greet', '/']

/** The public badge rows, grouped for the pages. */
export interface VeteranBadges {
  /** Vendor applications with a business badge. */
  vendors: Set<string>
  /** Roster uids with an artist badge. */
  artists: Set<string>
  /** Badged artists per artist application. */
  shopCounts: Map<string, number>
}

export function groupVeteranBadges(rows: ReadonlyArray<{ application_id: string; artist_uid: string | null }>): VeteranBadges {
  const g: VeteranBadges = { vendors: new Set(), artists: new Set(), shopCounts: new Map() }
  for (const r of rows) {
    if (r.artist_uid === null) g.vendors.add(r.application_id)
    else {
      g.artists.add(r.artist_uid)
      g.shopCounts.set(r.application_id, (g.shopCounts.get(r.application_id) ?? 0) + 1)
    }
  }
  return g
}
