import Image from 'next/image'

/**
 * The artist roster as the applicant submitted it (applications.artists),
 * read-only, for the applications drawer (2026-10-09). Before this, display
 * name, Instagram, styles and portfolio were only on /admin/booths/[id],
 * which the drawer links to only after approval, so a pending application
 * was decided without seeing the artists' work. Editing stays on the booth
 * page; ID documents stay in the drawer's Documents section.
 */
type RosterArtist = {
  name?: unknown
  nickname?: unknown
  instagram?: unknown
  styles?: unknown
  portfolio_urls?: unknown
  id_url?: unknown
  id_later?: unknown
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])

export default function ArtistRosterReadOnly({ artists }: { artists: unknown }) {
  const roster = (Array.isArray(artists) ? artists : []) as RosterArtist[]
  if (roster.length === 0) return <p className="text-sm" style={{ color: '#666' }}>No artists listed.</p>
  return (
    <ol className="space-y-4">
      {roster.map((a, i) => {
        const handle = str(a.instagram).replace(/^@/, '')
        const styles = list(a.styles)
        const portfolio = list(a.portfolio_urls)
        return (
          <li key={i} className="rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-white">
                {i + 1}. {str(a.nickname) || str(a.name) || 'Unnamed artist'}
              </p>
              <span className="text-xs" style={{ color: str(a.id_url) ? '#4ade80' : a.id_later ? '#eab308' : '#f87171' }}>
                {str(a.id_url) ? 'ID uploaded' : a.id_later ? 'ID later' : 'No ID'}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt style={{ color: '#888' }}>Legal name</dt>
              <dd className="text-white break-words">{str(a.name) || <span style={{ color: '#555' }}>Not given</span>}</dd>
              <dt style={{ color: '#888' }}>Artist name</dt>
              <dd className="text-white break-words">{str(a.nickname) || <span style={{ color: '#555' }}>Not given</span>}</dd>
              <dt style={{ color: '#888' }}>Instagram</dt>
              <dd className="break-words">
                {handle
                  ? <a href={`https://instagram.com/${handle}`} target="_blank" rel="noopener noreferrer" style={{ color: '#C4A882' }}>@{handle}</a>
                  : <span style={{ color: '#555' }}>Not given</span>}
              </dd>
              <dt style={{ color: '#888' }}>Styles</dt>
              <dd className="flex flex-wrap gap-1">
                {styles.length
                  ? styles.map(s => <span key={s} className="rounded px-2 py-0.5 text-xs" style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882' }}>{s}</span>)
                  : <span className="text-sm" style={{ color: '#555' }}>Not given</span>}
              </dd>
            </dl>
            <p className="mt-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Portfolio ({portfolio.length})</p>
            {portfolio.length > 0 ? (
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
                {portfolio.map(url => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="relative block aspect-square overflow-hidden rounded-lg" style={{ border: '1px solid #2a2a2a' }}>
                    <Image src={url} alt={`Portfolio, artist ${i + 1}`} fill sizes="96px" style={{ objectFit: 'cover' }} />
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm" style={{ color: '#555' }}>No images</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
