'use client'

import { useState } from 'react'
import PublicNav from '@/components/PublicNav'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

// ── Types ────────────────────────────────────────────────────
type SponsorTier = 'title' | 'platinum' | 'gold' | 'silver' | 'brass' | 'collectible_coin' | 'vip_bag' | 'collectors_choice' | 'artist_lounge' | 'rafter_banner'

const TIER_INFO: Record<SponsorTier, { label: string; color: string; amount: number; group: 'main' | 'individual' }> = {
  title:             { label: 'Title Sponsor',         color: '#ffd700', amount: 2000000, group: 'main' },
  platinum:          { label: 'Platinum',               color: '#e5e4e2', amount: 800000,  group: 'main' },
  gold:              { label: 'Gold',                   color: '#C4A882', amount: 300000,  group: 'main' },
  silver:            { label: 'Silver',                 color: '#a8a8a8', amount: 100000,  group: 'main' },
  brass:             { label: 'Brass',                  color: '#cd7f32', amount: 50000,   group: 'main' },
  collectible_coin:  { label: 'Collectible Coin',       color: '#C4A882', amount: 250000,  group: 'individual' },
  vip_bag:           { label: 'VIP Bag',                color: '#C4A882', amount: 80000,   group: 'individual' },
  collectors_choice: { label: "Collector's Choice",     color: '#C4A882', amount: 150000,  group: 'individual' },
  artist_lounge:     { label: 'Artist Lounge',          color: '#C4A882', amount: 100000,  group: 'individual' },
  rafter_banner:     { label: 'Rafter Banner',          color: '#C4A882', amount: 75000,   group: 'individual' },
}

const ALL_TIERS: SponsorTier[] = ['title', 'platinum', 'gold', 'silver', 'brass', 'collectible_coin', 'vip_bag', 'collectors_choice', 'artist_lounge', 'rafter_banner']

interface FormState {
  sponsor_name: string
  contact_name: string
  email: string
  phone: string
  website: string
  instagram: string
  facebook: string
  tier: SponsorTier
  logo_file: File | null
  notes: string
}

const INITIAL_FORM: FormState = {
  sponsor_name: '',
  contact_name: '',
  email: '',
  phone: '',
  website: '',
  instagram: '',
  facebook: '',
  tier: 'gold',
  logo_file: null,
  notes: '',
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

// ── Component ────────────────────────────────────────────────
export default function SponsorApplicationPage() {
  const supabase = createClient()
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  // ── Logo upload ────────────────────────────────────────────
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

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!form.sponsor_name.trim()) return toast.error('Company/Sponsor name is required.')
    if (!form.contact_name.trim()) return toast.error('Contact name is required.')
    if (!form.email.trim()) return toast.error('Email is required.')

    setSubmitting(true)
    try {
      // Fetch active event
      const { data: event, error: eventErr } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .single()
      if (eventErr || !event) {
        toast.error('No active event found. Please try again later.')
        return
      }

      // Upload logo if provided
      let logo_url: string | null = null
      if (form.logo_file) {
        logo_url = await uploadLogo(form.logo_file)
        if (!logo_url) {
          toast.error('Logo upload failed. Please try again.')
          return
        }
      }

      // Insert sponsorship record
      const tierInfo = TIER_INFO[form.tier]
      const { error: insertErr } = await supabase.from('sponsorships').insert({
        event_id: event.id,
        sponsor_name: form.sponsor_name.trim(),
        contact_name: form.contact_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        tier: form.tier,
        amount: tierInfo.amount,
        logo_url,
        notes: form.notes.trim() || null,
        status: 'pending',
      })

      if (insertErr) {
        console.error(insertErr)
        toast.error('Submission failed. Please try again.')
        return
      }

      setSubmittedEmail(form.email.trim())
      setSubmitted(true)
      toast.success('Application submitted!')
    } catch (err) {
      console.error(err)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success screen ─────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
        <PublicNav />
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(139,115,85,0.15)' }}
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="#8B7355" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mb-3 text-2xl font-bold text-white">Thank You!</h1>
          <p className="text-sm leading-relaxed" style={{ color: '#999' }}>
            We&apos;ll review your application and contact you at{' '}
            <span style={{ color: '#C4A882' }}>{submittedEmail}</span>.
          </p>
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <PublicNav />

      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="mb-2 text-3xl font-bold text-white">Sponsor Application</h1>
          <p className="text-sm" style={{ color: '#777' }}>
            Partner with us and get your brand in front of thousands of attendees.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ── Contact Information ─────────────────────────── */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: '#111', border: '1px solid #1a1a1a' }}
          >
            <h2 className="mb-5 text-base font-semibold text-white">Contact Information</h2>
            <div className="space-y-4">
              {/* Sponsor name */}
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>
                  Company / Sponsor Name <span style={{ color: '#C4A882' }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.sponsor_name}
                  onChange={e => set('sponsor_name', e.target.value)}
                  className={inputClass()}
                  style={inputStyle()}
                  onFocus={onFocusGold}
                  onBlur={onBlurGray}
                  placeholder="Acme Corp"
                />
              </div>

              {/* Contact name */}
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>
                  Contact Name <span style={{ color: '#C4A882' }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={e => set('contact_name', e.target.value)}
                  className={inputClass()}
                  style={inputStyle()}
                  onFocus={onFocusGold}
                  onBlur={onBlurGray}
                  placeholder="Jane Doe"
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>
                  Email <span style={{ color: '#C4A882' }}>*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  className={inputClass()}
                  style={inputStyle()}
                  onFocus={onFocusGold}
                  onBlur={onBlurGray}
                  placeholder="jane@acmecorp.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  className={inputClass()}
                  style={inputStyle()}
                  onFocus={onFocusGold}
                  onBlur={onBlurGray}
                  placeholder="(555) 123-4567"
                />
              </div>

              {/* Website */}
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>
                  Website
                </label>
                <input
                  type="url"
                  value={form.website}
                  onChange={e => set('website', e.target.value)}
                  className={inputClass()}
                  style={inputStyle()}
                  onFocus={onFocusGold}
                  onBlur={onBlurGray}
                  placeholder="https://acmecorp.com"
                />
              </div>

              {/* Social — two columns */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>
                    Instagram
                  </label>
                  <input
                    type="text"
                    value={form.instagram}
                    onChange={e => set('instagram', e.target.value)}
                    className={inputClass()}
                    style={inputStyle()}
                    onFocus={onFocusGold}
                    onBlur={onBlurGray}
                    placeholder="@acmecorp"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>
                    Facebook
                  </label>
                  <input
                    type="text"
                    value={form.facebook}
                    onChange={e => set('facebook', e.target.value)}
                    className={inputClass()}
                    style={inputStyle()}
                    onFocus={onFocusGold}
                    onBlur={onBlurGray}
                    placeholder="facebook.com/acmecorp"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── Sponsorship Tier ───────────────────────────── */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: '#111', border: '1px solid #1a1a1a' }}
          >
            <h2 className="mb-5 text-base font-semibold text-white">Preferred Sponsorship Tier</h2>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>
              Main Tiers
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {ALL_TIERS.filter(t => TIER_INFO[t].group === 'main').map(t => {
                const info = TIER_INFO[t]
                const active = form.tier === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('tier', t)}
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

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>
              Individual Items
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_TIERS.filter(t => TIER_INFO[t].group === 'individual').map(t => {
                const info = TIER_INFO[t]
                const active = form.tier === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('tier', t)}
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
          </section>

          {/* ── Logo Upload ────────────────────────────────── */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: '#111', border: '1px solid #1a1a1a' }}
          >
            <h2 className="mb-5 text-base font-semibold text-white">Logo Upload</h2>
            <p className="mb-3 text-xs" style={{ color: '#666' }}>
              Upload your company logo (optional). Accepted formats: PNG, JPG, WEBP, SVG.
            </p>
            <label
              className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed px-4 py-6 text-sm transition-colors hover:border-[#8B7355]"
              style={{ borderColor: '#2a2a2a', color: '#555' }}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0] ?? null
                  set('logo_file', file)
                }}
              />
              {form.logo_file ? (
                <span className="text-white">{form.logo_file.name}</span>
              ) : (
                <span>Click to upload logo</span>
              )}
            </label>
          </section>

          {/* ── Notes ──────────────────────────────────────── */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: '#111', border: '1px solid #1a1a1a' }}
          >
            <h2 className="mb-5 text-base font-semibold text-white">Notes / Message</h2>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={4}
              className={inputClass()}
              style={{ ...inputStyle(), resize: 'vertical' } as React.CSSProperties}
              onFocus={onFocusGold}
              onBlur={onBlurGray}
              placeholder="Anything else you'd like us to know..."
            />
          </section>

          {/* ── Submit ─────────────────────────────────────── */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl py-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#8B7355' }}
          >
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  )
}
