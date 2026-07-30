'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { VENDOR_BOOTH_OPTIONS as VENDOR_BOOTHS, addOnOptions, VETERAN_DISCOUNT_LABEL, PERMIT_FEE_LABEL, CORNER_FEE_LABEL } from '@/lib/pricing'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { calculatePricing, type AddOn, type AddOnTerm } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Event } from '@/types'
import BoothTypeToggle from '@/components/BoothTypeToggle'

// ── Types ────────────────────────────────────────────────────
interface ContactFields {
  business_name: string
  contact_name: string
  email: string
  phone: string
  website: string
  instagram: string
  facebook: string
  other_links: string
}

interface BoothFields {
  vendor_single_qty: number
  vendor_double_qty: number
  corner_count: number
  add_ons: AddOn[]
  is_veteran: boolean
}

interface DetailFields {
  notes: string
  id_doc_file: File | null
  veteran_id_file: File | null
}

// ── Shared input style helpers ────────────────────────────────
function inputClass() {
  return 'w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors'
}
function inputStyle() {
  return { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' } as React.CSSProperties
}
function onFocusGold(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = '#8B7355'
}
function onBlurGray(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = '#2a2a2a'
}


const ACCEPTED_FILE_TYPES = 'image/jpeg,image/png,image/webp,application/pdf'

// ── Step indicator ────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <div key={n} className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all"
            style={{
              backgroundColor: n <= current ? '#8B7355' : '#1a1a1a',
              border: `1px solid ${n <= current ? '#8B7355' : '#2a2a2a'}`,
              color: n <= current ? '#fff' : '#555',
            }}
          >
            {n < current ? '✓' : n}
          </div>
          {n < total && (
            <div
              className="h-px w-8"
              style={{ backgroundColor: n < current ? '#8B7355' : '#2a2a2a' }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Pricing sidebar ───────────────────────────────────────────
function PricingSidebar({ fields }: { fields: BoothFields }) {
  const pricing = useMemo(
    () =>
      calculatePricing({
        exhibitorType: 'vendor',
        artistSingleQty: 0,
        artistDoubleQty: 0,
        vendorSingleQty: fields.vendor_single_qty,
        vendorDoubleQty: fields.vendor_double_qty,
        cornerCount: fields.corner_count,
        artistCount: 0,
        isVeteran: fields.is_veteran,
        addOns: fields.add_ons,
      }),
    [fields]
  )

  return (
    <div
      className="sticky top-6 rounded-2xl p-6"
      style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
    >
      <h3 className="font-display mb-4 text-lg font-bold text-white">Estimated Total</h3>
      <div className="space-y-2">
        {pricing.itemized.map(item => (
          <div key={item.label} className="flex items-start justify-between gap-4 text-sm">
            <span style={{ color: '#999999' }}>{item.label}</span>
            <span
              className="shrink-0 font-medium"
              style={{ color: item.amount < 0 ? '#4ade80' : '#C4A882' }}
            >
              {item.amount < 0 ? '−' : ''}{formatCurrency(Math.abs(item.amount))}
            </span>
          </div>
        ))}
      </div>
      <div
        className="mt-4 flex items-center justify-between border-t pt-4"
        style={{ borderColor: '#2a2a2a' }}
      >
        <span className="font-semibold text-white">Total due</span>
        <span className="font-display text-xl font-bold" style={{ color: '#8B7355' }}>
          {formatCurrency(pricing.total)}
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed" style={{ color: '#555555' }}>
        No payment is collected at this time. You&apos;ll receive an invoice after approval.
      </p>
    </div>
  )
}

// ── File upload button ────────────────────────────────────────
function FileUploadField({
  label,
  hint,
  required,
  file,
  onChange,
}: {
  label: string
  hint?: string
  required?: boolean
  file: File | null
  onChange: (f: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-white">
        {label} {required && <span style={{ color: '#8B7355' }}>*</span>}
      </label>
      {hint && <p className="mb-2 text-xs" style={{ color: '#999999' }}>{hint}</p>}
      <div
        className="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 transition-colors"
        style={{ backgroundColor: '#0a0a0a', border: `1px solid ${file ? '#8B7355' : '#2a2a2a'}` }}
        onClick={() => inputRef.current?.click()}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={file ? '#8B7355' : '#555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span className="flex-1 truncate text-sm" style={{ color: file ? '#C4A882' : '#555555' }}>
          {file ? file.name : 'Click to upload (JPG, PNG, PDF — max 50 MB)'}
        </span>
        {file && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(null); if (inputRef.current) inputRef.current.value = '' }}
            className="text-xs"
            style={{ color: '#555' }}
          >
            ✕
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        className="hidden"
        onChange={e => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function VendorApplyPage() {
  const supabase = createClient()

  const [step, setStep] = useState(1)
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [contact, setContact] = useState<ContactFields>({
    business_name: '',
    contact_name: '',
    email: '',
    phone: '',
    website: '',
    instagram: '',
    facebook: '',
    other_links: '',
  })

  const [booth, setBooth] = useState<BoothFields>({
    vendor_single_qty: 1,
    vendor_double_qty: 0,
    corner_count: 0,
    add_ons: [],
    is_veteran: false,
  })

  const [details, setDetails] = useState<DetailFields>({
    notes: '',
    id_doc_file: null,
    veteran_id_file: null,
  })

  // Load active event + pre-fill from auth
  useEffect(() => {
    const init = async () => {
      const [{ data: eventData }, { data: { user } }] = await Promise.all([
        supabase.from('events').select('*').eq('is_active', true).single(),
        supabase.auth.getUser(),
      ])
      setEvent(eventData)
      if (user?.email) {
        setContact(c => ({
          ...c,
          email: user.email!,
          contact_name: user.user_metadata?.full_name ?? '',
        }))
      }
      setLoading(false)
    }
    init()
  }, [])

  const pricing = useMemo(
    () =>
      calculatePricing({
        exhibitorType: 'vendor',
        artistSingleQty: 0,
        artistDoubleQty: 0,
        vendorSingleQty: booth.vendor_single_qty,
        vendorDoubleQty: booth.vendor_double_qty,
        cornerCount: booth.corner_count,
        artistCount: 0,
        isVeteran: booth.is_veteran,
        addOns: booth.add_ons,
      }),
    [booth]
  )

  const handleSubmit = async () => {
    if (!event) return
    if (!details.id_doc_file) {
      toast.error('Please upload your ID document')
      return
    }
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('You must be signed in')
      setSubmitting(false)
      return
    }

    // Upload ID doc
    const ts = Date.now()
    const idExt = details.id_doc_file.name.split('.').pop()
    const { data: idUpload, error: idErr } = await supabase.storage
      .from('application-docs')
      .upload(`${user.id}/${ts}-id.${idExt}`, details.id_doc_file)

    if (idErr) {
      toast.error('Failed to upload ID document. Please try again.')
      setSubmitting(false)
      return
    }

    // Upload veteran ID if applicable
    let veteranIdUrl: string | null = null
    if (booth.is_veteran && details.veteran_id_file) {
      const vetExt = details.veteran_id_file.name.split('.').pop()
      const { data: vetUpload, error: vetErr } = await supabase.storage
        .from('application-docs')
        .upload(`${user.id}/${ts}-veteran-id.${vetExt}`, details.veteran_id_file)
      if (vetErr) {
        toast.error('Failed to upload veteran ID. Please try again.')
        setSubmitting(false)
        return
      }
      veteranIdUrl = vetUpload.path
    }

    // .select() so a zero-row insert cannot look like a successful application.
    const { data: insRows, error } = await supabase.from('applications').insert({
      event_id: event.id,
      user_id: user.id,
      exhibitor_type: 'vendor' as const,
      business_name: contact.business_name,
      contact_name: contact.contact_name,
      email: contact.email,
      phone: contact.phone || null,
      website: contact.website || null,
      instagram: contact.instagram || null,
      facebook: contact.facebook || null,
      other_links: contact.other_links || null,
      booth_size: null,
      artist_single_qty: 0,
      artist_double_qty: 0,
      vendor_single_qty: booth.vendor_single_qty,
      vendor_double_qty: booth.vendor_double_qty,
      corner_count: booth.corner_count,
      add_ons: booth.add_ons as never,
      artist_count: 0,
      is_corner: booth.corner_count > 0,
      is_veteran: booth.is_veteran,
      total_amount: pricing.total,
      id_doc_url: idUpload.path,
      veteran_id_url: veteranIdUrl,
      notes: details.notes || null,
      status: 'pending' as const,
    }).select('id')

    if (error) {
      toast.error('Failed to submit application. Please try again.')
      setSubmitting(false)
      return
    }
    if (!error && (!insRows || insRows.length === 0)) {
      console.error('[vendor application] 0 rows inserted — no error returned')
      toast.error('Nothing was saved. Please try again or contact us.')
      return
    }


    setSubmitted(true)
  }

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: '#999999' }}>Loading…</p>
        </div>
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-2xl p-8 text-center"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: '#0a0a0a' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="font-display mb-2 text-2xl font-bold text-white">Application Submitted!</h2>
          <p className="mb-1 text-sm" style={{ color: '#999999' }}>Thank you, {contact.business_name}.</p>
          <p className="mb-6 text-sm leading-relaxed" style={{ color: '#999999' }}>
            We&apos;ll review your application and reach out to {contact.email} with next steps.
            Approved applicants will receive an invoice for {formatCurrency(pricing.total)}.
          </p>
          <Link
            href="/apply"
            className="inline-block rounded-lg px-6 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: '#8B7355' }}
          >
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-10">
      {/* Header */}
      <div className="mx-auto mb-8 max-w-5xl">
        <Link
          href="/apply"
          className="flex items-center gap-2 text-sm transition-colors"
          style={{ color: '#999999' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999999')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </Link>
        <div className="mt-4">
          <BoothTypeToggle active="vendor" />
          <p className="mb-1 text-sm font-medium uppercase tracking-widest" style={{ color: '#8B7355' }}><span className="text-emboss">Vendor Application</span></p>
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl"><span className="text-emboss">Apply for AATC 2027</span></h1>
          {event && (
            <p className="mt-1 text-sm" style={{ color: '#999999' }}>
              <span className="text-emboss">{event.venue} · {event.city}, {event.state} · April 16–18, 2027</span>
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-5xl">
        <StepIndicator current={step} total={3} />

        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          {/* Form card */}
          <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>

            {/* ── Step 1: Contact Info ──────────────────────── */}
            {step === 1 && (
              <div>
                <h2 className="font-display mb-1 text-xl font-bold text-white">Contact Information</h2>
                <p className="mb-6 text-sm" style={{ color: '#999999' }}>Tell us about your business.</p>

                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-white">Business name <span style={{ color: '#8B7355' }}>*</span></label>
                      <input
                        type="text" required value={contact.business_name}
                        onChange={e => setContact(c => ({ ...c, business_name: e.target.value }))}
                        className={inputClass()} style={inputStyle()}
                        onFocus={onFocusGold} onBlur={onBlurGray}
                        placeholder="Your Business LLC"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-white">Contact name <span style={{ color: '#8B7355' }}>*</span></label>
                      <input
                        type="text" required value={contact.contact_name}
                        onChange={e => setContact(c => ({ ...c, contact_name: e.target.value }))}
                        className={inputClass()} style={inputStyle()}
                        onFocus={onFocusGold} onBlur={onBlurGray}
                        placeholder="Jane Doe"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-white">Email <span style={{ color: '#8B7355' }}>*</span></label>
                      <input
                        type="email" required value={contact.email}
                        onChange={e => setContact(c => ({ ...c, email: e.target.value }))}
                        className={inputClass()} style={inputStyle()}
                        onFocus={onFocusGold} onBlur={onBlurGray}
                        placeholder="you@business.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-white">Phone</label>
                      <input
                        type="tel" value={contact.phone}
                        onChange={e => setContact(c => ({ ...c, phone: e.target.value }))}
                        className={inputClass()} style={inputStyle()}
                        onFocus={onFocusGold} onBlur={onBlurGray}
                        placeholder="(555) 000-0000"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-white">Website</label>
                      <input
                        type="url" value={contact.website}
                        onChange={e => setContact(c => ({ ...c, website: e.target.value }))}
                        className={inputClass()} style={inputStyle()}
                        onFocus={onFocusGold} onBlur={onBlurGray}
                        placeholder="https://yourbusiness.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-white">Instagram</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#555555' }}>@</span>
                        <input
                          type="text" value={contact.instagram}
                          onChange={e => setContact(c => ({ ...c, instagram: e.target.value }))}
                          className={inputClass() + ' pl-8'} style={inputStyle()}
                          onFocus={onFocusGold} onBlur={onBlurGray}
                          placeholder="yourbusiness"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-white">Facebook</label>
                      <input
                        type="text" value={contact.facebook}
                        onChange={e => setContact(c => ({ ...c, facebook: e.target.value }))}
                        className={inputClass()} style={inputStyle()}
                        onFocus={onFocusGold} onBlur={onBlurGray}
                        placeholder="facebook.com/yourbusiness"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-white">Other links</label>
                      <input
                        type="text" value={contact.other_links}
                        onChange={e => setContact(c => ({ ...c, other_links: e.target.value }))}
                        className={inputClass()} style={inputStyle()}
                        onFocus={onFocusGold} onBlur={onBlurGray}
                        placeholder="TikTok, Linktree, Etsy, etc."
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => {
                      if (!contact.business_name || !contact.contact_name || !contact.email) {
                        toast.error('Please fill in all required fields')
                        return
                      }
                      setStep(2)
                    }}
                    className="rounded-lg px-8 py-3 text-sm font-semibold text-white transition-all"
                    style={{ backgroundColor: '#8B7355' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#C4A882')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#8B7355')}
                  >
                    Next: Booth Selection →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Booth Selection ───────────────────── */}
            {step === 2 && (
              <div>
                <h2 className="font-display mb-1 text-xl font-bold text-white">Booth Selection</h2>
                <p className="mb-6 text-sm" style={{ color: '#999999' }}>Choose your booth quantities and options.</p>

                {/* Booth quantity steppers */}
                <div className="mb-2 space-y-3">
                  <label className="mb-3 block text-sm font-medium text-white">Booth quantities</label>
                  {VENDOR_BOOTHS.map(b => {
                    const fieldKey = b.kind === 'single' ? 'vendor_single_qty' : 'vendor_double_qty'
                    const qty = booth[fieldKey] as number
                    return (
                      <div key={b.kind} className="flex items-center justify-between rounded-xl p-5"
                        style={{
                          backgroundColor: qty > 0 ? 'rgba(139,115,85,0.15)' : '#0a0a0a',
                          border: `2px solid ${qty > 0 ? '#8B7355' : '#2a2a2a'}`,
                        }}>
                        <div>
                          <p className="font-semibold text-white">{b.label} <span className="text-xs" style={{ color: '#999999' }}>({b.sqft})</span></p>
                          <p className="text-sm" style={{ color: '#C4A882' }}>${b.price / 100} each</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button type="button"
                            onClick={() => setBooth(prev => ({ ...prev, [fieldKey]: Math.max(0, (prev[fieldKey] as number) - 1) }))}
                            disabled={qty === 0}
                            className="h-8 w-8 rounded-full text-lg font-bold disabled:opacity-30"
                            style={{ backgroundColor: '#2a2a2a', color: 'white' }}>−</button>
                          <span className="w-6 text-center font-semibold text-white">{qty}</span>
                          <button type="button"
                            onClick={() => setBooth(prev => ({ ...prev, [fieldKey]: (prev[fieldKey] as number) + 1 }))}
                            className="h-8 w-8 rounded-full text-lg font-bold"
                            style={{ backgroundColor: '#8B7355', color: 'white' }}>+</button>
                        </div>
                      </div>
                    )
                  })}

                  <div className="mt-4 flex items-center justify-between rounded-xl p-4"
                       style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                    <div>
                      <p className="text-sm font-semibold text-white">Corner booths</p>
                      <p className="text-xs" style={{ color: '#999999' }}>+{CORNER_FEE_LABEL} each (max equals total booths)</p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={booth.vendor_single_qty + booth.vendor_double_qty}
                      value={booth.corner_count}
                      onChange={e => {
                        const v = Math.max(0, parseInt(e.target.value) || 0)
                        setBooth(prev => ({ ...prev, corner_count: Math.min(v, prev.vendor_single_qty + prev.vendor_double_qty) }))
                      }}
                      className="w-20 rounded-lg px-3 py-2 text-center text-sm text-white"
                      style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                    />
                  </div>

                  <div className="mt-6">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: '#8B7355' }}>
                      Add-ons (optional)
                    </h3>
                    <div className="space-y-3">
                      {/* Labels derived from ADDON_PRICES so the price an applicant reads
                          cannot disagree with the computed total. */}
                      {addOnOptions().map(item => {
                        const existing = booth.add_ons.find(a => a.kind === item.kind)
                        const qty = existing?.qty ?? 0
                        const term = (existing?.term ?? item.terms[0].value) as AddOnTerm
                        return (
                          <div key={item.kind} className="flex flex-col gap-2 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between"
                            style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                            <span className="text-sm font-semibold text-white">{item.label}</span>
                            <div className="flex items-center gap-3">
                              {item.terms.length > 1 && (
                                <select
                                  value={term ?? ''}
                                  onChange={e => setBooth(prev => {
                                    const others = prev.add_ons.filter(a => a.kind !== item.kind)
                                    return { ...prev, add_ons: qty > 0 ? [...others, { kind: item.kind, term: (e.target.value || null) as AddOnTerm, qty }] : others }
                                  })}
                                  className="rounded px-2 py-1 text-xs text-white"
                                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                                  {item.terms.map(t => <option key={t.label} value={t.value ?? ''}>{t.label}</option>)}
                                </select>
                              )}
                              {item.terms.length === 1 && <span className="text-xs" style={{ color: '#C4A882' }}>{item.terms[0].label}</span>}
                              <button type="button"
                                onClick={() => setBooth(prev => {
                                  const others = prev.add_ons.filter(a => a.kind !== item.kind)
                                  const newQty = Math.max(0, qty - 1)
                                  return { ...prev, add_ons: newQty > 0 ? [...others, { kind: item.kind, term, qty: newQty }] : others }
                                })}
                                disabled={qty === 0}
                                className="h-7 w-7 rounded-full text-sm font-bold disabled:opacity-30"
                                style={{ backgroundColor: '#2a2a2a', color: 'white' }}>−</button>
                              <span className="w-6 text-center text-sm font-semibold text-white">{qty}</span>
                              <button type="button"
                                onClick={() => setBooth(prev => {
                                  const others = prev.add_ons.filter(a => a.kind !== item.kind)
                                  return { ...prev, add_ons: [...others, { kind: item.kind, term, qty: qty + 1 }] }
                                })}
                                className="h-7 w-7 rounded-full text-sm font-bold"
                                style={{ backgroundColor: '#8B7355', color: 'white' }}>+</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Veteran discount */}
                <div className="mb-6 mt-6 space-y-3">
                  <label className="block text-sm font-medium text-white">Options</label>
                  {[
                    { key: 'is_veteran', label: 'Military veteran discount', desc: `${VETERAN_DISCOUNT_LABEL} — thank you for your service`, value: booth.is_veteran },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setBooth(b => ({ ...b, [opt.key]: !b[opt.key as keyof BoothFields] }))}
                      className="flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all"
                      style={{
                        backgroundColor: (opt.value as boolean) ? 'rgba(139,115,85,0.12)' : '#0a0a0a',
                        border: `1px solid ${(opt.value as boolean) ? '#8B7355' : '#2a2a2a'}`,
                      }}
                    >
                      <div
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                        style={{
                          backgroundColor: (opt.value as boolean) ? '#8B7355' : 'transparent',
                          border: `2px solid ${(opt.value as boolean) ? '#8B7355' : '#555'}`,
                        }}
                      >
                        {opt.value && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{opt.label}</p>
                        <p className="text-xs" style={{ color: '#999999' }}>{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <button onClick={() => setStep(1)} className="text-sm transition-colors" style={{ color: '#999999' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999999')}
                  >← Back</button>
                  <button
                    onClick={() => {
                      if (booth.vendor_single_qty === 0 && booth.vendor_double_qty === 0) {
                        toast.error('Please select at least one booth')
                        return
                      }
                      setStep(3)
                    }}
                    className="rounded-lg px-8 py-3 text-sm font-semibold text-white transition-all"
                    style={{ backgroundColor: '#8B7355' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#C4A882')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#8B7355')}
                  >
                    Next: Documents →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Documents & Additional Details ────── */}
            {step === 3 && (
              <div>
                <h2 className="font-display mb-1 text-xl font-bold text-white">Documents & Details</h2>
                <p className="mb-6 text-sm" style={{ color: '#999999' }}>Upload required documents and share anything else we should know.</p>

                <div className="space-y-5">
                  {/* ID doc upload */}
                  <FileUploadField
                    label="Government-issued ID"
                    hint="Required for permitting purposes only. Your information is kept confidential."
                    required
                    file={details.id_doc_file}
                    onChange={f => setDetails(d => ({ ...d, id_doc_file: f }))}
                  />

                  {/* Veteran ID upload — only shown when veteran discount selected */}
                  {booth.is_veteran && (
                    <FileUploadField
                      label="Veteran ID / proof of service"
                      hint="Upload your DD-214 or military ID to verify your veteran discount."
                      file={details.veteran_id_file}
                      onChange={f => setDetails(d => ({ ...d, veteran_id_file: f }))}
                    />
                  )}

                  {/* Additional notes */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white">Additional information</label>
                    <textarea
                      value={details.notes}
                      onChange={e => setDetails(d => ({ ...d, notes: e.target.value }))}
                      rows={4}
                      className="w-full resize-none rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
                      onFocus={onFocusGold} onBlur={onBlurGray}
                      placeholder="Tell us what you'll be selling, any special requirements, or anything else…"
                    />
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <button onClick={() => setStep(2)} className="text-sm transition-colors" style={{ color: '#999999' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999999')}
                  >← Back</button>
                  <button
                    onClick={() => {
                      if (!details.id_doc_file) {
                        toast.error('Please upload your government-issued ID')
                        return
                      }
                      if (booth.is_veteran && !details.veteran_id_file) {
                        toast.error('Please upload your veteran ID to claim the veteran discount')
                        return
                      }
                      handleSubmit()
                    }}
                    disabled={submitting}
                    className="rounded-lg px-8 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
                    style={{ backgroundColor: '#8B7355' }}
                    onMouseEnter={e => { if (!submitting) (e.currentTarget as HTMLElement).style.backgroundColor = '#C4A882' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#8B7355' }}
                  >
                    {submitting ? 'Submitting…' : 'Submit Application'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pricing sidebar */}
          <div className="hidden lg:block">
            <PricingSidebar fields={booth} />
          </div>
        </div>

        {/* Mobile pricing strip */}
        <div
          className="mt-4 flex items-center justify-between rounded-xl px-5 py-4 lg:hidden"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <span className="text-sm" style={{ color: '#999' }}>Estimated total</span>
          <span className="font-display text-lg font-bold" style={{ color: '#8B7355' }}>
            {formatCurrency(pricing.total)}
          </span>
        </div>
      </div>
    </div>
  )
}
