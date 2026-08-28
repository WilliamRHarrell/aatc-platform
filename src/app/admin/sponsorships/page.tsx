'use client'

import { useEffect, useState, useMemo } from 'react'
import { SPONSOR_TIERS as TIER_INFO, ALL_TIERS, type SponsorTier } from '@/lib/sponsor-tiers'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { requestRevalidate } from '@/lib/revalidate'

type SponsorStatus = 'pending' | 'confirmed' | 'cancelled'

interface Sponsorship {
  id: string
  event_id: string
  sponsor_name: string
  tier: SponsorTier
  logo_url: string | null
  website: string | null
  amount: number
  status: SponsorStatus
  created_at: string
  contact_name: string | null
  email: string | null
  phone: string | null
  instagram: string | null
  facebook: string | null
  notes: string | null
  user_id: string | null
  additional_items: string[]
  featured_footer: boolean
  show_on_homepage: boolean
  homepage_order: number | null
  is_in_kind: boolean
  amount_locked: boolean
  hold_expires_at: string | null
}

interface SponsorInvoice {
  id: string
  sponsorship_id: string
  amount: number
  amount_paid: number
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  created_at: string
}



const STATUS_STYLE: Record<SponsorStatus, { bg: string; color: string }> = {
  pending:   { bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
  confirmed: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
  cancelled: { bg: 'rgba(153,153,153,0.15)', color: '#999' },
}

const INVOICE_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:   { bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
  paid:      { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
  overdue:   { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  cancelled: { bg: 'rgba(153,153,153,0.15)', color: '#999' },
}

interface FormState {
  sponsor_name: string
  tier: SponsorTier
  website: string
  status: SponsorStatus
  contact_name: string
  email: string
  phone: string
  instagram: string
  facebook: string
  notes: string
}

const EMPTY_FORM: FormState = { sponsor_name: '', tier: 'brass', website: '', status: 'pending', contact_name: '', email: '', phone: '', instagram: '', facebook: '', notes: '' }

export default function AdminSponsorshipsPage() {
  const supabase = createClient()
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([])
  const [invoiceMap, setInvoiceMap] = useState<Map<string, SponsorInvoice>>(new Map())
  const [loading, setLoading] = useState(true)
  const [eventId, setEventId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [working, setWorking] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [filter, setFilter] = useState<'all' | SponsorStatus | 'stale'>('all')
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  // Account linking — replaces the removed email-only self-claim.
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [linkEmail, setLinkEmail] = useState('')
  const [linkWorking, setLinkWorking] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .single()

      if (!event) { setLoading(false); return }
      setEventId(event.id)

      const { data } = await supabase
        .from('sponsorships')
        .select('*')
        .eq('event_id', event.id)
        .order('amount', { ascending: false })

      const sponsors = (data as unknown as Sponsorship[]) ?? []
      setSponsorships(sponsors)

      // Fetch invoices for these sponsorships
      const sponsorIds = sponsors.map(s => s.id)
      if (sponsorIds.length > 0) {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('id, sponsorship_id, amount, amount_paid, status, created_at')
          .in('sponsorship_id', sponsorIds)

        const map = new Map<string, SponsorInvoice>()
        for (const inv of (invoices ?? []) as unknown as SponsorInvoice[]) {
          if (inv.sponsorship_id) map.set(inv.sponsorship_id, inv)
        }
        setInvoiceMap(map)
      }

      setLoading(false)
    }
    load()
  }, [])

  // The row currently open in the edit form, for the amount-lock notice.
  const editingRow = editing ? sponsorships.find(sp => sp.id === editing) : undefined

  /** A pending offer whose hold has lapsed — the slot is being held for nobody. */
  const isStaleHold = (s: Sponsorship) =>
    s.status === 'pending' && !!s.hold_expires_at && new Date(s.hold_expires_at) < new Date()

  const filtered = useMemo(() => {
    if (filter === 'all') return sponsorships
    if (filter === 'stale') return sponsorships.filter(isStaleHold)
    return sponsorships.filter(s => s.status === filter)
  }, [sponsorships, filter])

  const counts = useMemo(() => ({
    all: sponsorships.length,
    pending: sponsorships.filter(s => s.status === 'pending').length,
    confirmed: sponsorships.filter(s => s.status === 'confirmed').length,
    cancelled: sponsorships.filter(s => s.status === 'cancelled').length,
    stale: sponsorships.filter(isStaleHold).length,
  }), [sponsorships])

  const totalConfirmed = useMemo(
    () => sponsorships.filter(s => s.status === 'confirmed').reduce((sum, s) => sum + s.amount, 0),
    [sponsorships]
  )

  const totalPending = useMemo(
    () => sponsorships.filter(s => s.status === 'pending').reduce((sum, s) => sum + s.amount, 0),
    [sponsorships]
  )

  const startAdd = () => {
    setForm(EMPTY_FORM)
    setLogoFile(null)
    setAdding(true)
    setEditing(null)
  }

  const startEdit = (s: Sponsorship) => {
    setForm({
      sponsor_name: s.sponsor_name,
      tier: s.tier,
      website: s.website ?? '',
      status: s.status,
      contact_name: s.contact_name ?? '',
      email: s.email ?? '',
      phone: s.phone ?? '',
      instagram: s.instagram ?? '',
      facebook: s.facebook ?? '',
      notes: s.notes ?? '',
    })
    setLogoFile(null)
    setEditing(s.id)
    setAdding(false)
  }

  const uploadLogo = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop()
    const path = `sponsors/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage
      .from('exhibitor-media')
      .upload(path, file)
    if (error || !data) return null
    const { data: urlData } = supabase.storage.from('exhibitor-media').getPublicUrl(data.path)
    return urlData.publicUrl
  }

  const handleSave = async () => {
    if (!eventId || !form.sponsor_name.trim()) {
      toast.error('Sponsor name is required')
      return
    }

    setWorking(true)
    let logo_url: string | null = null
    if (logoFile) {
      logo_url = await uploadLogo(logoFile)
      if (!logo_url) {
        toast.error('Failed to upload logo')
        setWorking(false)
        return
      }
    }

    const tierAmount = TIER_INFO[form.tier].amount

    // Grandfathered amounts are historical commitments. Without this guard,
    // editing a phone number would silently reprice the sponsorship to current
    // packet pricing (migration 036).
    const lockedRow = editing ? sponsorships.find(sp => sp.id === editing) : undefined
    const amountIsLocked = !!lockedRow?.amount_locked

    if (editing) {
      const updateData: Record<string, unknown> = {
        sponsor_name: form.sponsor_name.trim(),
        tier: form.tier,
        website: form.website.trim() || null,
        status: form.status,
        ...(amountIsLocked ? {} : { amount: tierAmount }),
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (logo_url) updateData.logo_url = logo_url

      const { error } = await supabase
        .from('sponsorships')
        .update(updateData)
        .eq('id', editing)

      if (error) {
        toast.error('Failed to update sponsor')
      } else {
        setSponsorships(prev =>
          prev.map(s => s.id === editing ? { ...s, ...updateData, logo_url: logo_url ?? s.logo_url } as Sponsorship : s)
        )
        setEditing(null)
        toast.success('Sponsor updated')
      }
    } else {
      const { data, error } = await supabase
        .from('sponsorships')
        .insert({
          event_id: eventId,
          sponsor_name: form.sponsor_name.trim(),
          tier: form.tier,
          website: form.website.trim() || null,
          status: form.status,
          amount: tierAmount,
          logo_url,
          contact_name: form.contact_name.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          instagram: form.instagram.trim() || null,
          facebook: form.facebook.trim() || null,
          notes: form.notes.trim() || null,
        })
        .select('*')
        .single()

      if (error || !data) {
        toast.error('Failed to add sponsor')
      } else {
        setSponsorships(prev => [...prev, data as unknown as Sponsorship].sort((a, b) => b.amount - a.amount))
        setAdding(false)
        toast.success('Sponsor added')
      }
    }

    setForm(EMPTY_FORM)
    setLogoFile(null)
    setWorking(false)
  }

  /**
   * Link a sponsorship to an existing account. The account must already exist
   * — see the route for why we do not create one here.
   */
  const submitLink = async (sponsorshipId: string) => {
    if (!linkEmail.trim()) { toast.error('Enter the account email'); return }
    setLinkWorking(true)
    try {
      const res = await fetch('/api/admin/link-sponsor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorshipId, email: linkEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Could not link the account')
        return
      }
      setSponsorships(prev => prev.map(x => x.id === sponsorshipId ? { ...x, user_id: data.userId } : x))
      setLinkingId(null)
      setLinkEmail('')
      toast.success(`Linked to ${data.email}`)
    } catch {
      toast.error('Could not link the account')
    } finally {
      setLinkWorking(false)
    }
  }

  const submitUnlink = async (sponsorshipId: string) => {
    if (!window.confirm('Unlink this account? They will lose access to their sponsor profile in the portal.')) return
    setLinkWorking(true)
    try {
      const res = await fetch('/api/admin/link-sponsor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorshipId, unlink: true }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Could not unlink'); return }
      setSponsorships(prev => prev.map(x => x.id === sponsorshipId ? { ...x, user_id: null } : x))
      toast.success('Account unlinked')
    } catch {
      toast.error('Could not unlink')
    } finally {
      setLinkWorking(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    const { error } = await supabase.from('sponsorships').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete sponsor')
    } else {
      setSponsorships(prev => prev.filter(s => s.id !== id))
      toast.success('Sponsor removed')
    }
    setDeleting(null)
  }

  const handleSendInvoice = async (s: Sponsorship) => {
    const existing = invoiceMap.get(s.id)
    if (existing && existing.status !== 'cancelled') {
      toast.error('An invoice already exists for this sponsor')
      return
    }

    setSendingInvoice(s.id)

    const { data: inv, error } = await supabase
      .from('invoices')
      .insert({
        sponsorship_id: s.id,
        amount: s.amount,
        status: 'pending',
      })
      .select('id, sponsorship_id, amount, amount_paid, status, created_at')
      .single()

    if (error || !inv) {
      toast.error('Failed to create invoice')
    } else {
      setInvoiceMap(prev => {
        const next = new Map(prev)
        next.set(s.id, inv as unknown as SponsorInvoice)
        return next
      })
      toast.success(`Invoice created for ${s.sponsor_name}`)
    }

    setSendingInvoice(null)
  }

  const handleApprove = async (s: Sponsorship) => {
    setApprovingId(s.id)

    const { error: updateError } = await supabase
      .from('sponsorships')
      .update({ status: 'confirmed' })
      .eq('id', s.id)

    if (updateError) {
      toast.error('Failed to approve sponsor')
      setApprovingId(null)
      return
    }

    const { data: inv, error: invError } = await supabase
      .from('invoices')
      .insert({ sponsorship_id: s.id, amount: s.amount, status: 'pending' })
      .select('id, sponsorship_id, amount, amount_paid, status, created_at')
      .single()

    if (invError || !inv) {
      toast.error('Sponsor approved but failed to create invoice')
    } else {
      setInvoiceMap(prev => {
        const next = new Map(prev)
        next.set(s.id, inv as unknown as SponsorInvoice)
        return next
      })
    }

    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorshipId: s.id, status: 'approved' }),
      })
    } catch {
      // Email send is best-effort
    }

    setSponsorships(prev =>
      prev.map(sp => sp.id === s.id ? { ...sp, status: 'confirmed' as SponsorStatus } : sp)
    )
    toast.success(`${s.sponsor_name} approved`)
    setApprovingId(null)
  }

  const toggleFooter = async (s: Sponsorship) => {
    const newVal = !s.featured_footer
    const currentFeatured = sponsorships.filter(sp => sp.featured_footer && sp.id !== s.id).length
    if (newVal && currentFeatured >= 5) {
      toast.error('Max 5 footer sponsors - remove one first')
      return
    }
    const { error } = await supabase
      .from('sponsorships')
      .update({ featured_footer: newVal })
      .eq('id', s.id)
    if (error) { toast.error('Failed to update'); return }
    setSponsorships(prev =>
      prev.map(sp => sp.id === s.id ? { ...sp, featured_footer: newVal } : sp)
    )
    await requestRevalidate({ paths: ['/', '/sponsors'], tags: ['sponsors'] })
    toast.success(newVal ? `${s.sponsor_name} added to footer` : `${s.sponsor_name} removed from footer`)
  }

  const toggleHomepage = async (s: Sponsorship) => {
    const newVal = !s.show_on_homepage
    const { error } = await supabase
      .from('sponsorships')
      .update({ show_on_homepage: newVal })
      .eq('id', s.id)
    if (error) { toast.error('Failed to update'); return }
    setSponsorships(prev =>
      prev.map(sp => sp.id === s.id ? { ...sp, show_on_homepage: newVal } : sp)
    )
    await requestRevalidate({ paths: ['/', '/sponsors'], tags: ['sponsors'] })
    toast.success(newVal ? `${s.sponsor_name} added to homepage` : `${s.sponsor_name} removed from homepage`)
  }

  const setHomepageOrder = async (s: Sponsorship, raw: string) => {
    const parsed = raw.trim() === '' ? null : Number(raw)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return
    const { error } = await supabase
      .from('sponsorships')
      .update({ homepage_order: parsed })
      .eq('id', s.id)
    if (error) { toast.error('Failed to update order'); return }
    setSponsorships(prev =>
      prev.map(sp => sp.id === s.id ? { ...sp, homepage_order: parsed } : sp)
    )
    await requestRevalidate({ paths: ['/'], tags: ['sponsors'] })
  }

  const inputClass = 'w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors'
  const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const renderForm = () => (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(139,115,85,0.4)' }}>
      <p className="mb-4 text-sm font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>
        {editing ? 'Edit Sponsor' : 'Add Sponsor'}
      </p>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Sponsor Name</label>
            <input
              type="text"
              value={form.sponsor_name}
              onChange={e => setForm(f => ({ ...f, sponsor_name: e.target.value }))}
              className={inputClass}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
              placeholder="Company name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Website</label>
            <input
              type="url"
              value={form.website}
              onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
              className={inputClass}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
              placeholder="https://example.com"
            />
          </div>
        </div>

        {/* Contact Information */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#666' }}>Contact Information</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Contact Name</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                className={inputClass}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                placeholder="Contact name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className={inputClass}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className={inputClass}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                placeholder="(555) 555-5555"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Instagram</label>
              <input
                type="text"
                value={form.instagram}
                onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                className={inputClass}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                placeholder="@handle"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Facebook</label>
              <input
                type="text"
                value={form.facebook}
                onChange={e => setForm(f => ({ ...f, facebook: e.target.value }))}
                className={inputClass}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                placeholder="Facebook page URL"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className={inputClass}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
              placeholder="Internal notes..."
              rows={3}
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Sponsorship Level</label>

          {/* Visible at the point of editing, not buried in a doc. */}
          {editingRow?.amount_locked && (
            <div
              className="mb-3 flex items-start gap-2 rounded-xl px-4 py-3 text-xs leading-relaxed"
              style={{ backgroundColor: 'rgba(196,168,130,0.1)', border: '1px solid rgba(196,168,130,0.4)', color: '#C4A882' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>
                <strong>Amount locked at {formatCurrency(editingRow.amount)}.</strong>{' '}
                This is a grandfathered price from before the 13 July 2026 packet increase.
                Changing the tier below will not reprice it - saving keeps{' '}
                {formatCurrency(editingRow.amount)}.
              </span>
            </div>
          )}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>Main Tiers</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {ALL_TIERS.filter(t => TIER_INFO[t].group === 'main').map(t => {
              const info = TIER_INFO[t]
              const active = form.tier === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tier: t }))}
                  className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? `${info.color}25` : 'rgba(255,255,255,0.04)',
                    color: active ? info.color : '#555',
                    border: `1px solid ${active ? `${info.color}60` : '#2a2a2a'}`,
                  }}
                >
                  {info.label} · {formatCurrency(info.amount)}
                </button>
              )
            })}
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>Individual Items</p>
          <div className="flex flex-wrap gap-2">
            {ALL_TIERS.filter(t => TIER_INFO[t].group === 'individual').map(t => {
              const info = TIER_INFO[t]
              const active = form.tier === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tier: t }))}
                  className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? 'rgba(139,115,85,0.2)' : 'rgba(255,255,255,0.04)',
                    color: active ? '#C4A882' : '#555',
                    border: `1px solid ${active ? 'rgba(139,115,85,0.5)' : '#2a2a2a'}`,
                  }}
                >
                  {info.label} · {formatCurrency(info.amount)}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Status</label>
            <div className="flex gap-2">
              {(['pending', 'confirmed', 'cancelled'] as SponsorStatus[]).map(s => {
                const active = form.status === s
                const style = STATUS_STYLE[s]
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, status: s }))}
                    className="rounded-lg px-3 py-2 text-xs font-semibold capitalize transition-colors"
                    style={{
                      backgroundColor: active ? style.bg : 'rgba(255,255,255,0.04)',
                      color: active ? style.color : '#555',
                      border: `1px solid ${active ? style.color + '50' : '#2a2a2a'}`,
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Logo</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              id="sponsor-logo"
              className="hidden"
              onChange={e => setLogoFile(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="sponsor-logo"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold"
              style={{ backgroundColor: 'rgba(139,115,85,0.12)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
            >
              {logoFile ? `${logoFile.name}` : 'Upload logo'}
            </label>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={working}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#8B7355' }}
          >
            {working ? 'Saving...' : editing ? 'Update Sponsor' : 'Add Sponsor'}
          </button>
          <button
            onClick={() => { setAdding(false); setEditing(null); setForm(EMPTY_FORM); setLogoFile(null) }}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold"
            style={{ color: '#555', border: '1px solid #2a2a2a' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Sponsorships</h1>
          <p className="mt-1 text-sm" style={{ color: '#999' }}>Manage event sponsors and packages</p>
        </div>
        {!adding && !editing && (
          <button
            onClick={startAdd}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: '#8B7355' }}
          >
            + Add Sponsor
          </button>
        )}
      </div>

      {/* Revenue summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(139,115,85,0.4)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Confirmed</p>
          <p className="mt-2 font-display text-3xl font-bold" style={{ color: '#4ade80' }}>{formatCurrency(totalConfirmed)}</p>
          <p className="mt-1 text-xs" style={{ color: '#555' }}>{counts.confirmed} sponsor{counts.confirmed !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Pending</p>
          <p className="mt-2 font-display text-3xl font-bold" style={{ color: '#eab308' }}>{formatCurrency(totalPending)}</p>
          <p className="mt-1 text-xs" style={{ color: '#555' }}>{counts.pending} sponsor{counts.pending !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Total Sponsors</p>
          <p className="mt-2 font-display text-3xl font-bold text-white">{counts.all}</p>
          <p className="mt-1 text-xs" style={{ color: '#555' }}>{formatCurrency(totalConfirmed + totalPending)} pipeline</p>
        </div>
      </div>

      {/* Add / Edit form */}
      {(adding || editing) && <div className="mb-6">{renderForm()}</div>}

      {/* Status filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['all', 'pending', 'confirmed', 'cancelled', 'stale'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors"
            style={{
              backgroundColor: filter === f ? 'rgba(139,115,85,0.2)' : 'transparent',
              color: filter === f ? '#C4A882' : '#666',
              border: `1px solid ${filter === f ? 'rgba(139,115,85,0.4)' : '#2a2a2a'}`,
            }}
          >
            {f === 'all'
              ? `All (${counts.all})`
              : f === 'stale'
                ? `Stale holds (${counts.stale})`
                : `${f} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Sponsors list */}
      <div className="rounded-2xl" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm" style={{ color: '#555' }}>
            {sponsorships.length === 0 ? 'No sponsors yet - click "Add Sponsor" to get started.' : 'No sponsors match this filter.'}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#2a2a2a' }}>
            {filtered.map(s => {
              const tier = TIER_INFO[s.tier]
              const isDel = deleting === s.id
              const invoice = invoiceMap.get(s.id)
              const hasActiveInvoice = invoice && invoice.status !== 'cancelled'
              const isSending = sendingInvoice === s.id
              return (
                <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Logo */}
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                    style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
                  >
                    {s.logo_url ? (
                      <img src={s.logo_url} alt="" className="h-full w-full object-contain p-1" />
                    ) : (
                      <span className="text-lg font-bold" style={{ color: tier.color }}>
                        {s.sponsor_name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{s.sponsor_name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: `${tier.color}20`, color: tier.color }}
                      >
                        {tier.label}
                      </span>
                      <span className="text-xs font-medium" style={{ color: '#C4A882' }}>
                        {formatCurrency(s.amount)}
                      </span>
                      {s.website && (
                        <a href={s.website} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: '#555' }}>
                          {s.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      )}
                    </div>
                    {s.email && (
                      <p className="text-xs" style={{ color: '#666' }}>{s.contact_name} · {s.email}</p>
                    )}
                    {s.additional_items && s.additional_items.length > 0 && (
                      <p className="text-xs" style={{ color: '#8B7355' }}>
                        + {s.additional_items.map(i => TIER_INFO[i as SponsorTier]?.label ?? i).join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Invoice status */}
                  <div className="hidden flex-col items-end gap-1 sm:flex">
                    {hasActiveInvoice ? (
                      <>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
                          style={{
                            backgroundColor: INVOICE_STATUS_STYLE[invoice.status].bg,
                            color: INVOICE_STATUS_STYLE[invoice.status].color,
                          }}
                        >
                          {invoice.status === 'paid' ? 'Paid' : invoice.status === 'pending' ? 'Invoice sent' : invoice.status}
                        </span>
                        {invoice.amount_paid > 0 && invoice.status !== 'paid' && (
                          <span className="text-xs" style={{ color: '#4ade80' }}>
                            {formatCurrency(invoice.amount_paid)} paid
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs" style={{ color: '#555' }}>No invoice</span>
                    )}
                  </div>

                  {/* Footer toggle */}
                  <button
                    onClick={() => toggleFooter(s)}
                    title={s.featured_footer ? 'Remove from site footer' : 'Show in site footer'}
                    className="hidden shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 sm:inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: s.featured_footer ? 'rgba(139,115,85,0.2)' : 'transparent',
                      color: s.featured_footer ? '#C4A882' : '#555',
                      border: `1px solid ${s.featured_footer ? 'rgba(139,115,85,0.4)' : '#2a2a2a'}`,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={s.featured_footer ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    Footer
                  </button>

                  {/* Placed publicly but not paid - payment is no longer
                      enforced by RLS (migration 027), so surface it here at the
                      point of decision rather than letting it pass silently. */}
                  {(s.show_on_homepage || s.featured_footer) &&
                    !s.is_in_kind &&
                    invoice?.status !== 'paid' && (
                      <span
                        title="Featured publicly but the invoice is not paid. Mark the sponsor as in-kind if this is a trade arrangement."
                        className="hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold sm:inline-flex"
                        style={{ backgroundColor: 'rgba(234,179,8,0.15)', color: '#eab308' }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Featured, unpaid
                      </span>
                    )}

                  {/* Homepage toggle + manual order */}
                  <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                    <button
                      onClick={() => toggleHomepage(s)}
                      title={s.show_on_homepage ? 'Remove from homepage' : 'Show on homepage'}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: s.show_on_homepage ? 'rgba(139,115,85,0.2)' : 'transparent',
                        color: s.show_on_homepage ? '#C4A882' : '#555',
                        border: `1px solid ${s.show_on_homepage ? 'rgba(139,115,85,0.4)' : '#2a2a2a'}`,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill={s.show_on_homepage ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      </svg>
                      Homepage
                    </button>
                    {s.show_on_homepage && (
                      <input
                        type="number"
                        min={0}
                        defaultValue={s.homepage_order ?? ''}
                        onBlur={e => setHomepageOrder(s, e.target.value)}
                        title="Homepage sort order (lower first; blank sorts last)"
                        placeholder="#"
                        className="w-14 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                        style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
                      />
                    )}
                  </div>

                  {/* Hold expiry - a slot held against an unanswered offer */}
                  {s.status === 'pending' && s.hold_expires_at && (
                    <span
                      title={`Offer hold ${isStaleHold(s) ? 'lapsed' : 'expires'} ${new Date(s.hold_expires_at).toLocaleDateString()}`}
                      className="hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold sm:inline-flex"
                      style={isStaleHold(s)
                        ? { backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171' }
                        : { backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      {isStaleHold(s) ? 'Hold lapsed' : `Held to ${new Date(s.hold_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </span>
                  )}

                  {/* Status */}
                  <span
                    className="hidden rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize sm:inline"
                    style={{ backgroundColor: STATUS_STYLE[s.status].bg, color: STATUS_STYLE[s.status].color }}
                  >
                    {s.status}
                  </span>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {s.status === 'pending' && (
                      <button
                        onClick={() => handleApprove(s)}
                        disabled={approvingId === s.id}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
                      >
                        {approvingId === s.id ? '...' : 'Approve'}
                      </button>
                    )}
                    {!hasActiveInvoice && s.status !== 'cancelled' && (
                      <button
                        onClick={() => handleSendInvoice(s)}
                        disabled={isSending}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}
                      >
                        {isSending ? '...' : 'Send Invoice'}
                      </button>
                    )}
                    {s.user_id ? (
                      <button
                        onClick={() => submitUnlink(s.id)}
                        disabled={linkWorking}
                        title="This sponsor has portal access to their own profile"
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
                      >
                        Linked ✓
                      </button>
                    ) : (
                      <button
                        onClick={() => { setLinkingId(linkingId === s.id ? null : s.id); setLinkEmail(s.email ?? '') }}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ color: '#999', border: '1px solid #2a2a2a' }}
                      >
                        Link account
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(s)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={isDel}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
                      style={{ color: '#555', border: '1px solid #2a2a2a' }}
                    >
                      {isDel ? '...' : 'Delete'}
                    </button>
                  </div>

                  {linkingId === s.id && (
                    <div className="mt-3 w-full rounded-xl p-3" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}>
                      <p className="mb-2 text-[11px] leading-relaxed" style={{ color: '#888' }}>
                        Links this sponsorship to an existing account so they can edit their
                        own contact details, website, socials and logo in the portal. They
                        can never change tier, amount, status or placement. <strong>The
                        account must already exist</strong> - ask them to sign up first.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="email"
                          value={linkEmail}
                          onChange={e => setLinkEmail(e.target.value)}
                          placeholder="their account email"
                          className="min-w-[220px] flex-1 rounded-lg px-3 py-2 text-sm text-white outline-none"
                          style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
                        />
                        <button
                          onClick={() => submitLink(s.id)}
                          disabled={linkWorking}
                          className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          style={{ backgroundColor: '#8B7355' }}
                        >
                          {linkWorking ? 'Linking…' : 'Link'}
                        </button>
                        <button
                          onClick={() => { setLinkingId(null); setLinkEmail('') }}
                          className="rounded-lg px-3 py-2 text-xs font-medium"
                          style={{ color: '#666', border: '1px solid #2a2a2a' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
