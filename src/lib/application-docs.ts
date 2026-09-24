/**
 * Application document helpers - the ONE home for how a row's uploads are
 * enumerated, how a stored value becomes an object path, and what "verified"
 * means for the veteran document.
 *
 * Paths live on `applications`: `id_doc_url` (vendor, or the legacy single
 * artist ID), `artists[].id_url` (per artist), `veteran_id_url`. The first
 * months stored a full public URL in some rows; `normalizeDocPath` strips
 * those to the object path so one code path serves both shapes.
 */
export const SIGNED_URL_TTL_SECONDS = 300
export const DOCS_BUCKET = 'application-docs'

export type DocKey = 'id' | 'veteran' | `artist-${number}`
export interface DocRef { key: DocKey; label: string; path: string }
export type DocKind = 'image' | 'pdf' | 'other'

/** What the admin route returns for one document. The URL lives for SIGNED_URL_TTL_SECONDS. */
export interface SignedDoc {
  key: DocKey
  label: string
  fileName: string
  mimeType: string | null
  size: number | null
  uploadedAt: string | null
  kind: DocKind
  url: string
  expiresAt: string
}

const BUCKET_MARKER = `/${DOCS_BUCKET}/`

export function normalizeDocPath(raw: string): string {
  const i = raw.indexOf(BUCKET_MARKER)
  return i >= 0 ? raw.slice(i + BUCKET_MARKER.length) : raw
}

type ArtistLike = { name?: string | null; id_url?: string | null }

export function listDocRefs(app: { id_doc_url: string | null; veteran_id_url: string | null; artists: unknown }): DocRef[] {
  const refs: DocRef[] = []
  if (app.id_doc_url) refs.push({ key: 'id', label: 'Government ID', path: normalizeDocPath(app.id_doc_url) })
  const artists = Array.isArray(app.artists) ? (app.artists as ArtistLike[]) : []
  artists.forEach((a, i) => {
    if (!a?.id_url) return
    refs.push({ key: `artist-${i + 1}`, label: `Artist ${i + 1}${a.name ? ` - ${a.name}` : ''}`, path: normalizeDocPath(a.id_url) })
  })
  if (app.veteran_id_url) refs.push({ key: 'veteran', label: 'Veteran proof of service', path: normalizeDocPath(app.veteran_id_url) })
  return refs
}

export function docKind(mimeOrPath: string | null | undefined): DocKind {
  if (!mimeOrPath) return 'other'
  const s = mimeOrPath.toLowerCase()
  if (s.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/.test(s)) return 'image'
  if (s === 'application/pdf' || s.endsWith('.pdf')) return 'pdf'
  return 'other'
}

/** Verified means veteran_doc_verified_at is set. No boolean twin exists on purpose. */
export function veteranNeedsVerification(app: { is_veteran: boolean; veteran_doc_verified_at: string | null }): boolean {
  return app.is_veteran && !app.veteran_doc_verified_at
}

export function splitPath(path: string): { folder: string; fileName: string } {
  const i = path.lastIndexOf('/')
  return i < 0 ? { folder: '', fileName: path } : { folder: path.slice(0, i), fileName: path.slice(i + 1) }
}
