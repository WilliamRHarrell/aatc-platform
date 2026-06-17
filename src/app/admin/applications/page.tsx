'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { describeBooths } from '@/lib/booth-display'
import type { Database } from '@/types/database'

// The `artists` column is stored as JSON; describe its real shape here so the
// regenerated Json type doesn't break array access throughout this file.
type ArtistEntry = {
  id_url?: string | null
  name?: string | null
  instagram?: string | null
  [key: string]: unknown
}
type Application = Omit<Database['public']['Tables']['applications']['Row'], 'artists'> & {
  artists: ArtistEntry[] | null
}

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

function InstagramLink({ handle }: { handle: string | null }) {
  if (!handle) return null
  const clean = handle.replace(/^@/, '')
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8B7355' }}>Instagram</p>
      <a
        href={`https://instagram.com/${clean}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-0.5 inline-flex items-center gap-1 text-sm transition-colors"
        style={{ color: '#C4A882' }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#fff')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
      >
        @{clean}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
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
  const [artistSignedUrls, setArtistSignedUrls] = useState<(string | null)[]>([])
  const [veteranIdUrl, setVeteranIdUrl]         = useState<string | null>(null)
  const [discountEnabled, setDiscountEnabled]   = useState(false)
  const [discountDollars, setDiscountDollars]   = useState('')
  const [compEnabled, setCompEnabled]           = useState(false)

  // Computed invoice amount (cents)
  const discountCents = discountEnabled && discountDollars
    ? Math.round(Math.max(0, parseFloat(discountDollars) || 0) * 100)
    : 0
  const invoiceAmount = compEnabled ? 0 : Math.max(0, app.total_amount - discountCents)

  // Generate signed URLs for documents
  useEffect(() => {
    const getUrls = async () => {
      // Per-artist IDs (new format)
      if (app.artists && app.artists.length > 0) {
        const urls = await Promise.all(
          app.artists.map(async (a) => {
            if (!a.id_url) return null
            const { data } = await supabase.storage
              .from('application-docs')
              .createSignedUrl(a.id_url, 3600)
            return data?.signedUrl ?? null
          })
        )
        setArtistSignedUrls(urls)
      } else if (app.id_doc_url) {
        // Legacy single ID doc
        const { data } = await supabase.storage
          .from('application-docs')
          .createSignedUrl(app.id_doc_url, 3600)
        setArtistSignedUrls([data?.signedUrl ?? null])
      }
      // Veteran ID
      if (app.veteran_id_url) {
        const { data } = await supabase.storage
          .from('application-docs')
          .createSignedUrl(app.veteran_id_url, 3600)
        setVeteranIdUrl(data?.signedUrl ?? null)
      }
    }
    getUrls()
  }, [app.id])

  const FINAL_DUE_AT = '2027-01-01T05:00:00Z' // 2027-01-01 00:00 America/New_York

  const handleResetPassword = async (email: string) => {
    if (!email) { toast.error('No email on file'); return }
    const res = await fetch('/api/admin/reset-user-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed to generate reset link'); return }
    try {
      await navigator.clipboard.writeText(json.resetLink)
      toast.success('Reset link copied to clipboard. Send it to the user.')
    } catch {
      // Fallback: show the link inline if clipboard API fails
      toast.success('Link generated. Check the browser console.')
      console.log('Reset link:', json.resetLink)
    }
  }

  const updateStatus = async (newStatus: Application['status']) => {
    setWorking(true)

    if (newStatus === 'approved') {
      const now = new Date()
      const depositDueAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      const { data: updatedApp, error: appErr } = await supabase
        .from('applications')
        .update({
          status: 'approved',
          approved_at: now.toISOString(),
          deposit_due_at: depositDueAt.toISOString(),
          final_due_at: FINAL_DUE_AT,
        })
        .eq('id', app.id)
        .select('id, total_amount')
        .single()

      if (appErr || !updatedApp) {
        toast.error('Failed to approve application')
        setWorking(false)
        return
      }

      // Create invoice if not present
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('application_id', app.id)
        .maybeSingle()

      if (!existing) {
        const { error: invErr } = await supabase.from('invoices').insert({
          application_id: app.id,
          amount: compEnabled ? 0 : invoiceAmount,
          amount_paid: 0,
          status: compEnabled ? 'paid' : 'pending',
        })
        if (invErr) {
          toast.error('Approved, but failed to create invoice — fix manually in admin/invoices')
          setWorking(false)
          return
        }
      }
    } else {
      const { error } = await supabase
        .from('applications')
        .update({ status: newStatus })
        .eq('id', app.id)

      if (error) {
        toast.error('Failed to update status')
        setWorking(false)
        return
      }
    }

    // Send email notification for terminal status changes
    if (newStatus === 'approved' || newStatus === 'rejected' || newStatus === 'waitlisted') {
      fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: app.id, status: newStatus }),
      }).catch(err => console.error('Email send failed:', err))
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
              <InstagramLink handle={app.instagram} />
              <Field label="Facebook"     value={app.facebook} />
              <Field label="Other links"  value={app.other_links} />
            </div>
          </section>

          <div style={{ borderTop: '1px solid #2a2a2a' }} />

          {/* Booth */}
          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>Booth</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Size"          value={describeBooths(app)} />
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
          {(app.artists || app.id_doc_url || app.veteran_id_url || app.artists_ids_later) && (
            <>
              <div style={{ borderTop: '1px solid #2a2a2a' }} />
              <section>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>Documents</p>
                <div className="space-y-2">
                  {/* Per-artist IDs */}
                  {app.artists_ids_later && (
                    <p className="text-sm" style={{ color: '#eab308' }}>Artist IDs pending — to be collected before event</p>
                  )}
                  {app.artists && app.artists.map((a, i) => (
                    <div key={i} className="rounded-lg px-4 py-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                      <p className="mb-1 text-xs font-semibold" style={{ color: '#8B7355' }}>Artist {i + 1}{a.name ? ` — ${a.name}` : ''}</p>
                      {artistSignedUrls[i] ? (
                        <a
                          href={artistSignedUrls[i]!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm transition-colors"
                          style={{ color: '#C4A882' }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#fff')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          View ID
                        </a>
                      ) : (
                        <p className="text-xs" style={{ color: '#555' }}>No ID uploaded</p>
                      )}
                    </div>
                  ))}
                  {/* Veteran ID */}
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
          <div className="px-6 py-5 space-y-4" style={{ borderTop: '1px solid #2a2a2a' }}>

            {/* Discount / Comp options */}
            <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
              {/* Discount row */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="discount-check"
                  checked={discountEnabled}
                  onChange={e => {
                    setDiscountEnabled(e.target.checked)
                    if (e.target.checked) setCompEnabled(false)
                  }}
                  className="h-4 w-4 cursor-pointer rounded"
                  style={{ accentColor: '#8B7355' }}
                />
                <label htmlFor="discount-check" className="cursor-pointer text-sm font-semibold text-white">
                  Discount Booth
                </label>
                {discountEnabled && (
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-sm font-semibold" style={{ color: '#8B7355' }}>$</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={discountDollars}
                      onChange={e => setDiscountDollars(e.target.value)}
                      className="w-24 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
                      style={{ backgroundColor: '#1a1a1a', border: '1px solid #8B7355' }}
                    />
                    <span className="text-xs" style={{ color: '#555' }}>off</span>
                  </div>
                )}
              </div>

              {/* Comp row */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="comp-check"
                  checked={compEnabled}
                  onChange={e => {
                    setCompEnabled(e.target.checked)
                    if (e.target.checked) { setDiscountEnabled(false); setDiscountDollars('') }
                  }}
                  className="h-4 w-4 cursor-pointer rounded"
                  style={{ accentColor: '#8B7355' }}
                />
                <label htmlFor="comp-check" className="cursor-pointer text-sm font-semibold text-white">
                  Comp Booth
                </label>
                <span className="text-xs" style={{ color: '#555' }}>waives full amount — auto-marks invoice paid</span>
              </div>

              {/* Running total */}
              {(discountEnabled || compEnabled) && (
                <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid #2a2a2a' }}>
                  <span className="text-xs" style={{ color: '#999' }}>Invoice total after adjustment</span>
                  <span className="text-sm font-bold" style={{ color: invoiceAmount === 0 ? '#4ade80' : '#C4A882' }}>
                    {invoiceAmount === 0 ? 'COMPED' : formatCurrency(invoiceAmount)}
                  </span>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
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
                {working ? 'Saving…' : compEnabled ? 'Comp & Approve' : 'Approve'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleResetPassword(app.email)}
              className="w-full rounded-lg py-2.5 text-xs font-semibold transition-colors"
              style={{ backgroundColor: '#0a0a0a', color: '#999', border: '1px solid #2a2a2a' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#fff')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999')}
            >
              Reset password
            </button>
          </div>
        )}

        {app.status !== 'pending' && (
          <div className="flex flex-col gap-2 px-6 py-5" style={{ borderTop: '1px solid #2a2a2a' }}>
            {app.status === 'approved' && (
              <Link
                href="/admin/booths"
                className="flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-opacity"
                style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
              >
                Assign Booth
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </Link>
            )}
            <button
              onClick={() => updateStatus('pending')}
              disabled={working}
              className="w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#1a1a1a', color: '#999', border: '1px solid #2a2a2a' }}
            >
              {working ? 'Saving…' : 'Move back to Pending'}
            </button>
            <button
              type="button"
              onClick={() => handleResetPassword(app.email)}
              className="w-full rounded-lg py-2.5 text-xs font-semibold transition-colors"
              style={{ backgroundColor: '#0a0a0a', color: '#999', border: '1px solid #2a2a2a' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#fff')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999')}
            >
              Reset password
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
                        {app.exhibitor_type} · {describeBooths(app)}
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
                    <span className="text-sm text-white">{describeBooths(app)}</span>
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
