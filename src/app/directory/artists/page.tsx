'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import PublicNav from '@/components/PublicNav'

const TATTOO_STYLES = [
  'American Traditional', 'Neo-Traditional', 'Japanese', 'Realism',
  'Watercolor', 'Blackwork', 'Dotwork', 'Geometric', 'Tribal',
  'New School', 'Illustrative', 'Fine Line', 'Surrealism', 'Horror / Dark Art',
  'Biomechanical', 'Lettering / Script', 'Floral', 'Minimalist', 'Portrait', 'Cover-up',
]

interface ArtistCard {
  key: string
  artistName: string
  nickname: string
  instagram: string
  styles: string[]
  portfolio_urls: string[]
  businessName: string
  applicationId: string
  logo_url: string | null
}

export default function FindArtistPage() {
  const supabase = createClient()
  const [artists, setArtists] = useState<ArtistCard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, business_name, logo_url, artists')
        .eq('status', 'approved')
        .eq('exhibitor_type', 'artist')
        .order('business_name')

      const cards: ArtistCard[] = []
      ;(data ?? []).forEach(app => {
        const artistList = (app.artists as Array<{
          name?: string; nickname?: string; instagram?: string;
          styles?: string[]; portfolio_urls?: string[]; id_later?: boolean
        }> | null) ?? []
        artistList.forEach((ar, i) => {
          if (!ar.name && !ar.nickname) return // skip completely empty entries
          cards.push({
            key: `${app.id}-${i}`,
            artistName: ar.name ?? '',
            nickname: ar.nickname ?? '',
            instagram: ar.instagram ?? '',
            styles: ar.styles ?? [],
            portfolio_urls: ar.portfolio_urls ?? [],
            businessName: app.business_name,
            applicationId: app.id,
            logo_url: (app as unknown as { logo_url: string | null }).logo_url ?? null,
          })
        })
      })

      setArtists(cards)
      setLoading(false)
    }
    load()
  }, [])

  function toggleStyle(style: string) {
    setSelectedStyles(prev =>
      prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style]
    )
  }

  const filtered = useMemo(() => {
    return artists.filter(a => {
      if (selectedStyles.length > 0 && !selectedStyles.some(s => a.styles.includes(s))) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !a.artistName.toLowerCase().includes(q) &&
          !a.nickname.toLowerCase().includes(q) &&
          !a.businessName.toLowerCase().includes(q) &&
          !a.instagram.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [artists, search, selectedStyles])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-8 pt-5 text-center" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl text-left">
          <Link
            href="/directory"
            className="mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: '#555' }}
            onMouseEnter={el => ((el.currentTarget as HTMLElement).style.color = '#C4A882')}
            onMouseLeave={el => ((el.currentTarget as HTMLElement).style.color = '#555')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Exhibitor Directory
          </Link>
        </div>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          Find an Artist
        </h1>
        <p className="mt-2 text-sm" style={{ color: '#999' }}>
          AATC 2027 · {filtered.length} artist{filtered.length !== 1 ? 's' : ''} {selectedStyles.length > 0 || search ? 'match your search' : 'attending'}
        </p>
      </div>

      {/* Sticky search + style filters */}
      <div
        className="sticky top-0 z-10 border-b px-4 py-3"
        style={{ backgroundColor: '#0a0a0acc', backdropFilter: 'blur(8px)', borderColor: '#2a2a2a' }}
      >
        <div className="mx-auto max-w-5xl space-y-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search by name, handle, or studio…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg px-3 text-sm outline-none"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff' }}
          />

          {/* Style chips */}
          <div className="flex flex-wrap gap-1.5">
            {TATTOO_STYLES.map(style => {
              const active = selectedStyles.includes(style)
              return (
                <button
                  key={style}
                  onClick={() => toggleStyle(style)}
                  className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: active ? 'rgba(139,115,85,0.25)' : 'rgba(255,255,255,0.04)',
                    color: active ? '#C4A882' : '#555',
                    border: `1px solid ${active ? 'rgba(139,115,85,0.5)' : '#2a2a2a'}`,
                  }}
                >
                  {style}
                </button>
              )
            })}
            {selectedStyles.length > 0 && (
              <button
                onClick={() => setSelectedStyles([])}
                className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Artist grid */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        {filtered.length === 0 ? (
          <p className="py-24 text-center text-sm" style={{ color: '#555' }}>
            {artists.length === 0
              ? 'Artist profiles will appear here once applications are approved.'
              : 'No artists match your search.'}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(a => (
              <ArtistResultCard key={a.key} artist={a} onLightbox={setLightbox} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="font-display text-sm font-bold text-white">ALL AMERICAN TATTOO CONVENTION</p>
        <p className="mt-1 text-xs" style={{ color: '#555' }}>
          Crown Complex Event Center · Fayetteville, NC
        </p>
      </footer>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={ev => ev.stopPropagation()}
          />
          <button
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full text-lg text-white transition-opacity hover:opacity-70"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function ArtistResultCard({
  artist: a,
  onLightbox,
}: {
  artist: ArtistCard
  onLightbox: (url: string) => void
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl transition-all"
      style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
      onMouseEnter={el => ((el.currentTarget as HTMLElement).style.borderColor = 'rgba(139,115,85,0.5)')}
      onMouseLeave={el => ((el.currentTarget as HTMLElement).style.borderColor = '#2a2a2a')}
    >
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        {/* Logo circle */}
        {a.logo_url ? (
          <div
            className="h-11 w-11 shrink-0 overflow-hidden rounded-full"
            style={{ border: '2px solid rgba(139,115,85,0.35)', backgroundColor: '#0a0a0a' }}
          >
            <img src={a.logo_url} alt={a.businessName} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#8B7355', border: '2px solid rgba(139,115,85,0.2)' }}
          >
            {(a.nickname || a.artistName || '?')[0].toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">
            {a.nickname || a.artistName || '?'}
          </p>
          <Link
            href={`/directory/${a.applicationId}`}
            className="text-xs transition-colors"
            style={{ color: '#8B7355' }}
            onMouseEnter={el => ((el.currentTarget as HTMLElement).style.color = '#C4A882')}
            onMouseLeave={el => ((el.currentTarget as HTMLElement).style.color = '#8B7355')}
          >
            {a.businessName}
          </Link>
        </div>
      </div>

      {/* Instagram */}
      {a.instagram && (
        <div className="px-4 pb-3">
          <a
            href={`https://instagram.com/${a.instagram.replace(/^@/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: '#C4A882' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
            </svg>
            @{a.instagram.replace(/^@/, '')}
          </a>
        </div>
      )}

      {/* Styles */}
      {a.styles.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {a.styles.map(s => (
            <span
              key={s}
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#8B7355', border: '1px solid rgba(139,115,85,0.2)' }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Portfolio thumbnails */}
      {a.portfolio_urls.length > 0 && (
        <div className="grid grid-cols-3 gap-0.5 border-t" style={{ borderColor: '#2a2a2a' }}>
          {a.portfolio_urls.slice(0, 6).map((url, i) => (
            <button
              key={i}
              onClick={() => onLightbox(url)}
              className="relative overflow-hidden transition-opacity hover:opacity-80"
              style={{ aspectRatio: '1' }}
            >
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover"
              />
              {/* Overlay indicator if more than 6 */}
              {i === 5 && a.portfolio_urls.length > 6 && (
                <div
                  className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                >
                  +{a.portfolio_urls.length - 6}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* No portfolio placeholder */}
      {a.portfolio_urls.length === 0 && (
        <div
          className="border-t px-4 py-3 text-center text-xs"
          style={{ borderColor: '#2a2a2a', color: '#444' }}
        >
          Portfolio coming soon
        </div>
      )}
    </div>
  )
}
