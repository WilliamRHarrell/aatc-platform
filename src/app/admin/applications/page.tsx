'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Database } from '@/types/database'

type Application = Database['public']['Tables']['applications']['Row']
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'waitlisted'
type TypeFilter   = 'all' | 'artist' | 'vendor'

// ── Helpers ───────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    pending:    { bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
    approved:   { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
    rejected:   { bg: 'rgba(248,113,113,0.15)',color: '#f87171' },
    waitlisted: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
  }
  const s = map[status] ?? { bg: 'rgba(255,255,255,0.1)', color: '#999' }
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
      style={{ backgroundColor: s.bg, color: s.color }}>
      {status}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
      style={{
        backgroundColor: type === 'artist' ? 'rgba(139,115,85,0.2)' : 'rgba(96,165,250,0.15)',
        color: type === 'artist' ? '#C4A882' : '#60a5fa',
      }}>
      {type}
    </span>
  )
}

function Field({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === null || value === undefined || value === '') return null
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8B7355' }}>{label}</p>
      <p className="mt-0.5 text-sm text-white break-words">{display}</p>
    </div>
  )
}

// ── Detail Drawer ─────────────────────────────────────────────
function DetailDrawer({
  app,
  onClose,
  onStatusChange,
}: {
  app: Application
  onClose: () => void
  onStatusChange: (id: string, status: Application['status']) => void
}) {
  const supabase = createClient()
  const [working, setWorking] = useState(false)
  const [idDocUrl, setIdDocUrl]         = useState<string | null>(null)
  const [veteranIdUrl, setVeteranIdUrl] = useState<string | null>(null)

  // Generate signed URLs for documents
  useEffect(() => {
    const getUrls = async () => {
      if (app.id_doc_url) {
        const { data } = await supabase.storage
          .from('application-docs')
          .createSignedUrl(app.id_doc_url, 3600)
        setIdDocUrl(data?.signedUrl ?? null)
      }
      if (app.veteran_id_url) {
        const { data } = await supabase.storage
          .from('application-docs')
          .createSignedUrl(app.veteran_id_url, 3600)
        setVeteranIdUrl(data?.signedUrl ?? null)
      }
    }
    getUrls()
  }, [app.id])

  const updateStatus = async (newStatus: Application['status']) => {
    setWorking(true)
    const { error } = await supabase
      .from('applications')
      .update({ status: newStatus })
      .eq('id', app.id)

    if (error) {
      toast.error('Failed to update status')
      setWorking(false)
      return
    }

    // On approval, create invoice if one doesn't exist
    if (newStatus === 'approved') {
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('application_id', app.id)
        .single()

      if (!existing) {
        await supabase.from('invoices').insert({
          application_id: app.id,
          amount: app.total_amount,
          status: 'pending',
        })
      }
    }

    toast.success(`Application ${newStatus}`)
    onStatusChange(app.id, newStatus)
    setWorking(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 z-40 flex h-full w-full max-w-lg flex-col overflow-y-auto shadow-2xl"
        style={{ backgroundColor: '#111111', borderLeft: '1px solid #2a2a2a' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5" style={{ borderBottom: '1px solid #2a2a2a' }}>
          <div>
            <div className="flex items-center gap-2">
              <TypeBadge type={app.exhibitor_type} />
              <StatusBadge status={app.status} />
            </div>
            <h2 className="font-display mt-2 text-xl font-bold text-white">{app.business_name}</h2>
            <p className="text-sm" style={{ color: '#999' }}>
              {new Date(app.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="mt-1 shrink-0 rounded-lg p-1.5 transition-colors"
            style={{ color: '#999' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#fff')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 px-6 py-5">
          {/* Contact */}
          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>Contact</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact name" value={app.contact_name} />
              <Field label="Email"        value={app.email} />
              <Field label="Phone"        value={app.phone} />
              <Field label="Website"      value={app.website} />
              <Field label="Instagram"    value={app.instagram ? `@${app.instagram}` : null} />
              <Field label="Facebook"     value={app.facebook} />
              <Field label="Other links"  value={app.other_links} />
            </div>
          </section>

          <div style={{ borderTop: '1px solid #2a2a2a' }} />

          {/* Booth */}
          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>Booth</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Size"          value={app.booth_size} />
              {app.exhibitor_type === 'artist' && (
                <Field label="Artists" value={app.artist_count} />
              )}
              <Field label="Corner booth"  value={app.is_corner} />
              <Field label="Veteran"       value={app.is_veteran} />
            </div>
          </section>

          <div style={{ borderTop: '1px solid #2a2a2a' }} />

          {/* Pricing */}
          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>Pricing</p>
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
            >
              <span className="text-sm text-white">Total invoiced amount</span>
              <span className="font-display text-lg font-bold" style={{ color: '#8B7355' }}>
                {formatCurrency(app.total_amount)}
              </span>
            </div>
          </section>

          {/* Additional info */}
          {(app.tv_show || app.notes) && (
            <>
              <div style={{ borderTop: '1px solid #2a2a2a' }} />
              <section>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>Additional Info</p>
                <div className="space-y-3">
                  <Field label="TV show experience" value={app.tv_show} />
                  <Field label="Notes"              value={app.notes} />
                </div>
              </section>
            </>
          )}

          {/* Documents */}
          {(app.id_doc_url || app.veteran_id_url) && (
            <>
              <div style={{ borderTop: '1px solid #2a2a2a' }} />
              <section>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>Documents</p>
                <div className="space-y-2">
                  {idDocUrl && (
                    <a
                      href={idDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#C4A882' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#8B7355')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a')}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      View Government ID
                    </a>
                  )}
                  {veteranIdUrl && (
                    <a
                      href={veteranIdUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#C4A882' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#8B7355')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a')}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      View Veteran ID
                    </a>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Action buttons */}
        {app.status === 'pending' && (
          <div className="flex gap-3 px-6 py-5" style={{ borderTop: '1px solid #2a2a2a' }}>
            <button
              onClick={() => updateStatus('rejected')}
              disabled={working}
              className="flex-1 rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
            >
              Reject
            </button>
            <button
              onClick={() => updateStatus('waitlisted')}
              disabled={working}
              className="flex-1 rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}
            >
              Waitlist
            </button>
            <button
              onClick={() => updateStatus('approved')}
              disabled={working}
              className="flex-1 rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
            >
              {working ? 'Saving…' : 'Approve'}
            </button>
          </div>
        )}

        {app.status !== 'pending' && (
          <div className="px-6 py-5" style={{ borderTop: '1px solid #2a2a2a' }}>
            <button
              onClick={() => updateStatus('pending')}
              disabled={working}
              className="w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#1a1a1a', color: '#999', border: '1px solid #2a2a2a' }}
            >
              {working ? 'Saving…' : 'Move back to Pending'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function AdminApplicationsPage() {
  const supabase = createClient()
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading]           = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter]     = useState<TypeFilter>('all')
  const [search, setSearch]             = useState('')
  const [selected, setSelected]         = useState<Application | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false })
      setApplications((data as Application[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const handleStatusChange = (id: string, newStatus: Application['status']) => {
    setApplications(prev =>
      prev.map(a => a.id === id ? { ...a, status: newStatus } : a)
    )
    // Update drawer if still open
    setSelected(prev => prev?.id === id ? { ...prev, status: newStatus } : prev)
  }

  const filtered = useMemo(() => {
    return applications.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (typeFilter   !== 'all' && a.exhibitor_type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          a.business_name.toLowerCase().includes(q) ||
          a.contact_name.toLowerCase().includes(q)  ||
          a.email.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [applications, statusFilter, typeFilter, search])

  const counts = useMemo(() => ({
    all:        applications.length,
    pending:    applications.filter(a => a.status === 'pending').length,
    approved:   applications.filter(a => a.status === 'approved').length,
    rejected:   applications.filter(a => a.status === 'rejected').length,
    waitlisted: applications.filter(a => a.status === 'waitlisted').length,
  }), [applications])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Applications</h1>
        <p className="mt-1 text-sm" style={{ color: '#999' }}>{applications.length} total</p>
      </div>

      {/* Filters row */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg py-2.5 pl-9 pr-4 text-sm text-white outline-none"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
            onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
          />
        </div>

        {/* Type toggle */}
        <div className="flex rounded-lg p-1" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          {(['all', 'artist', 'vendor'] as TypeFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className="rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors"
              style={{
                backgroundColor: typeFilter === t ? '#8B7355' : 'transparent',
                color: typeFilter === t ? '#fff' : '#999',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Status tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto">
        {([
          { key: 'all',        label: 'All' },
          { key: 'pending',    label: 'Pending' },
          { key: 'approved',   label: 'Approved' },
          { key: 'rejected',   label: 'Rejected' },
          { key: 'waitlisted', label: 'Waitlisted' },
        ] as { key: StatusFilter; label: string }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: statusFilter === tab.key ? 'rgba(139,115,85,0.15)' : 'transparent',
              color: statusFilter === tab.key ? '#C4A882' : '#999',
              border: `1px solid ${statusFilter === tab.key ? 'rgba(139,115,85,0.3)' : 'transparent'}`,
            }}
          >
            {tab.label}
            <span
              className="rounded-full px-1.5 py-0.5 text-xs"
              style={{ backgroundColor: '#2a2a2a', color: '#999' }}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #2a2a2a' }}>
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ backgroundColor: '#1a1a1a', color: '#555' }}>
            No applications match your filters
          </div>
        ) : (
          <>
            {/* Desktop table header */}
            <div
              className="hidden grid-cols-[1fr_80px_80px_90px_90px_100px_40px] items-center gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-widest sm:grid"
              style={{ backgroundColor: '#111', color: '#555', borderBottom: '1px solid #2a2a2a' }}
            >
              <span>Business</span>
              <span>Type</span>
              <span>Booth</span>
              <span>Artists</span>
              <span>Total</span>
              <span>Status</span>
              <span />
            </div>

            <div className="divide-y" style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}>
              {filtered.map(app => (
                <button
                  key={app.id}
                  onClick={() => setSelected(app)}
                  className="w-full text-left transition-colors hover:bg-white/5"
                >
                  {/* Mobile card */}
                  <div className="flex items-center justify-between gap-4 px-5 py-4 sm:hidden">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{app.business_name}</p>
                      <p className="text-xs capitalize" style={{ color: '#999' }}>
                        {app.exhibitor_type} · {app.booth_size}
                        {app.exhibitor_type === 'artist' ? ` · ${app.artist_count} artist${app.artist_count !== 1 ? 's' : ''}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={app.status} />
                      <span className="text-xs font-medium" style={{ color: '#C4A882' }}>{formatCurrency(app.total_amount)}</span>
                    </div>
                  </div>

                  {/* Desktop row */}
                  <div className="hidden grid-cols-[1fr_80px_80px_90px_90px_100px_40px] items-center gap-4 px-5 py-3.5 sm:grid">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{app.business_name}</p>
                      <p className="truncate text-xs" style={{ color: '#999' }}>{app.email}</p>
                    </div>
                    <TypeBadge type={app.exhibitor_type} />
                    <span className="text-sm capitalize text-white">{app.booth_size}</span>
                    <span className="text-sm" style={{ color: '#999' }}>
                      {app.exhibitor_type === 'artist' ? app.artist_count : '—'}
                    </span>
                    <span className="text-sm font-medium" style={{ color: '#C4A882' }}>{formatCurrency(app.total_amount)}</span>
                    <StatusBadge status={app.status} />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <DetailDrawer
          app={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </>
  )
}
