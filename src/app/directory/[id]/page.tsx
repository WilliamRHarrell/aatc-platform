'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PublicNav from '@/components/PublicNav'
import { describeBooths } from '@/lib/booth-display'

interface ArtistInfo {
  name: string
  nickname?: string
  instagram?: string
  portfolio_urls?: string[]
}

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
  facebook: string | null
  phone: string | null
  artists: ArtistInfo[] | null
  artist_count: number
  tv_show: string | null
  logo_url: string | null
  portfolio_image_urls: string[] | null
}

interface Booth {
  booth_number: string
  is_corner: boolean
}

function instagramUrl(val: string): string {
  if (val.startsWith('http')) return val
  return `https://instagram.com/${val.replace(/^@/, '')}`
}

function websiteUrl(val: string): string {
  return val.startsWith('http') ? val : `https://${val}`
}

function displayHost(url: string): string {
  try {
    return new URL(websiteUrl(url)).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function facebookUrl(val: string): string {
  if (val.startsWith('http')) return val
  return `https://facebook.com/${val}`
}

export default function DirectoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [exhibitor, setExhibitor] = useState<Exhibitor | null>(null)
  const [booth, setBooth] = useState<Booth | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [expandedArtists, setExpandedArtists] = useState<Set<number>>(new Set())
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const [{ data: app }, { data: boothData }] = await Promise.all([
        supabase
          .from('applications')
          .select('id, business_name, exhibitor_type, booth_size, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, instagram, website, facebook, phone, artists, artist_count, tv_show, logo_url, portfolio_image_urls')
          .eq('id', id)
          .eq('status', 'approved')
          .single(),
        supabase
          .from('booths')
          .select('booth_number, is_corner')
          .eq('application_id', id)
          .single(),
      ])

      if (!app) {
        setNotFound(true)
      } else {
        setExhibitor(app as unknown as Exhibitor)
      }
      if (boothData) setBooth(boothData as Booth)
      setLoading(false)
    }
    load()
  }, [id])

  function toggleArtist(i: number) {
    setExpandedArtists(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <PublicNav />
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
        </div>
      </div>
    )
  }

  if (notFound || !exhibitor) {
    return (
      <div className="min-h-screen">
        <PublicNav />
        <div className="flex h-64 flex-col items-center justify-center px-4">
          <p className="mb-4 text-sm" style={{ color: '#555' }}>Exhibitor not found.</p>
          <Link href="/directory" className="text-sm font-semibold" style={{ color: '#8B7355' }}>
            ← Back to Directory
          </Link>
        </div>
      </div>
    )
  }

  const e = exhibitor
  const hasLinks = e.instagram || e.website || e.facebook || e.phone

  return (
    <div className="min-h-screen">
      <PublicNav />
      <div className="px-4 py-10">
        <div className="mx-auto max-w-2xl">

          {/* Back link */}
          <Link
            href="/directory"
            className="mb-8 flex items-center gap-2 text-sm transition-colors"
            style={{ color: '#999' }}
            onMouseEnter={el => ((el.currentTarget as HTMLElement).style.color = '#C4A882')}
            onMouseLeave={el => ((el.currentTarget as HTMLElement).style.color = '#999')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Directory
          </Link>

          {/* Header */}
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {/* Badges */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-3 py-0.5 text-xs font-semibold capitalize"
                  style={
                    e.exhibitor_type === 'artist'
                      ? { backgroundColor: 'rgba(139,115,85,0.2)', color: '#C4A882' }
                      : { backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }
                  }
                >
                  {e.exhibitor_type}
                </span>
                {booth?.is_corner && (
                  <span
                    className="rounded-full px-3 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: 'rgba(234,179,8,0.12)', color: '#eab308' }}
                  >
                    Corner Booth
                  </span>
                )}
              </div>

              <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
                <span className="text-emboss">{e.business_name}</span>
              </h1>

              <p className="mt-2 text-sm capitalize" style={{ color: '#999' }}>
                <span className="text-emboss">{describeBooths(e)}
                {booth ? ` · Booth ${booth.booth_number}` : ''}
                {e.exhibitor_type === 'artist' && e.artist_count > 0
                  ? ` · ${e.artist_count} artist${e.artist_count !== 1 ? 's' : ''}`
                  : ''}</span>
              </p>

              {e.tv_show && (
                <p className="mt-2 text-sm font-semibold" style={{ color: '#8B7355' }}>
                  <span className="text-emboss">★ Featured on {e.tv_show}</span>
                </p>
              )}
            </div>

            {/* Circle logo */}
            {e.logo_url && (
              <div
                className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-full sm:h-28 sm:w-28"
                style={{ border: '3px solid rgba(139,115,85,0.4)', backgroundColor: '#0a0a0a' }}
              >
                <img src={e.logo_url} alt={e.business_name} className="h-full w-full object-cover" />
              </div>
            )}
          </div>

          <div className="space-y-4">

            {/* Artist roster */}
            {e.exhibitor_type === 'artist' && (
              <div className="rounded-2xl" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                <p className="px-5 pb-3 pt-5 text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>
                  Artist Roster
                </p>
                {e.artists && e.artists.length > 0 ? (
                  <div className="divide-y pb-2" style={{ borderColor: '#2a2a2a' }}>
                    {e.artists.map((a, i) => {
                      const isOpen = expandedArtists.has(i)
                      return (
                        <div key={i}>
                          {/* Artist row — always expandable */}
                          <div
                            className="flex items-center gap-3 px-5 py-3"
                            style={{ borderColor: '#2a2a2a' }}
                          >
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                              style={{ backgroundColor: 'rgba(139,115,85,0.2)', color: '#8B7355' }}
                            >
                              {i + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white">
                                {a.nickname || a.name || `Artist ${i + 1}`}
                              </p>
                            </div>
                            <button
                              onClick={() => toggleArtist(i)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg font-light transition-colors"
                              style={{ color: '#C4A882', backgroundColor: 'rgba(139,115,85,0.1)' }}
                            >
                              {isOpen ? '−' : '+'}
                            </button>
                          </div>

                          {/* Expanded detail */}
                          {isOpen && (
                            <div className="px-5 pb-4 pt-3" style={{ borderTop: '1px solid #2a2a2a', backgroundColor: '#141414' }}>
                              {a.instagram ? (
                                <a
                                  href={`https://instagram.com/${a.instagram.replace(/^@/, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs"
                                  style={{ color: '#C4A882' }}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                                  </svg>
                                  @{a.instagram.replace(/^@/, '')}
                                </a>
                              ) : (
                                <p className="text-xs" style={{ color: '#555' }}>No Instagram on file</p>
                              )}
                              {a.portfolio_urls && a.portfolio_urls.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {a.portfolio_urls.map((url, ui) => (
                                    <button
                                      key={ui}
                                      onClick={() => setLightbox(url)}
                                      className="overflow-hidden rounded-lg transition-opacity hover:opacity-75"
                                      style={{ border: '1px solid #2a2a2a' }}
                                    >
                                      <img src={url} alt="" className="h-16 w-16 object-cover" />
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-xs" style={{ color: '#555' }}>No portfolio images yet</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="px-5 pb-5 text-sm" style={{ color: '#555' }}>Artist roster coming soon.</p>
                )}
              </div>
            )}

            {/* Vendor portfolio images */}
            {e.portfolio_image_urls && e.portfolio_image_urls.length > 0 && (
              <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>
                  Portfolio
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {e.portfolio_image_urls.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setLightbox(url)}
                      className="aspect-square overflow-hidden rounded-lg transition-opacity hover:opacity-75"
                      style={{ border: '1px solid #2a2a2a' }}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Social / links */}
            {hasLinks && (
              <div className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>
                  Find Us Online
                </p>
                <div className="flex flex-col gap-3">
                  {e.instagram && (
                    <a
                      href={instagramUrl(e.instagram)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff' }}
                      onMouseEnter={el => ((el.currentTarget as HTMLElement).style.borderColor = 'rgba(139,115,85,0.4)')}
                      onMouseLeave={el => ((el.currentTarget as HTMLElement).style.borderColor = '#2a2a2a')}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                      </svg>
                      <span className="text-sm">
                        @{e.instagram.replace(/^@/, '').replace(/.*instagram\.com\//, '').replace(/\/$/, '')}
                      </span>
                      <svg className="ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  )}
                  {e.website && (
                    <a
                      href={websiteUrl(e.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff' }}
                      onMouseEnter={el => ((el.currentTarget as HTMLElement).style.borderColor = 'rgba(139,115,85,0.4)')}
                      onMouseLeave={el => ((el.currentTarget as HTMLElement).style.borderColor = '#2a2a2a')}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                      </svg>
                      <span className="text-sm">{displayHost(e.website)}</span>
                      <svg className="ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  )}
                  {e.facebook && (
                    <a
                      href={facebookUrl(e.facebook)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff' }}
                      onMouseEnter={el => ((el.currentTarget as HTMLElement).style.borderColor = 'rgba(139,115,85,0.4)')}
                      onMouseLeave={el => ((el.currentTarget as HTMLElement).style.borderColor = '#2a2a2a')}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                      </svg>
                      <span className="text-sm">{e.facebook.replace(/^@/, '').replace(/.*facebook\.com\//, '').replace(/\/$/, '')}</span>
                      <svg className="ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  )}
                  {e.phone && (
                    <a
                      href={`tel:${e.phone}`}
                      className="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff' }}
                      onMouseEnter={el => ((el.currentTarget as HTMLElement).style.borderColor = 'rgba(139,115,85,0.4)')}
                      onMouseLeave={el => ((el.currentTarget as HTMLElement).style.borderColor = '#2a2a2a')}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.86a16 16 0 0 0 6 6l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"/>
                      </svg>
                      <span className="text-sm">{e.phone}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Event info */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>Event</p>
              <p className="text-sm font-semibold text-white">All American Tattoo Convention 2027</p>
              <p className="mt-0.5 text-xs" style={{ color: '#999' }}>
                April 16–18, 2027 · Crown Complex Event Center · Fayetteville, NC
              </p>
            </div>

          </div>
        </div>
      </div>

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
