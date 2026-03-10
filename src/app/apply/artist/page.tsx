'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { calculatePricing, getMaxArtists } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { BoothSize } from '@/lib/pricing'
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
  booth_size: BoothSize
  artist_count: number
  is_corner: boolean
  is_veteran: boolean
}

interface ArtistEntry {
  name: string
  nickname: string
  instagram: string
  styles: string[]
  id_file: File | null
  id_later: boolean
  portfolio_files: File[]
}

interface DetailFields {
  tv_show: string
  tv_show_flag: boolean
  notes: string
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

const BOOTH_SIZES: { value: BoothSize; label: string; sqft: string; artistPrice: number }[] = [
  { value: 'single', label: 'Single', sqft: '10×10', artistPrice: 70000 },
  { value: 'double', label: 'Double', sqft: '10×20', artistPrice: 110000 },
  { value: 'triple', label: 'Triple', sqft: '10×30', artistPrice: 180000 },
  { value: 'quad', label: 'Quad', sqft: '10×40', artistPrice: 220000 },
]

const ACCEPTED_FILE_TYPES = 'image/jpeg,image/png,image/webp,application/pdf'

const TATTOO_STYLES = [
  'American Traditional', 'Neo-Traditional', 'Japanese', 'Realism',
  'Watercolor', 'Blackwork', 'Dotwork', 'Geometric', 'Tribal',
  'New School', 'Illustrative', 'Fine Line', 'Surrealism', 'Horror / Dark Art',
  'Biomechanical', 'Lettering / Script', 'Floral', 'Minimalist', 'Portrait', 'Cover-up',
]

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
        exhibitorType: 'artist',
        boothSize: fields.booth_size,
        artistCount: fields.artist_count,
        isCorner: fields.is_corner,
        isVeteran: fields.is_veteran,
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

// ── Portfolio upload ───────────────────────────────────────────
function PortfolioUpload({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-white">
        Portfolio images <span style={{ color: '#555' }}>(optional)</span>
      </label>
      <p className="mb-2 text-xs" style={{ color: '#999999' }}>
        Upload up to 10 photos of your work (JPG, PNG, WebP)
      </p>
      {files.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {files.map((f, fi) => (
            <div key={fi} className="relative h-16 w-16 overflow-hidden rounded-lg" style={{ border: '1px solid #2a2a2a' }}>
              <img
                src={URL.createObjectURL(f)}
                alt={f.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== fi))}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff' }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {files.length < 10 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors"
          style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#555' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#8B7355'; (e.currentTarget as HTMLElement).style.color = '#C4A882' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a'; (e.currentTarget as HTMLElement).style.color = '#555' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Add photos{files.length > 0 ? ` (${files.length}/10)` : ''}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => {
          const newFiles = Array.from(e.target.files ?? [])
          onChange([...files, ...newFiles].slice(0, 10))
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function ArtistApplyPage() {
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
    booth_size: 'single',
    artist_count: 1,
    is_corner: false,
    is_veteran: false,
  })

  const [details, setDetails] = useState<DetailFields>({
    tv_show: '',
    tv_show_flag: false,
    notes: '',
    veteran_id_file: null,
  })

  const [artistEntries, setArtistEntries] = useState<ArtistEntry[]>([{ name: '', nickname: '', instagram: '', styles: [], id_file: null, id_later: false, portfolio_files: [] }])
  const [artistErrors, setArtistErrors] = useState<boolean[]>([])

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

  const maxArtists = getMaxArtists(booth.booth_size)

  // Clamp artist_count when size changes
  useEffect(() => {
    if (booth.artist_count > maxArtists) {
      setBooth(b => ({ ...b, artist_count: maxArtists }))
    }
  }, [booth.booth_size, maxArtists])

  // Keep artistEntries array in sync with artist_count
  useEffect(() => {
    setArtistEntries(prev => {
      const n = booth.artist_count
      if (prev.length === n) return prev
      if (prev.length < n) {
        return [...prev, ...Array.from({ length: n - prev.length }, () => ({ name: '', nickname: '', instagram: '', styles: [], id_file: null, id_later: false, portfolio_files: [] }))]
      }
      return prev.slice(0, n)
    })
  }, [booth.artist_count])

  const pricing = useMemo(
    () =>
      calculatePricing({
        exhibitorType: 'artist',
        boothSize: booth.booth_size,
        artistCount: booth.artist_count,
        isCorner: booth.is_corner,
        isVeteran: booth.is_veteran,
      }),
    [booth]
  )

  const handleSubmit = async () => {
    if (!event) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('You must be signed in')
      setSubmitting(false)
      return
    }

    const ts = Date.now()

    // Upload each artist's ID (skipped when artistsIdsLater is true)
    const artistsData: Array<{ name: string; nickname: string; instagram: string; styles: string[]; id_url: string | null; id_later: boolean; portfolio_urls: string[] }> = []
    for (let i = 0; i < artistEntries.length; i++) {
      const entry = artistEntries[i]
      let id_url: string | null = null
      if (!entry.id_later && entry.id_file) {
        const ext = entry.id_file.name.split('.').pop()
        const { data: up, error: upErr } = await supabase.storage
          .from('application-docs')
          .upload(`${user.id}/${ts}-artist-${i + 1}-id.${ext}`, entry.id_file)
        if (upErr) {
          toast.error(`Failed to upload ID for artist ${i + 1}. Please try again.`)
          setSubmitting(false)
          return
        }
        id_url = up.path
      }
      artistsData.push({ name: entry.name, nickname: entry.nickname, instagram: entry.instagram, styles: entry.styles, id_url, id_later: entry.id_later, portfolio_urls: [] })
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

    const { data: appRow, error } = await supabase.from('applications').insert({
      event_id: event.id,
      user_id: user.id,
      exhibitor_type: 'artist' as const,
      business_name: contact.business_name,
      contact_name: contact.contact_name,
      email: contact.email,
      phone: contact.phone || null,
      website: contact.website || null,
      instagram: contact.instagram || null,
      facebook: contact.facebook || null,
      other_links: contact.other_links || null,
      booth_size: booth.booth_size,
      artist_count: booth.artist_count,
      is_corner: booth.is_corner,
      is_veteran: booth.is_veteran,
      total_amount: pricing.total,
      tv_show: details.tv_show || null,
      veteran_id_url: veteranIdUrl,
      notes: details.notes || null,
      artists: artistsData,
      artists_ids_later: artistEntries.some(e => e.id_later),
      status: 'pending' as const,
    }).select('id').single()

    if (error || !appRow) {
      toast.error('Failed to submit application. Please try again.')
      setSubmitting(false)
      return
    }

    // Upload portfolio images for each artist
    const hasPortfolio = artistEntries.some(e => e.portfolio_files.length > 0)
    if (hasPortfolio) {
      const updatedArtists = [...artistsData]
      for (let i = 0; i < artistEntries.length; i++) {
        const entry = artistEntries[i]
        if (entry.portfolio_files.length === 0) continue
        const urls: string[] = []
        for (let j = 0; j < entry.portfolio_files.length; j++) {
          const f = entry.portfolio_files[j]
          const ext = f.name.split('.').pop()
          const path = `${appRow.id}/artists/${i}/${ts}-${j}.${ext}`
          const { data: up, error: upErr } = await supabase.storage
            .from('exhibitor-media')
            .upload(path, f)
          if (!upErr && up) {
            const { data: urlData } = supabase.storage.from('exhibitor-media').getPublicUrl(up.path)
            urls.push(urlData.publicUrl)
          }
        }
        updatedArtists[i] = { ...updatedArtists[i], portfolio_urls: urls }
      }
      await supabase.from('applications').update({ artists: updatedArtists }).eq('id', appRow.id)
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
          <BoothTypeToggle active="artist" />
          <p className="mb-1 text-sm font-medium uppercase tracking-widest" style={{ color: '#8B7355' }}><span className="text-emboss">Artist Application</span></p>
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
        <StepIndicator current={step} total={4} />

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
                      <label className="mb-1.5 block text-sm font-medium text-white">Business / Studio name <span style={{ color: '#8B7355' }}>*</span></label>
                      <input
                        type="text" required value={contact.business_name}
                        onChange={e => setContact(c => ({ ...c, business_name: e.target.value }))}
                        className={inputClass()} style={inputStyle()}
                        onFocus={onFocusGold} onBlur={onBlurGray}
                        placeholder="Ink & Soul Tattoo"
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
                        placeholder="you@studio.com"
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
                        placeholder="https://yourstudio.com"
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
                          placeholder="yourstudio"
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
                        placeholder="facebook.com/yourstudio"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-white">Other links</label>
                      <input
                        type="text" value={contact.other_links}
                        onChange={e => setContact(c => ({ ...c, other_links: e.target.value }))}
                        className={inputClass()} style={inputStyle()}
                        onFocus={onFocusGold} onBlur={onBlurGray}
                        placeholder="TikTok, Linktree, etc."
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
                <p className="mb-6 text-sm" style={{ color: '#999999' }}>Choose your booth size and options.</p>

                {/* Booth size grid */}
                <div className="mb-6">
                  <label className="mb-3 block text-sm font-medium text-white">Booth size</label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {BOOTH_SIZES.map(size => (
                      <button
                        key={size.value}
                        type="button"
                        onClick={() => setBooth(b => ({ ...b, booth_size: size.value }))}
                        className="rounded-xl p-4 text-left transition-all"
                        style={{
                          backgroundColor: booth.booth_size === size.value ? 'rgba(139,115,85,0.15)' : '#0a0a0a',
                          border: `2px solid ${booth.booth_size === size.value ? '#8B7355' : '#2a2a2a'}`,
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-white">{size.label}</p>
                            <p className="text-xs" style={{ color: '#999999' }}>{size.sqft} ft</p>
                            <p className="mt-1 text-xs" style={{ color: '#999999' }}>Up to {getMaxArtists(size.value)} artists</p>
                          </div>
                          <span className="font-display font-bold" style={{ color: '#C4A882' }}>
                            {formatCurrency(size.artistPrice)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Artist count */}
                <div className="mb-6">
                  <label className="mb-3 block text-sm font-medium text-white">
                    Number of artists <span style={{ color: '#555' }}>(max {maxArtists})</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setBooth(b => ({ ...b, artist_count: Math.max(1, b.artist_count - 1) }))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold transition-colors"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#8B7355' }}
                    >−</button>
                    <span className="w-8 text-center text-lg font-semibold text-white">{booth.artist_count}</span>
                    <button
                      type="button"
                      onClick={() => setBooth(b => ({ ...b, artist_count: Math.min(maxArtists, b.artist_count + 1) }))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold transition-colors"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#8B7355' }}
                    >+</button>
                    <span className="text-sm" style={{ color: '#999' }}>
                      × $50 permit fee each = {formatCurrency(booth.artist_count * 5000)}
                    </span>
                  </div>
                </div>

                {/* Options */}
                <div className="mb-6 space-y-3">
                  <label className="block text-sm font-medium text-white">Options</label>
                  {[
                    { key: 'is_corner', label: 'Corner booth', desc: '+$50 — extra visibility at the end of a row', value: booth.is_corner },
                    { key: 'is_veteran', label: 'Military veteran discount', desc: '−$150 — thank you for your service', value: booth.is_veteran },
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
                    onClick={() => setStep(3)}
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

            {/* ── Step 3: Documents & Additional Details ────────────────────── */}
            {step === 3 && (
              <div>
                <h2 className="font-display mb-1 text-xl font-bold text-white">Artist IDs & Details</h2>
                <p className="mb-6 text-sm" style={{ color: '#999999' }}>
                  Fill in what you know now — all artist info can be added later. Government-issued IDs are required for health department permitting.
                </p>

                <div className="space-y-6">
                  {/* Per-artist entries */}
                  <div className="space-y-4">
                    {artistEntries.map((entry, i) => (
                      <div
                        key={i}
                        className="rounded-xl overflow-hidden"
                        style={{ backgroundColor: '#0a0a0a', border: `1px solid ${artistErrors[i] ? '#ef4444' : entry.id_later ? 'rgba(234,179,8,0.3)' : '#2a2a2a'}` }}
                      >
                        {/* Card header with "Update later" toggle */}
                        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${artistErrors[i] ? 'rgba(239,68,68,0.2)' : entry.id_later ? 'rgba(234,179,8,0.15)' : '#1a1a1a'}` }}>
                          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
                            Artist {i + 1}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setArtistEntries(prev =>
                                prev.map((a, idx) => idx === i ? { ...a, id_later: !a.id_later, id_file: null } : a)
                              )
                              setArtistErrors(prev => prev.map((e, idx) => idx === i ? false : e))
                            }}
                            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                            style={{
                              backgroundColor: entry.id_later ? 'rgba(234,179,8,0.12)' : 'transparent',
                              color: entry.id_later ? '#eab308' : '#555',
                              border: `1px solid ${entry.id_later ? 'rgba(234,179,8,0.3)' : '#2a2a2a'}`,
                            }}
                          >
                            <div
                              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded"
                              style={{
                                backgroundColor: entry.id_later ? '#eab308' : 'transparent',
                                border: `1.5px solid ${entry.id_later ? '#eab308' : '#555'}`,
                              }}
                            >
                              {entry.id_later && (
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              )}
                            </div>
                            Update info later
                          </button>
                        </div>

                        {entry.id_later ? (
                          <div className="px-4 py-5">
                            <p className="text-sm" style={{ color: '#666' }}>
                              Artist info will be added later through the applicant portal.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4 p-4">
                            {/* Name + Nickname */}
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="mb-1.5 block text-sm font-medium text-white">Legal name <span style={{ color: '#555' }}>(optional)</span></label>
                                <input
                                  type="text"
                                  value={entry.name}
                                  onChange={e => setArtistEntries(prev =>
                                    prev.map((a, idx) => idx === i ? { ...a, name: e.target.value } : a)
                                  )}
                                  className={inputClass()} style={inputStyle()}
                                  onFocus={onFocusGold} onBlur={onBlurGray}
                                  placeholder="Full legal name"
                                />
                              </div>
                              <div>
                                <label className="mb-1.5 block text-sm font-medium text-white">Artist Name <span style={{ color: '#555' }}>(optional)</span></label>
                                <input
                                  type="text"
                                  value={entry.nickname}
                                  onChange={e => setArtistEntries(prev =>
                                    prev.map((a, idx) => idx === i ? { ...a, nickname: e.target.value } : a)
                                  )}
                                  className={inputClass()} style={inputStyle()}
                                  onFocus={onFocusGold} onBlur={onBlurGray}
                                  placeholder="If you want something other than your legal name displayed, enter it here"
                                />
                              </div>
                            </div>

                            {/* Instagram */}
                            <div>
                              <label className="mb-1.5 block text-sm font-medium text-white">Instagram handle <span style={{ color: '#555' }}>(optional)</span></label>
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#555' }}>@</span>
                                <input
                                  type="text"
                                  value={entry.instagram}
                                  onChange={e => setArtistEntries(prev =>
                                    prev.map((a, idx) => idx === i ? { ...a, instagram: e.target.value.replace(/^@/, '') } : a)
                                  )}
                                  className={inputClass()} style={{ ...inputStyle(), paddingLeft: '2rem' }}
                                  onFocus={onFocusGold} onBlur={onBlurGray}
                                  placeholder="yourhandle"
                                />
                              </div>
                            </div>

                            {/* Tattoo styles */}
                            <div>
                              <label className="mb-2 block text-sm font-medium text-white">
                                Tattoo styles <span style={{ color: '#555' }}>(select all that apply)</span>
                              </label>
                              <div className="flex flex-wrap gap-1.5">
                                {TATTOO_STYLES.map(style => {
                                  const selected = entry.styles.includes(style)
                                  return (
                                    <button
                                      key={style}
                                      type="button"
                                      onClick={() => setArtistEntries(prev => prev.map((a, idx) => {
                                        if (idx !== i) return a
                                        return {
                                          ...a,
                                          styles: selected ? a.styles.filter(s => s !== style) : [...a.styles, style],
                                        }
                                      }))}
                                      className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                                      style={{
                                        backgroundColor: selected ? 'rgba(139,115,85,0.2)' : 'rgba(255,255,255,0.04)',
                                        color: selected ? '#C4A882' : '#555',
                                        border: `1px solid ${selected ? 'rgba(139,115,85,0.5)' : '#2a2a2a'}`,
                                      }}
                                    >
                                      {style}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            {/* ID upload */}
                            <FileUploadField
                              label="Government-issued ID"
                              hint="Driver's license, passport, or state ID. Kept confidential — permitting use only. Can be uploaded later."
                              required={false}
                              file={entry.id_file}
                              onChange={f => setArtistEntries(prev =>
                                prev.map((a, idx) => idx === i ? { ...a, id_file: f } : a)
                              )}
                            />

                            {/* Portfolio images */}
                            <PortfolioUpload
                              files={entry.portfolio_files}
                              onChange={files => setArtistEntries(prev =>
                                prev.map((a, idx) => idx === i ? { ...a, portfolio_files: files } : a)
                              )}
                            />
                          </div>
                        )}

                        {/* Error message */}
                        {artistErrors[i] && !entry.id_later && (
                          <div className="px-4 pb-3">
                            <p className="text-xs" style={{ color: '#ef4444' }}>
                              Please fill in at least one field, or check &ldquo;Update info later&rdquo; to continue.
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Veteran ID upload — required when veteran discount selected */}
                  {booth.is_veteran && (
                    <FileUploadField
                      label="Veteran ID / proof of service"
                      hint="Upload your DD-214 or military ID to verify your veteran discount."
                      required
                      file={details.veteran_id_file}
                      onChange={f => setDetails(d => ({ ...d, veteran_id_file: f }))}
                    />
                  )}

                  {/* TV show experience */}
                  <div>
                    <p className="mb-2 text-sm font-medium text-white">Were you featured on a tattoo TV show?</p>
                    <p className="mb-3 text-xs" style={{ color: '#999999' }}>e.g. Ink Master, Best Ink, Miami Ink, etc.</p>
                    <div className="flex gap-3">
                      {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(({ label, val }) => {
                        const active = val ? !!details.tv_show_flag : !details.tv_show_flag
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setDetails(d => ({ ...d, tv_show_flag: val, tv_show: val ? d.tv_show : '' }))}
                            className="rounded-lg px-5 py-2 text-sm font-semibold transition-colors"
                            style={{
                              backgroundColor: active ? 'rgba(139,115,85,0.2)' : 'rgba(255,255,255,0.04)',
                              color: active ? '#C4A882' : '#666',
                              border: `1px solid ${active ? 'rgba(139,115,85,0.5)' : '#2a2a2a'}`,
                            }}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    {details.tv_show_flag && (
                      <input
                        type="text" value={details.tv_show}
                        onChange={e => setDetails(d => ({ ...d, tv_show: e.target.value }))}
                        className={`mt-3 ${inputClass()}`} style={inputStyle()}
                        onFocus={onFocusGold} onBlur={onBlurGray}
                        placeholder="Which show and season? (e.g. Ink Master Season 12)"
                      />
                    )}
                  </div>

                  {/* Additional notes */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white">Additional information</label>
                    <textarea
                      value={details.notes}
                      onChange={e => setDetails(d => ({ ...d, notes: e.target.value }))}
                      rows={4}
                      className="w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors resize-none"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
                      onFocus={onFocusGold} onBlur={onBlurGray}
                      placeholder="Anything else you'd like us to know…"
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
                      // Validate: each artist must either check "update later" or fill in something
                      const errors = artistEntries.map(e =>
                        !e.id_later && !e.name && !e.nickname && e.styles.length === 0 && !e.id_file && e.portfolio_files.length === 0
                      )
                      if (errors.some(Boolean)) {
                        setArtistErrors(errors)
                        toast.error('Please fill in artist info or check "Update info later" for each artist')
                        return
                      }
                      setArtistErrors([])
                      if (booth.is_veteran && !details.veteran_id_file) {
                        toast.error('Please upload your veteran ID to claim the veteran discount')
                        return
                      }
                      setStep(4)
                    }}
                    className="rounded-lg px-8 py-3 text-sm font-semibold text-white transition-all"
                    style={{ backgroundColor: '#8B7355' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#C4A882')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#8B7355')}
                  >
                    Next: Review →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 4: Review & Submit ───────────────────── */}
            {step === 4 && (
              <div>
                <h2 className="font-display mb-1 text-xl font-bold text-white">Review & Submit</h2>
                <p className="mb-6 text-sm" style={{ color: '#999999' }}>Double-check your details before submitting.</p>

                {/* Contact summary */}
                <div className="mb-4 rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Contact</p>
                    <button onClick={() => setStep(1)} className="text-xs transition-colors" style={{ color: '#555' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#555')}
                    >Edit</button>
                  </div>
                  <p className="font-semibold text-white">{contact.business_name}</p>
                  <p className="text-sm" style={{ color: '#999' }}>{contact.contact_name} · {contact.email}</p>
                  {contact.phone && <p className="text-sm" style={{ color: '#999' }}>{contact.phone}</p>}
                  {contact.instagram && <p className="text-sm" style={{ color: '#999' }}>@{contact.instagram}</p>}
                  {contact.facebook && <p className="text-sm" style={{ color: '#999' }}>FB: {contact.facebook}</p>}
                </div>

                {/* Booth summary */}
                <div className="mb-4 rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Booth</p>
                    <button onClick={() => setStep(2)} className="text-xs transition-colors" style={{ color: '#555' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#555')}
                    >Edit</button>
                  </div>
                  <p className="font-semibold capitalize text-white">{booth.booth_size} booth</p>
                  <p className="text-sm" style={{ color: '#999' }}>{booth.artist_count} artist{booth.artist_count !== 1 ? 's' : ''}</p>
                  {booth.is_corner && <p className="text-sm" style={{ color: '#999' }}>Corner booth</p>}
                  {booth.is_veteran && <p className="text-sm" style={{ color: '#4ade80' }}>Veteran discount applied</p>}
                </div>

                {/* Documents summary */}
                <div className="mb-4 rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Artists & Documents</p>
                    <button onClick={() => setStep(3)} className="text-xs transition-colors" style={{ color: '#555' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#555')}
                    >Edit</button>
                  </div>
                  {artistEntries.map((a, i) => (
                    <p key={i} className="text-sm" style={{ color: a.id_later ? '#eab308' : '#999' }}>
                      Artist {i + 1}: {a.name || '(name TBD)'}{a.nickname ? ` · "${a.nickname}"` : ''} · {a.id_later ? 'ID to be provided later' : (a.id_file?.name ?? 'no ID')}
                    </p>
                  ))}
                  {booth.is_veteran && details.veteran_id_file && (
                    <p className="text-sm" style={{ color: '#999' }}>Veteran ID: {details.veteran_id_file.name}</p>
                  )}
                  {details.tv_show && <p className="mt-1 text-sm" style={{ color: '#999' }}>TV: {details.tv_show}</p>}
                  {details.notes && <p className="mt-1 text-sm" style={{ color: '#999' }}>Notes: {details.notes}</p>}
                </div>

                {/* Pricing */}
                <div className="mb-6 rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Pricing</p>
                  <div className="space-y-2">
                    {pricing.itemized.map(item => (
                      <div key={item.label} className="flex justify-between text-sm">
                        <span style={{ color: '#999' }}>{item.label}</span>
                        <span style={{ color: item.amount < 0 ? '#4ade80' : '#C4A882' }}>
                          {item.amount < 0 ? '−' : ''}{formatCurrency(Math.abs(item.amount))}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t pt-2 font-semibold" style={{ borderColor: '#2a2a2a' }}>
                      <span className="text-white">Total</span>
                      <span style={{ color: '#8B7355' }}>{formatCurrency(pricing.total)}</span>
                    </div>
                  </div>
                </div>

                <p className="mb-6 text-xs leading-relaxed" style={{ color: '#555' }}>
                  By submitting you confirm all information is accurate. No payment is collected now —
                  approved applicants will receive an invoice with payment instructions.
                </p>

                <div className="flex items-center justify-between">
                  <button onClick={() => setStep(3)} className="text-sm transition-colors" style={{ color: '#999999' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999999')}
                  >← Back</button>
                  <button
                    onClick={handleSubmit}
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
