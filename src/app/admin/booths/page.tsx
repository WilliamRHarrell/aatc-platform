'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { calculatePricing, type BoothSize, type ExhibitorType } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'
import { describeBooths, boothSlotCount } from '@/lib/booth-display'
import toast from 'react-hot-toast'
import { guardedWrite } from '@/lib/db-write'

interface ApprovedApp {
  id: string
  business_name: string
  contact_name: string
  exhibitor_type: 'artist' | 'vendor'
  booth_size: 'single' | 'double' | 'triple' | 'quad' | null
  artist_single_qty: number
  artist_double_qty: number
  vendor_single_qty: number
  vendor_double_qty: number
  corner_count: number
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
  // Some artists are missing IDs - "pending" only if every missing one has id_later
  const missing = list.filter(a => !a.id_url)
  if (missing.every(a => a.id_later)) return 'pending'
  return 'missing'
}

function DocBadge({ status }: { status: ReturnType<typeof docStatus> }) {
  if (status === 'na') return <span className="text-xs" style={{ color: '#444' }}> - </span>
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
const MAX_ARTISTS: Record<string, number> = { single: 2, double: 4, triple: 6, quad: 8 }

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

  // Add A Booth modal
  const [showAddModal, setShowAddModal] = useState(false)
  interface BoothEntry { size: BoothSize; is_corner: boolean; artist_count: number }
  const [addForm, setAddForm] = useState({
    business_name: '',
    contact_name: '',
    email: '',
    phone: '',
    exhibitor_type: 'artist' as ExhibitorType,
    booths: [{ size: 'single' as BoothSize, is_corner: false, artist_count: 1 }] as BoothEntry[],
    is_veteran: false,
    deposit: '',
    payFull: false,
  })
  const [addSaving, setAddSaving] = useState(false)

  const boothPricings = addForm.booths.map(b => {
    // Map admin's BoothEntry { size, is_corner, artist_count } to per-size qtys.
    // triple = single + double, quad = 2 doubles.
    const isArtist = addForm.exhibitor_type === 'artist'
    const sizeToQty: Record<BoothSize, { single: number; double: number }> = {
      single: { single: 1, double: 0 },
      double: { single: 0, double: 1 },
      triple: { single: 1, double: 1 },
      quad: { single: 0, double: 2 },
    }
    const qty = sizeToQty[b.size]
    return calculatePricing({
      exhibitorType: addForm.exhibitor_type,
      artistSingleQty: isArtist ? qty.single : 0,
      artistDoubleQty: isArtist ? qty.double : 0,
      vendorSingleQty: !isArtist ? qty.single : 0,
      vendorDoubleQty: !isArtist ? qty.double : 0,
      cornerCount: b.is_corner ? 1 : 0,
      artistCount: isArtist ? b.artist_count : 0,
      isVeteran: addForm.is_veteran,
      addOns: [],
    })
  })

  const totalAllBooths = boothPricings.reduce((sum, p) => sum + p.total, 0)

  const depositCents = addForm.payFull
    ? totalAllBooths
    : Math.round(Math.max(0, parseFloat(addForm.deposit) || 0) * 100)

  const handleAddBooth = async () => {
    if (!addForm.business_name || !addForm.contact_name || !addForm.email) {
      toast.error('Please fill in business name, contact name, and email')
      return
    }
    if (depositCents > totalAllBooths) {
      toast.error('Deposit cannot exceed total amount')
      return
    }
    setAddSaving(true)

    // Get active event
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('is_active', true)
      .single()
    if (!event) {
      toast.error('No active event found')
      setAddSaving(false)
      return
    }
    const { data: { user: adminUser } } = await supabase.auth.getUser()
    if (!adminUser) {
      toast.error('Not signed in')
      setAddSaving(false)
      return
    }

    // Create one application per booth entry
    const appIds: string[] = []
    const sizeToQty: Record<BoothSize, { single: number; double: number }> = {
      single: { single: 1, double: 0 },
      double: { single: 0, double: 1 },
      triple: { single: 1, double: 1 },
      quad: { single: 0, double: 2 },
    }
    for (let i = 0; i < addForm.booths.length; i++) {
      const b = addForm.booths[i]
      const pricing = boothPricings[i]
      const isArtist = addForm.exhibitor_type === 'artist'
      const qty = sizeToQty[b.size]
      const { data: appRow, error: appErr } = await supabase.from('applications').insert({
        event_id: event.id,
        user_id: adminUser.id,
        exhibitor_type: addForm.exhibitor_type,
        business_name: addForm.business_name,
        contact_name: addForm.contact_name,
        email: addForm.email,
        phone: addForm.phone || null,
        booth_size: null,
        artist_single_qty: isArtist ? qty.single : 0,
        artist_double_qty: isArtist ? qty.double : 0,
        vendor_single_qty: !isArtist ? qty.single : 0,
        vendor_double_qty: !isArtist ? qty.double : 0,
        corner_count: b.is_corner ? 1 : 0,
        add_ons: [],
        artist_count: isArtist ? b.artist_count : 0,
        is_corner: b.is_corner,
        is_veteran: addForm.is_veteran,
        total_amount: pricing.total,
        status: 'approved',
      }).select('id').single()

      if (appErr || !appRow) {
        toast.error(`Failed to create application for booth ${i + 1}`)
        setAddSaving(false)
        return
      }
      appIds.push(appRow.id)
    }

    // Create invoices - split deposit proportionally across booth entries
    for (let i = 0; i < appIds.length; i++) {
      const pricing = boothPricings[i]
      const proportion = totalAllBooths > 0 ? pricing.total / totalAllBooths : 0
      const thisDeposit = i === appIds.length - 1
        ? depositCents - appIds.slice(0, -1).reduce((sum, _, j) => sum + Math.round(depositCents * (boothPricings[j].total / totalAllBooths)), 0)
        : Math.round(depositCents * proportion)
      const fullyPaid = thisDeposit >= pricing.total
      // Unchecked before. This is the same revenue gap as the approve path in
      // /admin/applications: a silently failed insert leaves the application
      // created and the exhibitor never billed, with nothing surfacing it.
      // Detected after the fact by
      // supabase/verify/reconcile_approved_without_invoice.sql.
      const invRes = await guardedWrite(
        supabase.from('invoices').insert({
        application_id: appIds[i],
        amount: pricing.total,
        amount_paid: Math.min(thisDeposit, pricing.total),
        status: fullyPaid ? 'paid' : 'pending',
        paid_at: fullyPaid ? new Date().toISOString() : null,
      }).select('id'),
        `Invoice not created for booth ${i + 1}`,
        `admin/booths bulkInvoice app=${appIds[i]}`,
      )
      if (!invRes.ok) {
        toast.error(invRes.error)
        setAddSaving(false)
        return
      }
    }

    const boothLabel = addForm.booths.length > 1 ? `${addForm.booths.length} booths` : 'booth'
    toast.success(`${addForm.business_name} added (${boothLabel})${depositCents > 0 ? ` - ${formatCurrency(depositCents)} deposit recorded` : ''}`)
    setShowAddModal(false)
    setAddForm({
      business_name: '', contact_name: '', email: '', phone: '',
      exhibitor_type: 'artist', booths: [{ size: 'single', is_corner: false, artist_count: 1 }],
      is_veteran: false, deposit: '', payFull: false,
    })
    setAddSaving(false)
    window.location.reload()
  }

  useEffect(() => {
    const load = async () => {
      const [{ data: appData }, { data: boothData }, { data: invoiceData }] = await Promise.all([
        supabase
          .from('applications')
          .select('id, business_name, contact_name, exhibitor_type, booth_size, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, is_corner, artist_count, artists, artists_ids_later, invoices!inner(deposit_paid_at)')
          .eq('status', 'approved')
          .not('invoices.deposit_paid_at', 'is', null),
        supabase
          .from('booths')
          .select('id, booth_number, is_corner, status, application_id')
          .order('booth_number', { ascending: true }),
        supabase
          .from('invoices')
          .select('application_id, status'),
      ])
      // FCFS sort: deposit-paid time ascending (earliest deposit first).
      const sortedApps = ((appData ?? []) as unknown as Array<ApprovedApp & { invoices: { deposit_paid_at: string | null } | Array<{ deposit_paid_at: string | null }> }>)
        .map(a => {
          const inv = Array.isArray(a.invoices) ? a.invoices[0] : a.invoices
          return { ...a, _depositPaidAt: inv?.deposit_paid_at ?? null }
        })
        .sort((a, b) => (a._depositPaidAt ?? '').localeCompare(b._depositPaidAt ?? ''))
      setApps(sortedApps as unknown as ApprovedApp[])
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Booth Assignment</h1>
          <p className="mt-1 text-sm" style={{ color: '#999' }}>
            {apps.length} approved exhibitor{apps.length !== 1 ? 's' : ''} · {assignedCount} assigned · {apps.length - assignedCount} unassigned
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#8B7355' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add A Booth
        </button>
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
                const slotCount = boothSlotCount(app)
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
                    <span className="text-sm text-white">{describeBooths(app)}</span>

                    {/* Corner */}
                    <div className="flex items-center">
                      {app.is_corner ? (
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#8B7355' }} title="Corner booth" />
                      ) : (
                        <span className="text-xs" style={{ color: '#444' }}> - </span>
                      )}
                    </div>

                    {/* Artists */}
                    <span className="text-sm" style={{ color: '#999' }}>
                      {app.exhibitor_type === 'artist' ? app.artist_count : ' - '}
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
              267 booths - available / reserved / sold
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
                        ? `#${booth.booth_number} - ${apps.find(a => a.id === booth.application_id)?.business_name ?? 'Taken'}`
                        : `#${booth.booth_number} - Available`
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

      {/* Add A Booth Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            className="w-full max-w-lg overflow-y-auto rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', maxHeight: '90vh' }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">Add A Booth</h2>
              <button onClick={() => setShowAddModal(false)} className="text-sm" style={{ color: '#666' }}>✕</button>
            </div>

            <div className="space-y-4">
              {/* Business Name */}
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: '#999' }}>Business Name *</label>
                <input
                  type="text"
                  value={addForm.business_name}
                  onChange={e => setAddForm(f => ({ ...f, business_name: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                  style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                />
              </div>

              {/* Contact Name */}
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: '#999' }}>Contact Name *</label>
                <input
                  type="text"
                  value={addForm.contact_name}
                  onChange={e => setAddForm(f => ({ ...f, contact_name: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                  style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: '#999' }}>Email *</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                  style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: '#999' }}>Phone</label>
                <input
                  type="tel"
                  value={addForm.phone}
                  onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                  style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
                />
              </div>

              {/* Type Toggle */}
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: '#999' }}>Exhibitor Type</label>
                <div className="inline-flex rounded-lg p-1" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}>
                  {(['artist', 'vendor'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setAddForm(f => ({
                        ...f,
                        exhibitor_type: t,
                        booths: t === 'vendor' ? f.booths.map(b => ({ ...b, artist_count: 0 })) : f.booths.map(b => ({ ...b, artist_count: Math.max(1, b.artist_count) })),
                      }))}
                      className="rounded-md px-4 py-1.5 text-xs font-bold capitalize transition-colors"
                      style={{
                        backgroundColor: addForm.exhibitor_type === t ? '#8B7355' : 'transparent',
                        color: addForm.exhibitor_type === t ? '#fff' : '#666',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Booth Entries */}
              {addForm.booths.map((booth, idx) => (
                <div key={idx} className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#8B7355' }}>
                      Booth {addForm.booths.length > 1 ? `#${idx + 1}` : 'Size'}
                    </p>
                    {addForm.booths.length > 1 && (
                      <button
                        onClick={() => setAddForm(f => ({ ...f, booths: f.booths.filter((_, i) => i !== idx) }))}
                        className="text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ color: '#f87171' }}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="inline-flex rounded-lg p-1" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                    {(['single', 'double', 'triple', 'quad'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setAddForm(f => ({ ...f, booths: f.booths.map((b, i) => i === idx ? { ...b, size: s, artist_count: Math.min(b.artist_count, MAX_ARTISTS[s] ?? 2) } : b) }))}
                        className="rounded-md px-3 py-1.5 text-xs font-bold capitalize transition-colors"
                        style={{
                          backgroundColor: booth.size === s ? '#8B7355' : 'transparent',
                          color: booth.size === s ? '#fff' : '#666',
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm text-white">
                      <input
                        type="checkbox"
                        checked={booth.is_corner}
                        onChange={e => setAddForm(f => ({ ...f, booths: f.booths.map((b, i) => i === idx ? { ...b, is_corner: e.target.checked } : b) }))}
                      />
                      Corner
                    </label>
                    {addForm.exhibitor_type === 'artist' && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold" style={{ color: '#999' }}>Artists</label>
                        <input
                          type="number"
                          min={1}
                          max={MAX_ARTISTS[booth.size] ?? 2}
                          value={booth.artist_count}
                          onChange={e => setAddForm(f => ({ ...f, booths: f.booths.map((b, i) => i === idx ? { ...b, artist_count: Math.min(MAX_ARTISTS[b.size] ?? 2, Math.max(1, parseInt(e.target.value) || 1)) } : b) }))}
                          className="w-16 rounded-lg px-2 py-1 text-sm text-white outline-none"
                          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                        />
                        <span className="text-[10px]" style={{ color: '#555' }}>max {MAX_ARTISTS[booth.size] ?? 2}</span>
                      </div>
                    )}
                  </div>

                  {/* Per-booth pricing */}
                  <div className="text-xs" style={{ color: '#999' }}>
                    Subtotal: <span className="font-bold text-white">{formatCurrency(boothPricings[idx]?.total ?? 0)}</span>
                  </div>
                </div>
              ))}

              {/* Add More Booths */}
              <button
                onClick={() => setAddForm(f => ({ ...f, booths: [...f.booths, { size: 'single', is_corner: false, artist_count: 1 }] }))}
                className="text-xs font-bold transition-opacity hover:opacity-80"
                style={{ color: '#C4A882' }}
              >
                + Add More Booths
              </button>

              {/* Veteran Discount */}
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={addForm.is_veteran}
                  onChange={e => setAddForm(f => ({ ...f, is_veteran: e.target.checked }))}
                />
                Veteran Discount
              </label>

              {/* Combined Pricing */}
              <div className="rounded-xl p-4" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: '#8B7355' }}>Pricing</p>
                {boothPricings.map((pricing, idx) => (
                  <div key={idx}>
                    {addForm.booths.length > 1 && (
                      <p className="mt-1 text-[10px] font-bold uppercase" style={{ color: '#666' }}>
                        Booth #{idx + 1} ({addForm.booths[idx].size})
                      </p>
                    )}
                    {pricing.itemized.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span style={{ color: '#999' }}>{item.label}</span>
                        <span className="font-medium text-white">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t pt-2 text-sm font-bold" style={{ borderColor: '#2a2a2a' }}>
                  <span style={{ color: '#C4A882' }}>Total</span>
                  <span style={{ color: '#C4A882' }}>{formatCurrency(totalAllBooths)}</span>
                </div>
              </div>

              {/* Payment / Deposit */}
              <div className="rounded-xl p-4" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: '#8B7355' }}>Payment</p>

                <label className="mb-3 flex items-center gap-2 text-sm text-white">
                  <input
                    type="checkbox"
                    checked={addForm.payFull}
                    onChange={e => setAddForm(f => ({ ...f, payFull: e.target.checked, deposit: '' }))}
                  />
                  Pay in Full - {formatCurrency(totalAllBooths)}
                </label>

                {!addForm.payFull && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold" style={{ color: '#999' }}>Deposit Amount</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white">$</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        value={addForm.deposit}
                        onChange={e => setAddForm(f => ({ ...f, deposit: e.target.value }))}
                        className="w-32 rounded-lg px-3 py-2 text-sm text-white outline-none"
                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                      />
                    </div>
                    {depositCents > 0 && (
                      <p className="mt-2 text-xs" style={{ color: '#999' }}>
                        Balance remaining: {formatCurrency(totalAllBooths - depositCents)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ color: '#999' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddBooth}
                disabled={addSaving}
                className="rounded-lg px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#8B7355' }}
              >
                {addSaving ? 'Saving…' : `Add Booth${depositCents > 0 ? ` + ${formatCurrency(depositCents)} Deposit` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
