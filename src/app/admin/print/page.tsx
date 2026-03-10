'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import dynamic from 'next/dynamic'

const BoothPacketDownload = dynamic(() => import('@/components/BoothPacketDownload'), { ssr: false })

interface Artist {
  name: string
  nickname?: string
  instagram?: string
  styles?: string[]
  id_url: string | null
  id_later?: boolean
}

interface BoothRow {
  applicationId: string
  boothNumbers: string[]
  isCorner: boolean
  businessName: string
  contactName: string
  email: string
  phone: string | null
  website: string | null
  instagram: string | null
  exhibitorType: 'artist' | 'vendor'
  boothSize: string
  artistCount: number
  artists: Artist[]
  isVeteran: boolean
  tvShow: string | null
  invoiceStatus: string | null
  allDocsUploaded: boolean
}

export default function AdminPrintPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<BoothRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: booths } = await supabase
        .from('booths')
        .select(`
          booth_number, is_corner, application_id,
          application:applications (
            id, business_name, contact_name, email, phone, website, instagram,
            exhibitor_type, booth_size, artist_count,
            artists, artists_ids_later, is_veteran, tv_show
          )
        `)
        .not('application_id', 'is', null)
        .order('booth_number', { ascending: true })

      if (!booths) { setLoading(false); return }

      // Get invoice statuses
      const appIds = (booths as any[]).map(b => b.application_id).filter(Boolean)
      const { data: invoices } = await supabase
        .from('invoices')
        .select('application_id, status')
        .in('application_id', appIds)
      const invoiceMap = new Map(invoices?.map(i => [i.application_id, i.status]) ?? [])

      // Group booths by application_id
      const appMap = new Map<string, BoothRow>()

      for (const b of booths as any[]) {
        const app = b.application
        if (!app) continue
        const appId = b.application_id as string

        if (appMap.has(appId)) {
          appMap.get(appId)!.boothNumbers.push(String(b.booth_number))
          if (b.is_corner) appMap.get(appId)!.isCorner = true
        } else {
          const artists: Artist[] = app.artists ?? []
          const isArtist = app.exhibitor_type === 'artist'

          let allDocsUploaded = true
          if (isArtist && artists.length > 0) {
            for (const a of artists) {
              if (!a.id_url && !a.id_later) {
                allDocsUploaded = false
                break
              }
            }
          } else if (isArtist && artists.length === 0) {
            allDocsUploaded = false
          }

          appMap.set(appId, {
            applicationId: appId,
            boothNumbers: [String(b.booth_number)],
            isCorner: b.is_corner,
            businessName: app.business_name ?? '',
            contactName: app.contact_name ?? '',
            email: app.email ?? '',
            phone: app.phone ?? null,
            website: app.website ?? null,
            instagram: app.instagram ?? null,
            exhibitorType: app.exhibitor_type ?? 'artist',
            boothSize: app.booth_size ?? '',
            artistCount: app.artist_count ?? 0,
            artists,
            isVeteran: app.is_veteran ?? false,
            tvShow: app.tv_show ?? null,
            invoiceStatus: invoiceMap.get(appId) ?? null,
            allDocsUploaded,
          })
        }
      }

      const sorted = Array.from(appMap.values()).sort(
        (a, b) => parseInt(a.boothNumbers[0]) - parseInt(b.boothNumbers[0])
      )

      setRows(sorted)
      setLoading(false)
    }
    load()
  }, [])

  const getMissingDocs = (row: BoothRow): string[] => {
    const missing: string[] = []
    if (row.exhibitorType === 'artist') {
      row.artists.forEach((a, i) => {
        if (!a.id_url && !a.id_later) {
          missing.push(`${a.nickname || a.name || `Artist ${i + 1}`} — ID missing`)
        }
      })
      if (row.artists.length === 0 && row.artistCount > 0) {
        missing.push('No artist information submitted')
      }
    }
    return missing
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const readyCount = rows.filter(r => r.allDocsUploaded || r.exhibitorType === 'vendor').length
  const pendingCount = rows.filter(r => !r.allDocsUploaded && r.exhibitorType === 'artist').length

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Booth Packets</h1>
        <p className="mt-1 text-sm" style={{ color: '#999' }}>
          Generate printable booth packets for each exhibitor. Packets include studio info, artist details, IDs, and contract.
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(139,115,85,0.4)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Total Booths</p>
          <p className="mt-2 font-display text-3xl font-bold text-white">{rows.length}</p>
          <p className="mt-1 text-xs" style={{ color: '#555' }}>assigned exhibitors</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Ready to Print</p>
          <p className="mt-2 font-display text-3xl font-bold" style={{ color: '#4ade80' }}>{readyCount}</p>
          <p className="mt-1 text-xs" style={{ color: '#555' }}>all docs uploaded</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Pending Docs</p>
          <p className="mt-2 font-display text-3xl font-bold" style={{ color: pendingCount > 0 ? '#eab308' : '#4ade80' }}>{pendingCount}</p>
          <p className="mt-1 text-xs" style={{ color: '#555' }}>missing artist IDs</p>
        </div>
      </div>

      {/* Booth list */}
      <div className="rounded-2xl" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        {rows.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm" style={{ color: '#555' }}>
            No booths assigned yet. Assign booths to exhibitors to generate packets.
          </div>
        ) : (
          <>
            {/* Desktop header */}
            <div
              className="hidden grid-cols-[60px_1fr_100px_100px_80px_120px] items-center gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider sm:grid"
              style={{ borderBottom: '1px solid #2a2a2a', color: '#555' }}
            >
              <span>Booth</span>
              <span>Exhibitor</span>
              <span>Type</span>
              <span>Artists</span>
              <span>Docs</span>
              <span>Packet</span>
            </div>

            <div className="divide-y" style={{ borderColor: '#2a2a2a' }}>
              {rows.map(row => {
                const missing = getMissingDocs(row)
                const isReady = row.allDocsUploaded || row.exhibitorType === 'vendor'

                return (
                  <div
                    key={row.applicationId}
                    className="grid gap-3 px-5 py-4 sm:grid-cols-[60px_1fr_100px_100px_80px_120px] sm:items-center"
                  >
                    {/* Booth # */}
                    <div>
                      <p className="font-display text-lg font-bold text-white">
                        {row.boothNumbers.join(', ')}
                      </p>
                      {row.isCorner && (
                        <span className="text-xs" style={{ color: '#666' }}>Corner</span>
                      )}
                    </div>

                    {/* Exhibitor info */}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{row.businessName}</p>
                      <p className="truncate text-xs" style={{ color: '#666' }}>
                        {row.contactName} · {row.email}
                      </p>
                      <p className="mt-1 text-xs capitalize sm:hidden" style={{ color: '#999' }}>
                        {row.exhibitorType} · {row.boothSize} · {row.artists.length} artist{row.artists.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    {/* Type */}
                    <div className="hidden sm:block">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
                        style={{
                          backgroundColor: row.exhibitorType === 'artist' ? 'rgba(139,115,85,0.2)' : 'rgba(96,165,250,0.15)',
                          color: row.exhibitorType === 'artist' ? '#C4A882' : '#60a5fa',
                        }}
                      >
                        {row.exhibitorType}
                      </span>
                    </div>

                    {/* Artists count */}
                    <div className="hidden sm:block">
                      <span className="text-sm text-white">
                        {row.exhibitorType === 'artist' ? `${row.artists.length} artist${row.artists.length !== 1 ? 's' : ''}` : '—'}
                      </span>
                    </div>

                    {/* Docs status */}
                    <div className="hidden sm:block">
                      {isReady ? (
                        <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>Ready</span>
                      ) : (
                        <div>
                          <span className="text-xs font-semibold" style={{ color: '#eab308' }}>Missing</span>
                          {missing.length > 0 && (
                            <div className="mt-1">
                              {missing.map((m, mi) => (
                                <p key={mi} className="text-xs" style={{ color: '#666' }}>{m}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Packet download */}
                    <div>
                      {isReady ? (
                        <BoothPacketDownload
                          data={{
                            businessName: row.businessName,
                            contactName: row.contactName,
                            email: row.email,
                            phone: row.phone,
                            website: row.website,
                            instagram: row.instagram,
                            exhibitorType: row.exhibitorType,
                            boothSize: row.boothSize,
                            boothNumbers: row.boothNumbers,
                            isCorner: row.isCorner,
                            isVeteran: row.isVeteran,
                            tvShow: row.tvShow,
                            artists: row.artists,
                          }}
                          fileName={`booth-packet-${row.boothNumbers.join('-')}-${row.businessName.replace(/\s+/g, '-').toLowerCase()}.pdf`}
                        />
                      ) : (
                        <span className="text-xs" style={{ color: '#555' }}>
                          Waiting for docs
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
