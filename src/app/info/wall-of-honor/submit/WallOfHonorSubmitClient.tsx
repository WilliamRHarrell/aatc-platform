'use client'

import { useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import PublicNav from '@/components/PublicNav'
import HoneypotField from '@/components/HoneypotField'
import { createClient } from '@/lib/supabase'
import {
  BRANCHES, BRANCH_OTHER, RELATIONSHIPS, RELATIONSHIP_OTHER, TRIBUTE_MAX,
  WOH_IMAGE_ACCEPT, WOH_IMAGE_TYPES, WOH_PHOTO_MAX_COUNT, WOH_PHOTO_MAX_BYTES, WOH_SUBMISSIONS_BUCKET,
} from '@/lib/wall-of-honor-submission'

// /info/wall-of-honor/submit (104). The route validates and inserts with the
// service role; nothing is inserted from here. Photos go straight to the
// private wall-of-honor-submissions bucket through the signed upload URLs the
// route returns (a request body cannot carry three 10 MB photos), then /files
// records what arrived.

interface FormState {
  honoreeName: string
  rank: string
  branch: string
  branchOther: string
  unit: string
  serviceYears: string
  tribute: string
  yourName: string
  relationship: string
  relationshipOther: string
  email: string
  phone: string
  consent: boolean
  consentSocial: boolean
}

const INITIAL: FormState = {
  honoreeName: '', rank: '', branch: '', branchOther: '', unit: '', serviceYears: '', tribute: '',
  yourName: '', relationship: '', relationshipOther: '', email: '', phone: '', consent: false, consentSocial: false,
}

const inputClass = 'w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors focus:border-[#8B7355]'
const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' } as const
const labelClass = 'mb-1.5 block text-xs font-medium'
const fileClass = 'block w-full text-sm text-[#999] file:mr-4 file:cursor-pointer file:rounded-lg file:border file:border-solid file:border-[#8B7355]/40 file:bg-[#8B7355]/15 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-[#C4A882] hover:file:bg-[#8B7355]/25 disabled:opacity-50'
const sectionStyle = { backgroundColor: '#111', border: '1px solid #1a1a1a' } as const
const OTHER_MAX = 60

function Req() {
  return <span style={{ color: '#C4A882' }}> *</span>
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs" style={{ color: '#f87171' }}>{msg}</p> : null
}

/** Mirrors the route's per-photo rules so a bad file is refused before submit. */
function checkPhoto(file: File): { ok: true } | { ok: false; error: string } {
  if (!WOH_IMAGE_TYPES[file.type]) return { ok: false, error: 'Photos must be JPG, PNG or WebP.' }
  if (file.size <= 0 || file.size > WOH_PHOTO_MAX_BYTES) return { ok: false, error: `Each photo must be ${WOH_PHOTO_MAX_BYTES / 1024 / 1024} MB or smaller.` }
  return { ok: true }
}

export default function WallOfHonorSubmitClient({
  title, intro, deadlineLine, reviewNote, consentLabel, consentSocialLabel, successTitle, successBody,
}: {
  title: string
  intro: ReactNode
  deadlineLine: string
  reviewNote: string
  consentLabel: string
  consentSocialLabel: string
  successTitle: string
  successBody: ReactNode
}) {
  const [form, setForm] = useState<FormState>(INITIAL)
  const [photos, setPhotos] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [honeypot, setHoneypot] = useState('')
  const [mountedAt] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ filesMissing: number } | null>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const addPhotos = (list: FileList | null) => {
    if (!list) return
    const next = [...photos]
    for (const file of Array.from(list)) {
      if (next.length >= WOH_PHOTO_MAX_COUNT) { toast.error(`Up to ${WOH_PHOTO_MAX_COUNT} photos.`); break }
      const c = checkPhoto(file)
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
      // The route's upload `index` follows this order; the first is the main photo.
      const manifest = photos.map(file => ({ type: file.type, size: file.size }))
      const res = await fetch('/api/wall-of-honor-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
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

      // The tribute is saved. A photo that fails here is reported, not fatal.
      let uploaded = 0
      if (photos.length > 0) {
        const sb = createClient()
        const results = await Promise.all((json.uploads ?? []).map(async u => {
          const file = photos[u.index]
          if (!file) return false
          const { error } = await sb.storage.from(WOH_SUBMISSIONS_BUCKET).uploadToSignedUrl(u.path, u.token, file, { contentType: file.type })
          return !error
        }))
        uploaded = results.filter(Boolean).length
        if (uploaded > 0) {
          await fetch('/api/wall-of-honor-submit/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: json.id }),
          }).catch(() => undefined)
        }
      }
      setDone({ filesMissing: photos.length - uploaded })
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
          <h1 className="mb-3 text-2xl font-bold text-white">{successTitle}</h1>
          <div className="text-sm leading-relaxed" style={{ color: '#999' }}>{successBody}</div>
          {done.filesMissing > 0 && (
            <p className="mt-4 text-sm leading-relaxed" style={{ color: '#eab308' }}>
              {done.filesMissing === 1 ? 'One of your photos' : `${done.filesMissing} of your photos`} did not upload. Your tribute is saved; we will ask you for them if we need them.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <PublicNav />
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="mb-4 text-3xl font-bold text-white"><span className="text-emboss">{title}</span></h1>
          <div className="space-y-3 text-sm leading-relaxed" style={{ color: '#999' }}>{intro}</div>
          <p className="mt-4 text-sm font-semibold" style={{ color: '#C4A882' }}>{deadlineLine}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
          <HoneypotField value={honeypot} onChange={setHoneypot} />

          {/* ── Honoree ──────────────────────────────────── */}
          <section className="rounded-xl p-6" style={sectionStyle}>
            <h2 className="mb-5 text-base font-semibold text-white">Honoree</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="woh-name" className={labelClass} style={{ color: '#888' }}>Full name<Req /></label>
                <input id="woh-name" type="text" required value={form.honoreeName} onChange={e => set('honoreeName', e.target.value)} className={inputClass} style={inputStyle} />
                <FieldError msg={errors.honoreeName} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="woh-rank" className={labelClass} style={{ color: '#888' }}>Rank</label>
                  <input id="woh-rank" type="text" value={form.rank} onChange={e => set('rank', e.target.value)} className={inputClass} style={inputStyle} />
                  <FieldError msg={errors.rank} />
                </div>
                <div>
                  <label htmlFor="woh-years" className={labelClass} style={{ color: '#888' }}>Years of service</label>
                  <input id="woh-years" type="text" placeholder="2004-2011" value={form.serviceYears} onChange={e => set('serviceYears', e.target.value)} className={inputClass} style={inputStyle} />
                  <FieldError msg={errors.serviceYears} />
                </div>
              </div>
              <div>
                <label htmlFor="woh-branch" className={labelClass} style={{ color: '#888' }}>Branch of service<Req /></label>
                <select id="woh-branch" required value={form.branch} onChange={e => set('branch', e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="">Choose one</option>
                  {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  <option value={BRANCH_OTHER}>Other</option>
                </select>
                <FieldError msg={errors.branch} />
                {form.branch === BRANCH_OTHER && (
                  <div className="mt-3">
                    <label htmlFor="woh-branch-other" className={labelClass} style={{ color: '#888' }}>Branch of service<Req /></label>
                    <input id="woh-branch-other" type="text" maxLength={OTHER_MAX} value={form.branchOther} onChange={e => set('branchOther', e.target.value)} className={inputClass} style={inputStyle} />
                    <FieldError msg={errors.branchOther} />
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="woh-unit" className={labelClass} style={{ color: '#888' }}>Unit</label>
                <input id="woh-unit" type="text" value={form.unit} onChange={e => set('unit', e.target.value)} className={inputClass} style={inputStyle} />
                <FieldError msg={errors.unit} />
              </div>
            </div>
          </section>

          {/* ── Photos ───────────────────────────────────── */}
          <section className="rounded-xl p-6" style={sectionStyle}>
            <h2 className="mb-1 text-base font-semibold text-white">Photos<Req /></h2>
            <p className="mb-5 text-xs" style={{ color: '#777' }}>
              JPG, PNG or WebP, up to {WOH_PHOTO_MAX_COUNT} photos, {WOH_PHOTO_MAX_BYTES / 1024 / 1024} MB each. The first photo is the main photo.
            </p>
            <label htmlFor="woh-photos" className={labelClass} style={{ color: '#888' }}>Photos ({photos.length}/{WOH_PHOTO_MAX_COUNT})</label>
            <input
              id="woh-photos" type="file" multiple accept={WOH_IMAGE_ACCEPT}
              disabled={photos.length >= WOH_PHOTO_MAX_COUNT}
              onChange={e => { addPhotos(e.target.files); e.target.value = '' }}
              // The list below names the chosen photos; the browser's own
              // "No file chosen" would contradict it once the input is reset.
              className={`${fileClass} text-transparent`}
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
          </section>

          {/* ── Tribute ──────────────────────────────────── */}
          <section className="rounded-xl p-6" style={sectionStyle}>
            <h2 className="mb-5 text-base font-semibold text-white">Tribute</h2>
            <label htmlFor="woh-tribute" className={labelClass} style={{ color: '#888' }}>Your tribute<Req /></label>
            <textarea id="woh-tribute" rows={8} required value={form.tribute} onChange={e => set('tribute', e.target.value)} className={inputClass} style={inputStyle} />
            <p className="mt-1 text-right text-xs" style={{ color: form.tribute.length > TRIBUTE_MAX ? '#f87171' : '#555' }}>{form.tribute.length} / {TRIBUTE_MAX}</p>
            <FieldError msg={errors.tribute} />
          </section>

          {/* ── About you ────────────────────────────────── */}
          <section className="rounded-xl p-6" style={sectionStyle}>
            <h2 className="mb-5 text-base font-semibold text-white">About you</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="woh-yourname" className={labelClass} style={{ color: '#888' }}>Your name<Req /></label>
                <input id="woh-yourname" type="text" autoComplete="name" required value={form.yourName} onChange={e => set('yourName', e.target.value)} className={inputClass} style={inputStyle} />
                <FieldError msg={errors.yourName} />
              </div>
              <div>
                <label htmlFor="woh-rel" className={labelClass} style={{ color: '#888' }}>Relationship to the honoree<Req /></label>
                <select id="woh-rel" required value={form.relationship} onChange={e => set('relationship', e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="">Choose one</option>
                  {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                  <option value={RELATIONSHIP_OTHER}>Other</option>
                </select>
                <FieldError msg={errors.relationship} />
                {form.relationship === RELATIONSHIP_OTHER && (
                  <div className="mt-3">
                    <label htmlFor="woh-rel-other" className={labelClass} style={{ color: '#888' }}>Your relationship<Req /></label>
                    <input id="woh-rel-other" type="text" maxLength={OTHER_MAX} value={form.relationshipOther} onChange={e => set('relationshipOther', e.target.value)} className={inputClass} style={inputStyle} />
                    <FieldError msg={errors.relationshipOther} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="woh-email" className={labelClass} style={{ color: '#888' }}>Email<Req /></label>
                  <input id="woh-email" type="email" autoComplete="email" required value={form.email} onChange={e => set('email', e.target.value)} className={inputClass} style={inputStyle} />
                  <FieldError msg={errors.email} />
                </div>
                <div>
                  <label htmlFor="woh-phone" className={labelClass} style={{ color: '#888' }}>Phone</label>
                  <input id="woh-phone" type="tel" autoComplete="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputClass} style={inputStyle} />
                  <FieldError msg={errors.phone} />
                </div>
              </div>
            </div>
          </section>

          {/* ── Consent ──────────────────────────────────── */}
          <section className="rounded-xl p-6" style={sectionStyle}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox" required checked={form.consent}
                onChange={e => set('consent', e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded" style={{ accentColor: '#8B7355' }}
              />
              <span className="text-sm font-medium text-white">{consentLabel}<Req /></span>
            </label>
            <FieldError msg={errors.consent} />
            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox" checked={form.consentSocial}
                onChange={e => set('consentSocial', e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded" style={{ accentColor: '#8B7355' }}
              />
              <span className="text-sm text-white">{consentSocialLabel}</span>
            </label>
            <p className="mt-5 text-xs leading-relaxed" style={{ color: '#777' }}>{reviewNote}</p>
          </section>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg px-6 py-4 text-sm font-bold uppercase tracking-wider text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#8B7355' }}
          >
            {submitting ? 'Submitting...' : 'Submit tribute'}
          </button>
        </form>
      </div>
    </div>
  )
}
