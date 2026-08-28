'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import PublicNav from '@/components/PublicNav'
import { describeBooths } from '@/lib/booth-display'

interface Exhibitor {
  id: string
  business_name: string
  exhibitor_type: 'artist' | 'vendor'
  booth_size: 'single' | 'double' | 'triple' | 'quad' | null
  artist_single_qty: number
  artist_double_qty: number
  vendor_single_qty: number
  vendor_double_qty: number
  corner_count: number
  instagram: string | null
  website: string | null
  phone: string | null
  artist_count: number
  tv_show: string | null
  booth_number: string | null
  is_corner: boolean
  logo_url: string | null
}

type TypeFilter = 'all' | 'artist' | 'vendor'

function displayHost(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function DirectoryPage() {
  const supabase = createClient()
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  useEffect(() => {
    const load = async () => {
      const [{ data: apps }, { data: booths }] = await Promise.all([
        supabase
          .from('applications')
          .select('id, business_name, exhibitor_type, booth_size, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, instagram, website, phone, artist_count, tv_show, logo_url')
          .eq('status', 'approved')
          .order('business_name'),
        supabase
          .from('booths')
          .select('application_id, booth_number, is_corner')
          .not('application_id', 'is', null),
      ])

      const boothMap = new Map<string, { booth_number: string; is_corner: boolean }>()
      booths?.forEach(b => {
        if (b.application_id) boothMap.set(b.application_id, { booth_number: b.booth_number, is_corner: b.is_corner })
      })

      const list: Exhibitor[] = (apps ?? []).map(a => ({
        ...(a as unknown as Omit<Exhibitor, 'booth_number' | 'is_corner'>),
        booth_number: boothMap.get(a.id)?.booth_number ?? null,
        is_corner: boothMap.get(a.id)?.is_corner ?? false,
        logo_url: (a as unknown as { logo_url: string | null }).logo_url ?? null,
      }))

      setExhibitors(list)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    return exhibitors.filter(e => {
      if (typeFilter !== 'all' && e.exhibitor_type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!e.business_name.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [exhibitors, search, typeFilter])

  const counts = useMemo(() => ({
    all: exhibitors.length,
    artist: exhibitors.filter(e => e.exhibitor_type === 'artist').length,
    vendor: exhibitors.filter(e => e.exhibitor_type === 'vendor').length,
  }), [exhibitors])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-8 pt-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Exhibitor Directory</span>
        </h1>
        <p className="mt-2 text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">AATC 2027 · April 16-18 · Crown Complex Event Center</span>
        </p>
        {exhibitors.length > 0 && (
          <p className="mt-1 text-xs" style={{ color: '#555' }}>
            <span className="text-emboss">{counts.artist} artist{counts.artist !== 1 ? 's' : ''} · {counts.vendor} vendor{counts.vendor !== 1 ? 's' : ''}</span>
          </p>
        )}
      </div>

      {/* Sticky filters */}
      <div
        className="sticky top-0 z-10 border-b px-4 py-3"
        style={{ backgroundColor: '#0a0a0acc', backdropFilter: 'blur(8px)', borderColor: '#2a2a2a' }}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search exhibitors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg px-3 text-sm outline-none sm:w-64"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff' }}
          />
          <div className="flex gap-2">
            {(['all', 'artist', 'vendor'] as TypeFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors"
                style={{
                  backgroundColor: typeFilter === f ? 'rgba(139,115,85,0.2)' : 'transparent',
                  color: typeFilter === f ? '#C4A882' : '#666',
                  border: `1px solid ${typeFilter === f ? 'rgba(139,115,85,0.4)' : '#2a2a2a'}`,
                }}
              >
                {f === 'all' ? `All (${counts.all})` : `${f === 'artist' ? 'Artists' : 'Vendors'} (${counts[f]})`}
              </button>
            ))}
          </div>

          <Link
            href="/directory/artists"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: '#8B7355', color: '#fff' }}
            onMouseEnter={el => ((el.currentTarget as HTMLElement).style.backgroundColor = '#C4A882')}
            onMouseLeave={el => ((el.currentTarget as HTMLElement).style.backgroundColor = '#8B7355')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Find an Artist
          </Link>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        {filtered.length === 0 ? (
          <p className="py-24 text-center text-sm" style={{ color: '#555' }}>
            <span className="text-emboss">
              {exhibitors.length === 0
                ? 'Exhibitors will appear here once applications are approved.'
                : 'No results match your search.'}
            </span>
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(e => (
              <ExhibitorCard key={e.id} exhibitor={e} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="font-display text-sm font-bold text-white"><span className="text-emboss">ALL AMERICAN TATTOO CONVENTION</span></p>
        <p className="mt-1 text-xs" style={{ color: '#555' }}>
          <span className="text-emboss">Crown Complex Event Center · Fayetteville, NC</span>
        </p>
      </footer>
    </div>
  )
}

function ExhibitorCard({ exhibitor: e }: { exhibitor: Exhibitor }) {
  return (
    <Link
      href={`/directory/${e.id}`}
      className="group relative block overflow-hidden rounded-2xl p-5 transition-all"
      style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
      onMouseEnter={el => ((el.currentTarget as HTMLElement).style.borderColor = 'rgba(139,115,85,0.5)')}
      onMouseLeave={el => ((el.currentTarget as HTMLElement).style.borderColor = '#2a2a2a')}
    >
      {/* Ghosted logo background */}
      {e.logo_url && (
        <img
          src={e.logo_url}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0.12 }}
        />
      )}

      {/* Badges */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
          style={
            e.exhibitor_type === 'artist'
              ? { backgroundColor: 'rgba(139,115,85,0.2)', color: '#C4A882' }
              : { backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }
          }
        >
          {e.exhibitor_type}
        </span>
        {e.is_corner && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: 'rgba(234,179,8,0.12)', color: '#eab308' }}
          >
            Corner
          </span>
        )}
      </div>

      {/* Name */}
      <h2 className="leading-snug text-lg font-bold text-white transition-colors group-hover:text-[#C4A882]">
        {e.business_name}
      </h2>

      {/* Meta */}
      <p className="mt-1 text-sm capitalize" style={{ color: '#fff' }}>
        {describeBooths(e)}
        {e.booth_number ? ` · Booth ${e.booth_number}` : ''}
        {e.exhibitor_type === 'artist' && e.artist_count > 0
          ? ` · ${e.artist_count} artist${e.artist_count !== 1 ? 's' : ''}`
          : ''}
      </p>

      {/* TV show */}
      {e.tv_show && (
        <p className="mt-2 text-xs font-medium" style={{ color: '#8B7355' }}>
          ★ {e.tv_show}
        </p>
      )}

      {/* Contact row */}
      {(e.instagram || e.website || e.phone) && (
        <div className="mt-3 flex flex-col gap-1">
          {e.instagram && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#fff' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
              @{e.instagram.replace(/^@/, '').replace(/.*instagram\.com\//, '').replace(/\/$/, '')}
            </span>
          )}
          {e.website && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#fff' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              {displayHost(e.website)}
            </span>
          )}
          {e.phone && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#fff' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.86a16 16 0 0 0 6 6l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"/>
              </svg>
              {e.phone}
            </span>
          )}
        </div>
      )}
    </Link>
  )
}
