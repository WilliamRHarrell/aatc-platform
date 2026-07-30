'use client'

import { useState } from 'react'
import { SPONSOR_TIERS as TIER_INFO, ALL_TIERS, MAIN_TIERS, INDIVIDUAL_ITEMS, type SponsorTier } from '@/lib/sponsor-tiers'
import PublicNav from '@/components/PublicNav'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

// ── Types ────────────────────────────────────────────────────



// ── Perks per tier/item ──────────────────────────────────────
const TIER_PERKS: Record<SponsorTier, string[]> = {
  title: [
    'Four (4) 10\'x10\' booths at the main entrance',
    'Logo on all social media graphics leading up to the event',
    'Title sponsorship on the "Best In Show" tattoo contest award',
    'Logo on all printed material leading up to and during the event',
    'Banner placement on the main stage for the duration of the event',
    'Logo and information prominently displayed on the website homepage',
    '4 posts monthly on all social media channels promoting your brand',
    'Title sponsor on the cover of the event guide',
    'Full-page ad in the event guide',
    'Featured on the AATC sponsor page',
    'Ten (10) weekend passes',
  ],
  platinum: [
    'Two (2) 10\'x10\' booths at the entrance',
    'Logo on most printed material including souvenir signature poster',
    'Banner placement in the main entrance',
    'Logo and information on the website and some social media graphics',
    'Multiple posts on all social media channels promoting your brand',
    'Ad in the event guide and sponsor page',
    'Featured on the AATC sponsor page',
    'Five (5) weekend passes',
  ],
  gold: [
    'Two (2) 10\'x10\' booths',
    'Banner placement in the main entrance',
    'Logo and information on the website',
    'Multiple posts on all social media channels promoting your brand',
    'Ad in the event guide and sponsor page',
    'Featured on the AATC sponsor page',
    'Five (5) weekend passes',
  ],
  silver: [
    'One (1) 10\'x10\' vendor only booth',
    'Banner placement in the main entrance',
    'One promotional post on all social media channels',
    'Ad in the event guide and sponsor page',
    'Featured on the AATC sponsor page',
    'Three (3) weekend passes',
  ],
  brass: [
    'Table presence at the entrance (manned or unmanned)',
    'Ad in the event guide and sponsor page',
    'Featured on the AATC sponsor page',
    'Two (2) weekend passes',
  ],
  collectible_coin: [
    'Your logo on the collectible AATC Challenge coin (one side AATC, one side sponsor)',
    'Coin included in every artist and vendor booth package',
    'Limited to 1,500 coins per year — only one of these sold annually',
  ],
  vip_bag: [
    'Your logo printed on every VIP bag',
    'Place materials inside every VIP bag',
    'Add your logo, information, or product samples',
    'Option to name the VIP bag pickup table after your company',
  ],
  collectors_choice: [
    'Your logo on every vote page of our website',
    'Award named after your company',
    '$500 prize to the winning collector, FREE booth for the winning artist next year',
    '30 days of online voting after the show',
    'Option to add your own prize package for the winners',
  ],
  artist_lounge: [
    'VIP access to the artist lounge for up to 25 guests',
    'The lounge will be named after your company for the event',
    'Exclusive access to the artist area for your VIP guests',
  ],
  rafter_banner: [
    'Hang a 15\'x25\' banner above your booth or along the wall',
    'Includes banner printing and hanging fee',
    'Continuous visibility all weekend by all convention goers',
  ],
}

interface FormState {
  sponsor_name: string
  contact_name: string
  email: string
  phone: string
  website: string
  instagram: string
  facebook: string
  tier: SponsorTier | null
  items: SponsorTier[]
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
  tier: null,
  items: [],
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

// ── Perks list component ─────────────────────────────────────
function PerksList({ tier }: { tier: SponsorTier }) {
  const perks = TIER_PERKS[tier]
  const info = TIER_INFO[tier]
  return (
    <div
      className="mt-2 rounded-lg p-4"
      style={{ backgroundColor: '#0a0a0a', border: `1px solid ${info.color}30` }}
    >
      <ul className="space-y-1.5">
        {perks.map((perk, i) => (
          <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#bbb' }}>
            <span className="mt-0.5 shrink-0" style={{ color: info.color }}>&#10003;</span>
            {perk}
          </li>
        ))}
      </ul>
    </div>
  )
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

  const toggleItem = (item: SponsorTier) => {
    setForm(f => ({
      ...f,
      items: f.items.includes(item) ? f.items.filter(i => i !== item) : [...f.items, item],
    }))
  }

  const selectTier = (tier: SponsorTier) => {
    setForm(f => ({ ...f, tier: f.tier === tier ? null : tier }))
  }

  // Calculate total amount
  const totalAmount = (form.tier ? TIER_INFO[form.tier].amount : 0) +
    form.items.reduce((sum, item) => sum + TIER_INFO[item].amount, 0)

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
    if (!form.tier && form.items.length === 0) return toast.error('Please select at least one sponsorship tier or item.')

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

      // Determine primary tier: main tier if selected, otherwise highest-value item
      const primaryTier = form.tier ?? form.items.sort((a, b) => TIER_INFO[b].amount - TIER_INFO[a].amount)[0]

      // Additional items (individual items selected alongside the tier)
      const additionalItems = form.items.length > 0 ? form.items : []

      const { error: insertErr } = await supabase.from('sponsorships').insert({
        event_id: event.id,
        sponsor_name: form.sponsor_name.trim(),
        contact_name: form.contact_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        tier: primaryTier,
        amount: totalAmount,
        logo_url,
        notes: form.notes.trim() || null,
        additional_items: additionalItems,
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
      <div className="min-h-screen">
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
    <div className="min-h-screen">
      <PublicNav />

      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="mb-2 text-3xl font-bold text-white"><span className="text-emboss">Sponsor Application</span></h1>
          <p className="text-sm" style={{ color: '#777' }}>
            <span className="text-emboss">Partner with us and get your brand in front of thousands of attendees.</span>
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
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>Phone</label>
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
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>Website</label>
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>Instagram</label>
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
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: '#888' }}>Facebook</label>
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
            <h2 className="mb-2 text-base font-semibold text-white">Sponsorship Selection</h2>
            <p className="mb-5 text-xs" style={{ color: '#666' }}>
              Choose one main tier and/or add individual sponsorship items.
            </p>

            {/* Main Tiers — radio behavior */}
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>
              Main Tiers <span className="normal-case font-normal">(select one)</span>
            </p>
            <div className="mb-2 flex flex-wrap gap-2">
              {MAIN_TIERS.map(t => {
                const info = TIER_INFO[t]
                const active = form.tier === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => selectTier(t)}
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
            {form.tier && TIER_INFO[form.tier].group === 'main' && (
              <PerksList tier={form.tier} />
            )}

            {/* Individual Items — checkbox behavior */}
            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#666' }}>
              Individual Items <span className="normal-case font-normal">(select any)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {INDIVIDUAL_ITEMS.map(t => {
                const info = TIER_INFO[t]
                const active = form.items.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleItem(t)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: active ? 'rgba(139,115,85,0.2)' : 'rgba(255,255,255,0.04)',
                      color: active ? '#C4A882' : '#555',
                      border: `1px solid ${active ? 'rgba(139,115,85,0.5)' : '#2a2a2a'}`,
                    }}
                  >
                    {active ? '✓ ' : ''}{info.label} · {formatCurrency(info.amount)}
                  </button>
                )
              })}
            </div>
            {form.items.map(item => (
              <PerksList key={item} tier={item} />
            ))}

            {/* Total */}
            {totalAmount > 0 && (
              <div
                className="mt-5 flex items-center justify-between rounded-lg px-4 py-3"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(139,115,85,0.3)' }}
              >
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#888' }}>
                  Total
                </span>
                <span className="text-lg font-bold" style={{ color: '#C4A882' }}>
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            )}
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
