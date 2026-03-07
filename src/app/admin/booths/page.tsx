'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

interface ApprovedApp {
  id: string
  business_name: string
  contact_name: string
  exhibitor_type: 'artist' | 'vendor'
  booth_size: 'single' | 'double' | 'triple' | 'quad'
  is_corner: boolean
  artist_count: number
  artists: Array<{ name: string; id_url: string | null; id_later?: boolean; nickname?: string; portfolio_urls?: string[] }> | null
  artists_ids_later: boolean
}

function docStatus(app: ApprovedApp): 'complete' | 'pending' | 'missing' | 'na' {
  if (app.exhibitor_type === 'vendor') return 'na'
  const list = app.artists ?? []
  if (list.length === 0) return 'missing'
  if (list.every(a => a.id_url)) return 'complete'
  // Some artists are missing IDs — "pending" only if every missing one has id_later
  const missing = list.filter(a => !a.id_url)
  if (missing.every(a => a.id_later)) return 'pending'
  return 'missing'
}

function DocBadge({ status }: { status: ReturnType<typeof docStatus> }) {
  if (status === 'na') return <span className="text-xs" style={{ color: '#444' }}>—</span>
  const map = {
    complete: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', label: 'Complete' },
    pending:  { bg: 'rgba(234,179,8,0.12)',  color: '#eab308', label: 'Pending'  },
    missing:  { bg: 'rgba(248,113,113,0.12)', color: '#f87171', label: 'Missing' },
  }
  const s = map[status]
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

interface BoothRow {
  id: string
  booth_number: string
  is_corner: boolean
  status: 'available' | 'reserved' | 'sold'
  application_id: string | null
}

const SLOTS: Record<string, number> = { single: 1, double: 2, triple: 3, quad: 4 }

const STATUS_COLOR: Record<string, { bg: string; border: string; text: string; opacity?: number }> = {
  available: { bg: '#1a1a1a',  border: '#2a2a2a', text: '#888' },
  reserved:  { bg: '#111',     border: '#1e1e1e', text: '#2e2e2e', opacity: 1 },
  sold:      { bg: '#111',     border: '#1e1e1e', text: '#2e2e2e', opacity: 1 },
}

export default function AdminBoothsPage() {
  const supabase = createClient()
  const [apps, setApps] = useState<ApprovedApp[]>([])
  const [booths, setBooths] = useState<BoothRow[]>([])
  const [invoiceStatus, setInvoiceStatus] = useState<Map<string, 'paid' | 'overdue' | 'pending' | 'cancelled'>>(new Map())
  const [loading, setLoading] = useState(true)
  const [gridOpen, setGridOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned'>('all')

  useEffect(() => {
    const load = async () => {
      const [{ data: appData }, { data: boothData }, { data: invoiceData }] = await Promise.all([
        supabase
          .from('applications')
          .select('id, business_name, contact_name, exhibitor_type, booth_size, is_corner, artist_count, artists, artists_ids_later')
          .eq('status', 'approved')
          .order('business_name'),
        supabase
          .from('booths')
          .select('id, booth_number, is_corner, status, application_id')
          .order('booth_number', { ascending: true }),
        supabase
          .from('invoices')
          .select('application_id, status'),
      ])
      setApps((appData ?? []) as ApprovedApp[])
      setBooths((boothData ?? []) as BoothRow[])

      // Build map: applicationId → most favorable invoice status (paid > overdue > pending > cancelled)
      const priority: Record<string, number> = { paid: 4, overdue: 3, pending: 2, cancelled: 1 }
      const map = new Map<string, 'paid' | 'overdue' | 'pending' | 'cancelled'>()
      ;(invoiceData ?? []).forEach((inv: { application_id: string | null; status: string }) => {
        if (!inv.application_id) return
        const existing = map.get(inv.application_id)
        const s = inv.status as 'paid' | 'overdue' | 'pending' | 'cancelled'
        if (!existing || (priority[s] ?? 0) > (priority[existing] ?? 0)) {
          map.set(inv.application_id, s)
        }
      })
      setInvoiceStatus(map)

      setLoading(false)
    }
    load()
  }, [])

  // Map applicationId → list of assigned booth numbers
  const boothsByApp = useMemo(() => {
    const map = new Map<string, string[]>()
    booths.forEach(b => {
      if (b.application_id) {
        const existing = map.get(b.application_id) ?? []
        existing.push(b.booth_number)
        map.set(b.application_id, existing)
      }
    })
    return map
  }, [booths])

  const filtered = useMemo(() => {
    return apps.filter(a => {
      const assigned = boothsByApp.has(a.id)
      if (filter === 'assigned' && !assigned) return false
      if (filter === 'unassigned' && assigned) return false
      if (search) {
        const q = search.toLowerCase()
        return a.business_name.toLowerCase().includes(q) || a.contact_name.toLowerCase().includes(q)
      }
      return true
    })
  }, [apps, boothsByApp, filter, search])

  const assignedCount = apps.filter(a => boothsByApp.has(a.id)).length

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Booth Assignment</h1>
        <p className="mt-1 text-sm" style={{ color: '#999' }}>
          {apps.length} approved exhibitor{apps.length !== 1 ? 's' : ''} · {assignedCount} assigned · {apps.length - assignedCount} unassigned
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1" style={{ minWidth: '200px' }}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search exhibitors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg py-2 pl-9 pr-3 text-sm text-white outline-none"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          />
        </div>
        <div className="flex rounded-lg p-1" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          {(['all', 'assigned', 'unassigned'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors"
              style={{
                backgroundColor: filter === f ? '#8B7355' : 'transparent',
                color: filter === f ? '#fff' : '#999',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Applicant table */}
      <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid #2a2a2a' }}>
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ backgroundColor: '#1a1a1a', color: '#555' }}>
            {apps.length === 0 ? 'No approved exhibitors yet' : 'No exhibitors match your filters'}
          </div>
        ) : (
          <>
            {/* Table header */}
            <div
              className="hidden grid-cols-[1fr_80px_90px_60px_80px_90px_40px_1fr_100px] items-center gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-widest sm:grid"
              style={{ backgroundColor: '#111', color: '#555', borderBottom: '1px solid #2a2a2a' }}
            >
              <span>Exhibitor</span>
              <span>Type</span>
              <span>Size</span>
              <span>Corner</span>
              <span>Artists</span>
              <span>Docs</span>
              <span>Paid</span>
              <span>Booth #s</span>
              <span />
            </div>

            <div className="divide-y" style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}>
              {filtered.map(app => {
                const assignedBooths = boothsByApp.get(app.id) ?? []
                const slotCount = SLOTS[app.booth_size] ?? 1
                const fullyAssigned = assignedBooths.length >= slotCount

                return (
                  <div key={app.id} className="flex flex-col gap-3 px-5 py-4 sm:grid sm:grid-cols-[1fr_80px_90px_60px_80px_90px_40px_1fr_100px] sm:items-center sm:gap-4">
                    {/* Name */}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{app.business_name}</p>
                      <p className="truncate text-xs" style={{ color: '#666' }}>{app.contact_name}</p>
                    </div>

                    {/* Type */}
                    <span
                      className="w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
                      style={{
                        backgroundColor: app.exhibitor_type === 'artist' ? 'rgba(139,115,85,0.2)' : 'rgba(96,165,250,0.15)',
                        color: app.exhibitor_type === 'artist' ? '#C4A882' : '#60a5fa',
                      }}
                    >
                      {app.exhibitor_type}
                    </span>

                    {/* Size */}
                    <span className="text-sm capitalize text-white">{app.booth_size}</span>

                    {/* Corner */}
                    <div className="flex items-center">
                      {app.is_corner ? (
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#8B7355' }} title="Corner booth" />
                      ) : (
                        <span className="text-xs" style={{ color: '#444' }}>—</span>
                      )}
                    </div>

                    {/* Artists */}
                    <span className="text-sm" style={{ color: '#999' }}>
                      {app.exhibitor_type === 'artist' ? app.artist_count : '—'}
                    </span>

                    {/* Docs */}
                    <div className="flex items-center">
                      <DocBadge status={docStatus(app)} />
                    </div>

                    {/* Payment */}
                    <div className="flex items-center">
                      {(() => {
                        const inv = invoiceStatus.get(app.id)
                        if (inv === 'paid') {
                          return <span className="text-base font-bold" style={{ color: '#4ade80' }} title="Invoice paid">$</span>
                        }
                        if (inv === 'overdue') {
                          return <span className="text-base font-bold" style={{ color: '#f87171' }} title="Invoice overdue">$</span>
                        }
                        return <span className="text-base font-bold" style={{ color: '#333' }} title={inv ? `Invoice ${inv}` : 'No invoice'}>$</span>
                      })()}
                    </div>

                    {/* Booth numbers */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {assignedBooths.length > 0 ? (
                        assignedBooths.map(num => (
                          <span
                            key={num}
                            className="rounded-md px-2 py-0.5 text-xs font-bold"
                            style={{
                              backgroundColor: fullyAssigned ? 'rgba(74,222,128,0.15)' : 'rgba(139,115,85,0.15)',
                              color: fullyAssigned ? '#4ade80' : '#C4A882',
                            }}
                          >
                            #{num}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs" style={{ color: '#444' }}>Unassigned</span>
                      )}
                      {assignedBooths.length > 0 && assignedBooths.length < slotCount && (
                        <span className="text-xs" style={{ color: '#eab308' }}>
                          ({slotCount - assignedBooths.length} more needed)
                        </span>
                      )}
                    </div>

                    {/* Edit button */}
                    <div className="flex justify-end">
                      <Link
                        href={`/admin/booths/${app.id}`}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                      >
                        Edit →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Collapsible floor plan grid */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #2a2a2a' }}>
        <button
          onClick={() => setGridOpen(g => !g)}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-white/5"
          style={{ backgroundColor: '#1a1a1a' }}
        >
          <div>
            <p className="text-sm font-semibold text-white">Floor Plan Grid</p>
            <p className="text-xs" style={{ color: '#555' }}>
              267 booths — available / reserved / sold
            </p>
          </div>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: gridOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {gridOpen && (
          <div className="p-4" style={{ backgroundColor: '#111', borderTop: '1px solid #2a2a2a' }}>
            <div className="flex flex-wrap gap-1.5">
              {booths.map(booth => {
                const taken = booth.status !== 'available'
                const s = STATUS_COLOR[booth.status]
                return (
                  <div
                    key={booth.id}
                    title={
                      booth.application_id
                        ? `#${booth.booth_number} — ${apps.find(a => a.id === booth.application_id)?.business_name ?? 'Taken'}`
                        : `#${booth.booth_number} — Available`
                    }
                    className="relative flex h-11 w-11 items-center justify-center rounded-lg text-xs font-bold"
                    style={{
                      backgroundColor: s.bg,
                      border: `2px solid ${taken ? '#1e1e1e' : booth.is_corner ? 'rgba(139,115,85,0.4)' : s.border}`,
                      color: s.text,
                      opacity: taken ? 0.35 : 1,
                    }}
                  >
                    {booth.booth_number}
                    {booth.is_corner && !taken && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs" style={{ color: '#666' }}>
              {[
                { label: 'Available', dot: '#888' },
                { label: 'Taken (greyed out)', dot: '#2a2a2a' },
                { label: 'Corner booth', dot: '#8B7355' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.dot }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
