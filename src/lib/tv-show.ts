/**
 * Tattoo TV show answers. Since 2026-10-09 (Ryan) the ARTIST is the source of
 * truth: each roster entry carries tv_featured (the Yes/No) and tv_credit (the
 * show). The application-level answer (094: tv_show_featured, tv_show) is what
 * older applications have; it is used for an artist only when the roster has
 * one artist (decision f). On a larger roster it cannot be attributed, so it
 * is shown as the business's until admin sets the artist (unattributedTv).
 * New public applications still write tv_show_featured as "any artist said
 * Yes", with tv_show empty.
 */

/** The application-level answer as a label (094). Null: not asked. */
export function tvShowLabel(featured: boolean | null | undefined, show: string | null | undefined): string | null {
  const name = (show ?? '').trim()
  if (featured === true) return name ? `Yes: ${name}` : 'Yes (show not named)'
  if (featured === false) return 'No'
  return name || null
}

export interface TvAnswer { featured: boolean; show: string | null }
export interface ArtistTv extends TvAnswer { from: 'artist' | 'application' }
/** applications_public has tv_show but not tv_show_featured; both are optional. */
export interface TvApp { tv_show_featured?: boolean | null; tv_show?: string | null; artists?: unknown }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const rosterOf = (app: TvApp): unknown[] => (Array.isArray(app.artists) ? app.artists : [])

/** One roster entry's own answer. A tv_credit without the Yes/No (editor PR 2) counts as Yes. */
export function ownTv(artist: unknown): TvAnswer | null {
  if (!artist || typeof artist !== 'object') return null
  const a = artist as { tv_featured?: unknown; tv_credit?: unknown }
  const show = str(a.tv_credit)
  if (a.tv_featured === true) return { featured: true, show: show || null }
  if (a.tv_featured === false) return { featured: false, show: null }
  return show ? { featured: true, show } : null
}

function applicationTv(app: TvApp): TvAnswer | null {
  const name = str(app.tv_show)
  if (app.tv_show_featured === true || (app.tv_show_featured == null && name)) return { featured: true, show: name || null }
  if (app.tv_show_featured === false) return { featured: false, show: null }
  return null
}

/** Artist `index`'s answer: their own, else the application's for a one-artist roster. */
export function artistTv(app: TvApp, index: number): ArtistTv | null {
  const roster = rosterOf(app)
  const own = ownTv(roster[index])
  if (own) return { ...own, from: 'artist' }
  if (roster.length <= 1 && index === 0) {
    const a = applicationTv(app)
    if (a) return { ...a, from: 'application' }
  }
  return null
}

export const artistTvLabel = (tv: TvAnswer | null): string | null => (tv ? tvShowLabel(tv.featured, tv.show) : null)

/** The application's Yes that no artist carries (an older multi-artist application), as a label; else null. */
export function unattributedTv(app: TvApp): string | null {
  const a = applicationTv(app)
  if (!a?.featured) return null
  const roster = rosterOf(app)
  if (roster.length <= 1) return null
  if (roster.some(r => ownTv(r)?.featured)) return null
  return tvShowLabel(true, a.show)
}

/** Named shows for public pages, in roster order without repeats (artists first, then an unattributed one). */
export function publicTvShows(app: TvApp): string[] {
  const shows: string[] = []
  const roster = rosterOf(app)
  const n = Math.max(roster.length, 1)
  for (let i = 0; i < n; i++) {
    const tv = artistTv(app, i)
    if (tv?.featured && tv.show && !shows.includes(tv.show)) shows.push(tv.show)
  }
  const u = unattributedTv(app)
  const name = str(app.tv_show)
  if (u && name && !shows.includes(name)) shows.push(name)
  return shows
}
