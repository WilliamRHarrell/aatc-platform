'use client'

import { useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import PublicNav from '@/components/PublicNav'
import HoneypotField from '@/components/HoneypotField'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { foodTruckPrice } from '@/lib/food-truck-pricing'
import {
  FOOD_TYPES, FOOD_TYPE_OTHER, TRUCK_DAYS, TRUCK_DAY_LABELS, FOOD_TRUCK_REQUIREMENTS,
  DESCRIPTION_MAX, PHOTO_MAX_COUNT, TRUCK_IMAGE_ACCEPT, checkTruckFile, type TruckDay,
} from '@/lib/food-truck-submission'

// /apply/food-truck (091). The route validates, inserts with the service role
// and sends the receipts; nothing is inserted from here. Files go straight to
// Storage through the signed upload URLs the route returns (a request body
// cannot carry five 10 MB photos), then /files records what arrived.

const BUCKET = 'food-truck-logos'

interface FormState {
  businessName: string
  contactName: string
  phone: string
  email: string
  foodType: string
  foodTypeOther: string
  days: TruckDay[]
  website: string
  instagram: string
  facebook: string
  description: string
  acknowledged: boolean
}

const INITIAL: FormState = {
  businessName: '', contactName: '', phone: '', email: '', foodType: '', foodTypeOther: '',
  days: [], website: '', instagram: '', facebook: '', description: '', acknowledged: false,
}

const inputClass = 'w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors focus:border-[#8B7355]'
const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' } as const
const labelClass = 'mb-1.5 block text-xs font-medium'
const sectionStyle = { backgroundColor: '#111', border: '1px solid #1a1a1a' } as const

function Req() {
  return <span style={{ color: '#C4A882' }}> *</span>
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs" style={{ color: '#f87171' }}>{msg}</p> : null
}

export default function FoodTruckApplyClient({ title, intro, ackLabel }: { title: string; intro: ReactNode; ackLabel: string }) {
  const [form, setForm] = useState<FormState>(INITIAL)
  const [logo, setLogo] = useState<File | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [honeypot, setHoneypot] = useState('')
  const [mountedAt] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ email: string; filesMissing: number } | null>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))
  const toggleDay = (d: TruckDay) =>
    setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }))

  const pickLogo = (file: File | undefined) => {
    if (!file) return setLogo(null)
    const c = checkTruckFile(file, 'logo')
    if (!c.ok) { toast.error(c.error); return }
    setLogo(file)
  }
  const addPhotos = (list: FileList | null) => {
    if (!list) return
    const next = [...photos]
    for (const file of Array.from(list)) {
      if (next.length >= PHOTO_MAX_COUNT) { toast.error(`Up to ${PHOTO_MAX_COUNT} photos.`); break }
      const c = checkTruckFile(file, 'photo')
      if (!c.ok) { toast.error(`${file.name}: ${c.error}`); continue }
      next.push(file)
    }
    setPhotos(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErrors({})
    try {
      // Logo first, then photos: the route's upload `index` follows this order.
      const files = [...(logo ? [logo] : []), ...photos]
      const manifest = [
        ...(logo ? [{ kind: 'logo', type: logo.type, size: logo.size }] : []),
        ...photos.map(p => ({ kind: 'photo', type: p.type, size: p.size })),
      ]
      const res = await fetch('/api/food-truck-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          websiteUrl: form.website,
          website: honeypot,
          elapsedMs: Date.now() - mountedAt,
          files: manifest,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        id?: string; error?: string; fieldErrors?: Record<string, string>; closed?: boolean
        uploads?: { index: number; path: string; token: string }[]
      }
      if (!res.ok || !json.id) {
        if (json.fieldErrors) setErrors(json.fieldErrors)
        toast.error(json.error ?? 'Submission failed. Please try again.')
        if (json.closed) window.location.reload()
        return
      }

      // The application is saved. A file that fails here is reported, not fatal.
      let uploaded = 0
      if (files.length > 0) {
        const sb = createClient()
        const results = await Promise.all((json.uploads ?? []).map(async u => {
          const file = files[u.index]
          if (!file) return false
          const { error } = await sb.storage.from(BUCKET).uploadToSignedUrl(u.path, u.token, file, { contentType: file.type })
          return !error
        }))
        uploaded = results.filter(Boolean).length
        if (uploaded > 0) {
          await fetch('/api/food-truck-apply/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: json.id }),
          }).catch(() => undefined)
        }
      }
      setDone({ email: form.email.trim(), filesMissing: files.length - uploaded })
      window.scrollTo({ top: 0 })
    } catch (err) {
      console.error(err)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen">
        <PublicNav />
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(139,115,85,0.15)' }}>
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="#8B7355" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mb-3 text-2xl font-bold text-white">Application received</h1>
          <p className="text-sm leading-relaxed" style={{ color: '#999' }}>
            Thank you. We sent a confirmation to <span style={{ color: '#C4A882' }}>{done.email}</span> and will email you with our decision.
          </p>
          {done.filesMissing > 0 && (
            <p className="mt-4 text-sm leading-relaxed" style={{ color: '#eab308' }}>
              {done.filesMissing === 1 ? 'One of your images' : `${done.filesMissing} of your images`} did not upload. Your application is saved; we will ask you for them if we need them.
            </p>
          )}
        </div>
      </div>
    )
  }

  const price = form.days.length > 0 ? foodTruckPrice(form.days.length) : null

  return (
    <div className="min-h-screen">
      <PublicNav />
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="mb-4 text-3xl font-bold text-white"><span className="text-emboss">{title}</span></h1>
          <div className="space-y-3 text-sm leading-relaxed" style={{ color: '#999' }}>{intro}</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
          <HoneypotField value={honeypot} onChange={setHoneypot} />

          {/* ── Your truck ───────────────────────────────── */}
          <section className="rounded-xl p-6" style={sectionStyle}>
            <h2 className="mb-5 text-base font-semibold text-white">Your truck</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="ft-name" className={labelClass} style={{ color: '#888' }}>Food truck name<Req /></label>
                <input id="ft-name" type="text" required value={form.businessName} onChange={e => set('businessName', e.target.value)} className={inputClass} style={inputStyle} />
                <FieldError msg={errors.businessName} />
              </div>
              <div>
                <label htmlFor="ft-food" className={labelClass} style={{ color: '#888' }}>Type of food<Req /></label>
                <select id="ft-food" required value={form.foodType} onChange={e => set('foodType', e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="">Choose one</option>
                  {FOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value={FOOD_TYPE_OTHER}>Other</option>
                </select>
                <FieldError msg={errors.foodType} />
                {form.foodType === FOOD_TYPE_OTHER && (
                  <div className="mt-3">
                    <label htmlFor="ft-food-other" className={labelClass} style={{ color: '#888' }}>Your type of food<Req /></label>
                    <input id="ft-food-other" type="text" maxLength={60} value={form.foodTypeOther} onChange={e => set('foodTypeOther', e.target.value)} className={inputClass} style={inputStyle} />
                    <FieldError msg={errors.foodTypeOther} />
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="ft-desc" className={labelClass} style={{ color: '#888' }}>Short menu description</label>
                <textarea id="ft-desc" rows={3} maxLength={DESCRIPTION_MAX} value={form.description} onChange={e => set('description', e.target.value)} className={inputClass} style={inputStyle} />
                <p className="mt-1 text-right text-xs" style={{ color: '#555' }}>{form.description.length}/{DESCRIPTION_MAX}</p>
              </div>
            </div>
          </section>

          {/* ── Days ─────────────────────────────────────── */}
          <section className="rounded-xl p-6" style={sectionStyle}>
            <fieldset>
              <legend className="mb-4 text-base font-semibold text-white">Days attending<Req /></legend>
              <div className="flex flex-wrap gap-2">
                {TRUCK_DAYS.map(d => {
                  const on = form.days.includes(d)
                  return (
                    <label
                      key={d}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold focus-within:ring-2 focus-within:ring-[#C4A882]"
                      style={{
                        backgroundColor: on ? 'rgba(139,115,85,0.2)' : 'rgba(255,255,255,0.04)',
                        color: on ? '#C4A882' : '#999',
                        border: `1px solid ${on ? 'rgba(139,115,85,0.5)' : '#2a2a2a'}`,
                      }}
                    >
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleDay(d)} />
                      {TRUCK_DAY_LABELS[d]}
                    </label>
                  )
                })}
              </div>
              <FieldError msg={errors.days} />
              <p className="mt-4 text-sm" style={{ color: '#999' }}>
                {[1, 2, 3].map(n => `${n} day${n > 1 ? 's' : ''} ${formatCurrency(foodTruckPrice(n))}`).join(' · ')}
              </p>
              {price !== null && (
                <p className="mt-2 text-sm font-semibold" style={{ color: '#C4A882' }}>
                  Your fee: {formatCurrency(price)} for {form.days.length} day{form.days.length > 1 ? 's' : ''}
                </p>
              )}
            </fieldset>
          </section>

          {/* ── Contact ──────────────────────────────────── */}
          <section className="rounded-xl p-6" style={sectionStyle}>
            <h2 className="mb-5 text-base font-semibold text-white">Contact</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="ft-contact" className={labelClass} style={{ color: '#888' }}>Contact name<Req /></label>
                <input id="ft-contact" type="text" autoComplete="name" required value={form.contactName} onChange={e => set('contactName', e.target.value)} className={inputClass} style={inputStyle} />
                <FieldError msg={errors.contactName} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ft-phone" className={labelClass} style={{ color: '#888' }}>Phone<Req /></label>
                  <input id="ft-phone" type="tel" autoComplete="tel" required value={form.phone} onChange={e => set('phone', e.target.value)} className={inputClass} style={inputStyle} />
                  <FieldError msg={errors.phone} />
                </div>
                <div>
                  <label htmlFor="ft-email" className={labelClass} style={{ color: '#888' }}>Email<Req /></label>
                  <input id="ft-email" type="email" autoComplete="email" required value={form.email} onChange={e => set('email', e.target.value)} className={inputClass} style={inputStyle} />
                  <FieldError msg={errors.email} />
                </div>
              </div>
              <div>
                <label htmlFor="ft-site" className={labelClass} style={{ color: '#888' }}>Website</label>
                <input id="ft-site" type="url" value={form.website} onChange={e => set('website', e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ft-ig" className={labelClass} style={{ color: '#888' }}>Instagram</label>
                  <input id="ft-ig" type="text" placeholder="@handle" value={form.instagram} onChange={e => set('instagram', e.target.value)} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="ft-fb" className={labelClass} style={{ color: '#888' }}>Facebook</label>
                  <input id="ft-fb" type="text" placeholder="Page name or link" value={form.facebook} onChange={e => set('facebook', e.target.value)} className={inputClass} style={inputStyle} />
                </div>
              </div>
            </div>
          </section>

          {/* ── Logo and photos ──────────────────────────── */}
          <section className="rounded-xl p-6" style={sectionStyle}>
            <h2 className="mb-1 text-base font-semibold text-white">Logo and photos</h2>
            <p className="mb-5 text-xs" style={{ color: '#777' }}>Optional. JPG, PNG or WebP. Logo up to 5 MB; up to {PHOTO_MAX_COUNT} photos, 10 MB each.</p>
            <div className="space-y-5">
              <div>
                <label htmlFor="ft-logo" className={labelClass} style={{ color: '#888' }}>Logo</label>
                <input id="ft-logo" type="file" accept={TRUCK_IMAGE_ACCEPT} onChange={e => pickLogo(e.target.files?.[0])} className="block w-full text-sm" style={{ color: '#999' }} />
                <FieldError msg={errors.logo} />
              </div>
              <div>
                <label htmlFor="ft-photos" className={labelClass} style={{ color: '#888' }}>Photos ({photos.length}/{PHOTO_MAX_COUNT})</label>
                <input
                  id="ft-photos" type="file" multiple accept={TRUCK_IMAGE_ACCEPT}
                  disabled={photos.length >= PHOTO_MAX_COUNT}
                  onChange={e => { addPhotos(e.target.files); e.target.value = '' }}
                  className="block w-full text-sm disabled:opacity-50" style={{ color: '#999' }}
                />
                <FieldError msg={errors.photos ?? errors.files} />
                {photos.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {photos.map((p, i) => (
                      <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#ccc' }}>
                        <span className="truncate">{p.name}</span>
                        <button type="button" onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))} className="shrink-0 font-semibold" style={{ color: '#f87171' }} aria-label={`Remove ${p.name}`}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* ── Requirements ─────────────────────────────── */}
          <section className="rounded-xl p-6" style={sectionStyle}>
            <h2 className="mb-4 text-base font-semibold text-white">Requirements</h2>
            <ul className="space-y-3">
              {FOOD_TRUCK_REQUIREMENTS.map(r => (
                <li key={r} className="flex items-start gap-3 text-sm leading-relaxed" style={{ color: '#ccc' }}>
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} aria-hidden="true" />
                  {r}
                </li>
              ))}
            </ul>
            <label className="mt-6 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox" required checked={form.acknowledged}
                onChange={e => set('acknowledged', e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded" style={{ accentColor: '#8B7355' }}
              />
              <span className="text-sm font-medium text-white">{ackLabel}<Req /></span>
            </label>
            <FieldError msg={errors.acknowledged} />
          </section>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg px-6 py-4 text-sm font-bold uppercase tracking-wider text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#8B7355' }}
          >
            {submitting ? 'Submitting...' : 'Submit application'}
          </button>
        </form>
      </div>
    </div>
  )
}
