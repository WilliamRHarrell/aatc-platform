'use client'

/**
 * The admin application editor form (editor PR 2, Ryan 2026-10-09): build a
 * whole application on someone's behalf. Rules live in lib/admin-application.ts
 * and the I/O in POST /api/admin/applications/editor; this form only collects
 * and uploads. Editor PR 3 opens existing applications in the same form.
 *
 * Files need the application id, so a new application saves first, then
 * uploads, then saves again with the file references:
 *   - artist IDs, vendor ID, veteran ID: private application-docs, admin/<id>/...
 *     (the booth page's admin pattern; read with signed URLs only);
 *   - logo, artist photos and portfolios: public exhibitor-media, <id>/...
 * Names carry a timestamp: admin may insert into both buckets but not
 * overwrite (no admin UPDATE policy), so a replacement is a new object.
 *
 * After a save the form stays open on that application (every later save
 * updates it), so IDs can be marked verified here (set_artist_id_verified, 088)
 * and anything that did not save can be retried without creating a duplicate.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { BIO_MAX, type EditorArtist, type EditorInput, type MoneyChoice } from '@/lib/admin-application'
import { addOnOptions, calculatePricing, usd, type AddOn, type AddOnTerm } from '@/lib/pricing'
import { artistCapacity } from '@/lib/artist-roster'
import { compInvoiceAmount } from '@/lib/comp'
import { TATTOO_STYLES } from '@/lib/tattoo-styles'

const DOC_TYPES = 'image/jpeg,image/png,image/webp,application/pdf'
const IMAGE_TYPES = 'image/jpeg,image/png,image/webp'
const MAX_PORTFOLIO = 10

type ExhibitorType = 'artist' | 'vendor'
type MoneyMode = MoneyChoice['mode']

interface ArtistDraft {
  name: string
  nickname: string
  instagram: string
  styles: string[]
  bio: string
  tv_credit: string
  id_later: boolean
  /** Saved references. */
  photo_url: string | null
  portfolio_urls: string[]
  id_url: string | null
  /** Picked, not yet uploaded. */
  photo_file: File | null
  portfolio_files: File[]
  id_file: File | null
  /** From set_artist_id_verified; lost when the ID file is replaced (088). */
  verified: boolean
}

const blankArtist = (): ArtistDraft => ({
  name: '', nickname: '', instagram: '', styles: [], bio: '', tv_credit: '', id_later: false,
  photo_url: null, portfolio_urls: [], id_url: null, photo_file: null, portfolio_files: [], id_file: null, verified: false,
})

const isBlank = (a: ArtistDraft) =>
  !a.name.trim() && !a.nickname.trim() && !a.instagram.trim() && a.styles.length === 0 && !a.bio.trim()
  && !a.tv_credit.trim() && !a.photo_url && a.portfolio_urls.length === 0 && !a.id_url
  && !a.photo_file && a.portfolio_files.length === 0 && !a.id_file

/** Blank roster slots move to the end, so a slot's index is the saved index (storage paths, ID verification). */
function compact(artists: ArtistDraft[], count: number): ArtistDraft[] {
  const filled = artists.filter(a => !isBlank(a))
  return [...filled, ...Array.from({ length: Math.max(0, count - filled.length) }, blankArtist)].slice(0, Math.max(count, filled.length))
}

const ext = (f: File) => (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
const publicPath = (url: string) => url.split('/exhibitor-media/')[1] ?? null

// ── small UI pieces ──────────────────────────────────────────
const inputCls = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none'
const inputSty: React.CSSProperties = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }
const errSty: React.CSSProperties = { ...inputSty, border: '1px solid #ef4444' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <p className="mb-4 text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>{title}</p>
      {children}
    </div>
  )
}

function Field({ label, error, hint, children, wide }: { label: string; error?: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: '#999' }}>{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs" style={{ color: '#666' }}>{hint}</span>}
      {error && <span className="mt-1 block text-xs" style={{ color: '#ef4444' }}>{error}</span>}
    </label>
  )
}

function Choice({ checked, onChange, label, detail, name }: { checked: boolean; onChange: () => void; label: string; detail?: string; name: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: checked ? 'rgba(139,115,85,0.12)' : '#0a0a0a', border: `1px solid ${checked ? '#8B7355' : '#2a2a2a'}` }}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1" />
      <span>
        <span className="block text-sm text-white">{label}</span>
        {detail && <span className="block text-xs" style={{ color: '#999' }}>{detail}</span>}
      </span>
    </label>
  )
}

function Qty({ value, onChange, max }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <input type="number" min={0} max={max} value={value}
      onChange={e => onChange(Math.max(0, Math.min(max ?? Infinity, Math.floor(Number(e.target.value) || 0))))}
      className={inputCls} style={{ ...inputSty, maxWidth: 96 }} />
  )
}

/** A saved file with a remove button, or a picker for a new one. */
function FilePick({ label, saved, savedLabel, file, accept, onFile, onRemove, hint, disabled }: {
  label: string; saved: string | null; savedLabel?: string; file: File | null; accept: string
  onFile: (f: File | null) => void; onRemove: () => void; hint?: string; disabled?: boolean
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: '#999' }}>{label}</span>
      {saved && !file ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white">{savedLabel ?? 'Saved'}</span>
          {!disabled && <button type="button" onClick={onRemove} className="text-xs underline" style={{ color: '#999' }}>Remove</button>}
        </div>
      ) : (
        <input type="file" accept={accept} disabled={disabled} onChange={e => onFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs" style={{ color: '#999' }} />
      )}
      {file && <span className="mt-1 block text-xs" style={{ color: '#C4A882' }}>{file.name} (uploads on save)</span>}
      {hint && <span className="mt-1 block text-xs" style={{ color: '#666' }}>{hint}</span>}
    </div>
  )
}

// ── the form ─────────────────────────────────────────────────
export default function ApplicationEditorForm() {
  const supabase = createClient()

  const [type, setType] = useState<ExhibitorType>('artist')
  const [contact, setContact] = useState({ business_name: '', contact_name: '', email: '', phone: '', website: '', instagram: '', facebook: '', other_links: '', notes: '' })
  const [singles, setSingles] = useState(1)
  const [doubles, setDoubles] = useState(0)
  const [corners, setCorners] = useState(0)
  const [addOns, setAddOns] = useState<AddOn[]>([])
  const [isVeteran, setIsVeteran] = useState(false)
  const [artistCount, setArtistCount] = useState(1)
  const [artists, setArtists] = useState<ArtistDraft[]>([blankArtist()])
  const [tvFeatured, setTvFeatured] = useState<boolean | null>(null)
  const [tvShow, setTvShow] = useState('')

  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [idDocUrl, setIdDocUrl] = useState<string | null>(null)
  const [idDocFile, setIdDocFile] = useState<File | null>(null)
  const [vetUrl, setVetUrl] = useState<string | null>(null)
  const [vetFile, setVetFile] = useState<File | null>(null)

  const [status, setStatus] = useState<'pending' | 'approved'>('pending')
  const [moneyMode, setMoneyMode] = useState<MoneyMode>('standard')
  const [customDollars, setCustomDollars] = useState('')
  const [confirmedBelowList, setConfirmedBelowList] = useState(false)

  const [appId, setAppId] = useState<string | null>(null)
  const [savedStatus, setSavedStatus] = useState<'pending' | 'approved' | null>(null)
  const [removedPublic, setRemovedPublic] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [askConfirm, setAskConfirm] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [verifying, setVerifying] = useState<number | null>(null)

  const isArtist = type === 'artist'
  const capacity = isArtist ? artistCapacity({ booth_size: null, artist_single_qty: singles, artist_double_qty: doubles }) : 0
  const boothCount = singles + doubles

  const listCents = useMemo(() => boothCount === 0 ? 0 : calculatePricing({
    exhibitorType: type,
    artistSingleQty: isArtist ? singles : 0, artistDoubleQty: isArtist ? doubles : 0,
    vendorSingleQty: isArtist ? 0 : singles, vendorDoubleQty: isArtist ? 0 : doubles,
    cornerCount: Math.min(corners, boothCount), artistCount: isArtist ? artistCount : 0,
    isVeteran, addOns,
  }).total, [type, isArtist, singles, doubles, corners, boothCount, artistCount, isVeteran, addOns])

  const compPreview = (booth: boolean, permits: boolean) => compInvoiceAmount({
    exhibitor_type: type, total_amount: listCents,
    comped_at: booth ? 'x' : null, permits_comped_at: permits ? 'x' : null,
    artist_single_qty: isArtist ? singles : 0, artist_double_qty: isArtist ? doubles : 0,
    vendor_single_qty: isArtist ? 0 : singles, vendor_double_qty: isArtist ? 0 : doubles,
    corner_count: Math.min(corners, boothCount), artist_count: isArtist ? artistCount : 0, is_veteran: isVeteran, add_ons: addOns,
  })

  const customCents = Math.round((parseFloat(customDollars) || 0) * 100)
  const customBelowList = moneyMode === 'custom' && customDollars !== '' && customCents < listCents

  const setCount = (n: number) => {
    const c = Math.max(1, Math.floor(n) || 1)
    setArtistCount(c)
    setArtists(prev => prev.length >= c ? prev.slice(0, c) : [...prev, ...Array.from({ length: c - prev.length }, blankArtist)])
  }
  const patchArtist = (i: number, patch: Partial<ArtistDraft>) => setArtists(prev => prev.map((a, k) => k === i ? { ...a, ...patch } : a))
  const setAddOn = (kind: AddOn['kind'], term: AddOnTerm, qty: number) =>
    setAddOns(prev => { const others = prev.filter(a => a.kind !== kind); return qty > 0 ? [...others, { kind, term, qty }] : others })

  const money = (confirmed: boolean): MoneyChoice => moneyMode === 'custom'
    ? { mode: 'custom', totalCents: customDollars === '' ? -1 : customCents, confirmedBelowList: confirmed }
    : { mode: moneyMode }

  const buildInput = (roster: ArtistDraft[], refs: { logo: string | null; idDoc: string | null; vet: string | null }, confirmed: boolean): EditorInput => ({
    exhibitor_type: type,
    ...contact,
    artist_single_qty: isArtist ? singles : 0, artist_double_qty: isArtist ? doubles : 0,
    vendor_single_qty: isArtist ? 0 : singles, vendor_double_qty: isArtist ? 0 : doubles,
    corner_count: Math.min(corners, boothCount),
    add_ons: addOns,
    artist_count: isArtist ? artistCount : 0,
    is_veteran: isVeteran,
    tv_show_featured: isArtist ? tvFeatured : null,
    tv_show: tvShow,
    logo_url: refs.logo,
    id_doc_url: isArtist ? null : refs.idDoc,
    veteran_id_url: isVeteran ? refs.vet : null,
    artists: isArtist ? roster.filter(a => !isBlank(a)).map((a): EditorArtist => ({
      name: a.name, nickname: a.nickname, instagram: a.instagram, styles: a.styles, bio: a.bio, tv_credit: a.tv_credit,
      photo_url: a.photo_url, portfolio_urls: a.portfolio_urls, id_url: a.id_url, id_later: a.id_later,
    })) : [],
    status,
    money: money(confirmed),
  })

  type SaveResult = { ok: true; id: string; problems: string[] } | { ok: false }
  const post = async (id: string | null, input: EditorInput): Promise<SaveResult> => {
    let res: Response
    try {
      res = await fetch('/api/admin/applications/editor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, input }),
      })
    } catch {
      toast.error('Not saved: the request did not reach the server.')
      return { ok: false }
    }
    const json = await res.json().catch(() => ({})) as { id?: string; problems?: string[]; error?: string; errors?: Record<string, string>; needsConfirm?: boolean }
    if (res.ok && json.id) { setErrors({}); return { ok: true, id: json.id, problems: json.problems ?? [] } }
    if (json.needsConfirm) { setAskConfirm(json.error ?? 'The agreed total is below the list price.'); return { ok: false } }
    setErrors(json.errors ?? {})
    toast.error(json.error ?? `Not saved (HTTP ${res.status})`)
    return { ok: false }
  }

  /** Uploads every picked file for application `id`; returns the new references and what failed. */
  const uploadAll = async (id: string, roster: ArtistDraft[]) => {
    const failed: string[] = []
    const ts = Date.now()
    const putPrivate = async (path: string, f: File, what: string) => {
      const { data, error } = await supabase.storage.from('application-docs').upload(path, f)
      if (error || !data) { failed.push(`${what} (${error?.message ?? 'no path'})`); return null }
      return data.path
    }
    const putPublic = async (path: string, f: File, what: string) => {
      const { error } = await supabase.storage.from('exhibitor-media').upload(path, f)
      if (error) { failed.push(`${what} (${error.message})`); return null }
      return supabase.storage.from('exhibitor-media').getPublicUrl(path).data.publicUrl
    }

    let logo = logoUrl, idDoc = idDocUrl, vet = vetUrl
    if (logoFile) logo = (await putPublic(`${id}/logo-${ts}.${ext(logoFile)}`, logoFile, 'logo')) ?? logoUrl
    if (!isArtist && idDocFile) idDoc = (await putPrivate(`admin/${id}/id-${ts}.${ext(idDocFile)}`, idDocFile, 'vendor ID')) ?? idDocUrl
    if (isVeteran && vetFile) vet = (await putPrivate(`admin/${id}/veteran-id-${ts}.${ext(vetFile)}`, vetFile, 'veteran ID')) ?? vetUrl

    const nextRoster: ArtistDraft[] = []
    for (let i = 0; i < roster.length; i++) {
      const a = { ...roster[i] }
      const who = `artist ${i + 1}`
      if (a.id_file) {
        const p = await putPrivate(`admin/${id}/artist-${i + 1}-id-${ts}.${ext(a.id_file)}`, a.id_file, `${who} ID`)
        if (p) { a.id_url = p; a.id_later = false; a.verified = false; a.id_file = null }
      }
      if (a.photo_file) {
        const u = await putPublic(`${id}/artists/${i}/photo-${ts}.${ext(a.photo_file)}`, a.photo_file, `${who} photo`)
        if (u) { a.photo_url = u; a.photo_file = null }
      }
      if (a.portfolio_files.length) {
        const left: File[] = []
        for (let j = 0; j < a.portfolio_files.length; j++) {
          const f = a.portfolio_files[j]
          const u = await putPublic(`${id}/artists/${i}/${ts}-${j}.${ext(f)}`, f, `${who} portfolio image ${f.name}`)
          if (u) a.portfolio_urls = [...a.portfolio_urls, u]; else left.push(f)
        }
        a.portfolio_files = left
      }
      nextRoster.push(a)
    }
    return { refs: { logo, idDoc, vet }, roster: nextRoster, failed }
  }

  const hasPendingFiles = (roster: ArtistDraft[]) =>
    !!logoFile || (!isArtist && !!idDocFile) || (isVeteran && !!vetFile)
    || (isArtist && roster.some(a => a.id_file || a.photo_file || a.portfolio_files.length))

  const save = async (confirmed = confirmedBelowList) => {
    if (saving) return
    for (const [i, a] of artists.entries()) {
      if (isArtist && !isBlank(a) && !a.name.trim()) { setErrors({ [`artists.${i}.name`]: `Artist ${i + 1}: legal name is required.` }); toast.error(`Artist ${i + 1} needs a legal name.`); return }
    }
    setSaving(true); setAskConfirm(null); setWarnings([])
    let roster = isArtist ? compact(artists, artistCount) : artists
    setArtists(roster)
    let refs = { logo: logoUrl, idDoc: idDocUrl, vet: vetUrl }
    const failed: string[] = []
    let id = appId

    try {
      // A new application with files: create it first, so the files have a folder.
      if (!id && hasPendingFiles(roster)) {
        const first = await post(null, buildInput(roster, refs, confirmed))
        if (!first.ok) return
        id = first.id
        setAppId(id)
      }
      if (id && hasPendingFiles(roster)) {
        const up = await uploadAll(id, roster)
        roster = up.roster; refs = up.refs; failed.push(...up.failed)
        setArtists(roster)
        setLogoUrl(refs.logo); if (refs.logo !== logoUrl) setLogoFile(null)
        setIdDocUrl(refs.idDoc); if (refs.idDoc !== idDocUrl) setIdDocFile(null)
        setVetUrl(refs.vet); if (refs.vet !== vetUrl) setVetFile(null)
      }
      const result = await post(id, buildInput(roster, refs, confirmed))
      if (!result.ok) {
        if (id) setWarnings([`The application exists, but this save did not go through. Fix the problem and save again.${failed.length ? ` Also not uploaded: ${failed.join('; ')}.` : ''}`])
        return
      }
      setAppId(result.id)
      setSavedStatus(status)

      // Removed public images: delete the objects now that the row no longer names them.
      if (removedPublic.length) {
        const paths = removedPublic.map(publicPath).filter((p): p is string => !!p)
        if (paths.length) await supabase.storage.from('exhibitor-media').remove(paths)
        setRemovedPublic([])
      }

      const notes = [
        ...result.problems.map(p => `Saved, but ${p}.`),
        ...(failed.length ? [`Not uploaded: ${failed.join('; ')}. Pick those files again and save.`] : []),
      ]
      setWarnings(notes)
      if (notes.length) toast.error('Saved, with problems: see the top of the form.')
      else toast.success(appId ? 'Saved' : 'Application created')
    } finally {
      setSaving(false)
    }
  }

  const verify = async (i: number, on: boolean) => {
    if (!appId) return
    setVerifying(i)
    const { data, error } = await supabase.rpc('set_artist_id_verified', { p_application_id: appId, p_index: i, p_verified: on })
    setVerifying(null)
    if (error) { toast.error(`Not saved: ${error.message}`); return }
    const v = (data as { id_verified_at?: string } | null)?.id_verified_at
    patchArtist(i, { verified: typeof v === 'string' && v.length > 0 })
    toast.success(on ? `Artist ${i + 1}: ID verified` : `Artist ${i + 1}: verification removed`)
  }

  const removePublic = (url: string | null) => { if (url) setRemovedPublic(prev => [...prev, url]) }

  // ── render ──
  return (
    <div className="space-y-5 pb-24">
      {appId && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }}>
          Saved as {savedStatus === 'approved' ? 'approved' : 'pending'}. Later saves update this application.{' '}
          <Link href={`/admin/applications?open=${appId}`} className="font-semibold underline">Open in Applications</Link>
          {' '}(Invite &amp; link, veteran document, comp controls).
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.35)', color: '#fde68a' }}>
          {warnings.map(w => <p key={w}>{w}</p>)}
        </div>
      )}

      <Section title="Exhibitor type">
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="type" checked={isArtist} onChange={() => setType('artist')} label="Artist" detail="Tattoo booth, with a roster of artists" />
          <Choice name="type" checked={!isArtist} onChange={() => setType('vendor')} label="Vendor" detail="Vendor booth, no roster" />
        </div>
        {appId && <p className="mt-2 text-xs" style={{ color: '#666' }}>Changing the type of a saved application re-prices it on the next save.</p>}
      </Section>

      <Section title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ['business_name', 'Business / shop name'], ['contact_name', 'Contact name'], ['email', 'Email'], ['phone', 'Phone'],
            ['website', 'Website'], ['instagram', 'Instagram'], ['facebook', 'Facebook'],
          ] as const).map(([k, label]) => (
            <Field key={k} label={label} error={errors[k]}>
              <input type={k === 'email' ? 'email' : 'text'} value={contact[k]} onChange={e => setContact(p => ({ ...p, [k]: e.target.value }))}
                className={inputCls} style={errors[k] ? errSty : inputSty} />
            </Field>
          ))}
          <Field label="Other links" wide>
            <textarea rows={2} value={contact.other_links} onChange={e => setContact(p => ({ ...p, other_links: e.target.value }))} className={inputCls} style={inputSty} />
          </Field>
          <Field label="Notes" wide hint="The applicant's notes, as on the public form.">
            <textarea rows={3} value={contact.notes} onChange={e => setContact(p => ({ ...p, notes: e.target.value }))} className={inputCls} style={inputSty} />
          </Field>
        </div>
        <p className="mt-3 text-xs" style={{ color: '#666' }}>No account is needed. Invite &amp; link (in the drawer) gives the person access later. No email is sent from here.</p>
      </Section>

      <Section title="Booth">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Single booths (10×10)"><Qty value={singles} onChange={setSingles} /></Field>
          <Field label="Double booths (10×20)"><Qty value={doubles} onChange={setDoubles} /></Field>
          <Field label="Corners"><Qty value={Math.min(corners, boothCount)} onChange={setCorners} max={boothCount} /></Field>
        </div>
        {errors.booths && <p className="mt-2 text-xs" style={{ color: '#ef4444' }}>{errors.booths}</p>}

        <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide" style={{ color: '#999' }}>Add-ons</p>
        <div className="space-y-2">
          {addOnOptions().map(opt => {
            const cur = addOns.find(a => a.kind === opt.kind)
            const term = cur?.term ?? opt.terms[0].value
            return (
              <div key={opt.kind} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="w-36 text-white">{opt.label}</span>
                {opt.terms.length > 1 ? (
                  <select value={term ?? ''} onChange={e => setAddOn(opt.kind, (e.target.value || null) as AddOnTerm, cur?.qty ?? 0)}
                    className="rounded-lg px-2 py-1.5 text-sm text-white" style={inputSty}>
                    {opt.terms.map(t => <option key={String(t.value)} value={t.value ?? ''}>{t.label}</option>)}
                  </select>
                ) : <span className="text-xs" style={{ color: '#999' }}>{opt.terms[0].label}</span>}
                <Qty value={cur?.qty ?? 0} onChange={n => setAddOn(opt.kind, term, n)} />
              </div>
            )
          })}
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={isVeteran} onChange={e => setIsVeteran(e.target.checked)} /> Veteran (discount applies)
        </label>
        {isVeteran && (
          <div className="mt-3 max-w-md">
            <FilePick label="Veteran ID document (optional here)" saved={vetUrl} savedLabel="Document saved" file={vetFile} accept={DOC_TYPES}
              onFile={setVetFile} onRemove={() => setVetUrl(null)} hint="DD-214, military ID or equivalent. Verify it in the Applications drawer." />
          </div>
        )}
        {!isArtist && (
          <div className="mt-5 max-w-md">
            <FilePick label="Vendor ID document (optional here)" saved={idDocUrl} savedLabel="ID saved" file={idDocFile} accept={DOC_TYPES}
              onFile={setIdDocFile} onRemove={() => setIdDocUrl(null)} hint="The public form requires one; add it here when you have it." />
          </div>
        )}
      </Section>

      {isArtist && (
        <Section title="Artists">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Artist count" error={errors.artist_count} hint={`At most ${capacity} for these booths (2 per single, 4 per double).`}>
              <input type="number" min={1} max={capacity || undefined} value={artistCount} onChange={e => setCount(Number(e.target.value))}
                className={inputCls} style={{ ...(errors.artist_count ? errSty : inputSty), maxWidth: 96 }} />
            </Field>
          </div>
          {errors.artists && <p className="mt-2 text-xs" style={{ color: '#ef4444' }}>{errors.artists}</p>}
          <p className="mt-2 text-xs" style={{ color: '#666' }}>
            Leave a slot empty if you do not know the artist yet; the application stays off the directory until every artist has an ID or &quot;ID later&quot;.
          </p>

          <div className="mt-4 space-y-4">
            {artists.map((a, i) => (
              <div key={i} className="rounded-xl p-4" style={{ backgroundColor: '#111', border: `1px solid ${errors[`artists.${i}.name`] ? '#ef4444' : '#2a2a2a'}` }}>
                <p className="mb-3 text-sm font-semibold text-white">Artist {i + 1}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Legal name" error={errors[`artists.${i}.name`]}>
                    <input value={a.name} onChange={e => patchArtist(i, { name: e.target.value })} className={inputCls} style={inputSty} />
                  </Field>
                  <Field label="Artist name (nickname)">
                    <input value={a.nickname} onChange={e => patchArtist(i, { nickname: e.target.value })} className={inputCls} style={inputSty} />
                  </Field>
                  <Field label="Instagram">
                    <input value={a.instagram} onChange={e => patchArtist(i, { instagram: e.target.value })} className={inputCls} style={inputSty} />
                  </Field>
                  <Field label="TV credit" hint="Shown on the VIP page. Without one, the application's TV show is used only for a one-artist roster.">
                    <input value={a.tv_credit} onChange={e => patchArtist(i, { tv_credit: e.target.value })} className={inputCls} style={inputSty} />
                  </Field>
                  <Field label={`Bio (${a.bio.length}/${BIO_MAX})`} wide hint="Optional. Public on the directory and the VIP page.">
                    <textarea rows={3} maxLength={BIO_MAX} value={a.bio} onChange={e => patchArtist(i, { bio: e.target.value })} className={inputCls} style={inputSty} />
                  </Field>
                </div>

                <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: '#999' }}>Styles</p>
                <div className="flex flex-wrap gap-1.5">
                  {TATTOO_STYLES.map(s => {
                    const on = a.styles.includes(s)
                    return (
                      <button key={s} type="button" onClick={() => patchArtist(i, { styles: on ? a.styles.filter(x => x !== s) : [...a.styles, s] })}
                        className="rounded-full px-2.5 py-1 text-xs"
                        style={{ backgroundColor: on ? 'rgba(139,115,85,0.2)' : 'transparent', color: on ? '#C4A882' : '#777', border: `1px solid ${on ? '#8B7355' : '#2a2a2a'}` }}>
                        {s}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <FilePick label="ID" saved={a.id_url} savedLabel={a.verified ? 'ID saved, verified' : 'ID saved'} file={a.id_file} accept={DOC_TYPES}
                      disabled={a.id_later}
                      onFile={f => patchArtist(i, { id_file: f, id_later: f ? false : a.id_later })}
                      onRemove={() => patchArtist(i, { id_url: null, verified: false })} />
                    {!a.id_url && !a.id_file && (
                      <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: '#eab308' }}>
                        <input type="checkbox" checked={a.id_later} onChange={e => patchArtist(i, { id_later: e.target.checked })} /> ID later
                      </label>
                    )}
                    {appId && a.id_url && !a.id_file && (
                      <button type="button" disabled={verifying === i} onClick={() => verify(i, !a.verified)}
                        className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{ border: '1px solid #8B7355', color: a.verified ? '#999' : '#C4A882', opacity: verifying === i ? 0.5 : 1 }}>
                        {a.verified ? 'Unverify' : 'Mark ID verified'}
                      </button>
                    )}
                    {!appId && a.id_file && <p className="mt-1 text-xs" style={{ color: '#666' }}>Mark it verified after the first save.</p>}
                  </div>
                  <FilePick label="Photo" saved={a.photo_url} savedLabel="Photo saved" file={a.photo_file} accept={IMAGE_TYPES}
                    onFile={f => patchArtist(i, { photo_file: f })}
                    onRemove={() => { removePublic(a.photo_url); patchArtist(i, { photo_url: null }) }}
                    hint="Headshot for the VIP page; without one the first portfolio image is used." />
                </div>

                <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: '#999' }}>
                  Portfolio ({a.portfolio_urls.length + a.portfolio_files.length}/{MAX_PORTFOLIO})
                </p>
                {a.portfolio_urls.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {a.portfolio_urls.map(u => (
                      <div key={u} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-16 w-16 rounded-lg object-cover" />
                        <button type="button" aria-label="Remove image" onClick={() => { removePublic(u); patchArtist(i, { portfolio_urls: a.portfolio_urls.filter(x => x !== u) }) }}
                          className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full text-xs text-white" style={{ backgroundColor: '#333' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {a.portfolio_files.length > 0 && (
                  <p className="mb-2 text-xs" style={{ color: '#C4A882' }}>
                    {a.portfolio_files.map(f => f.name).join(', ')} (upload on save){' '}
                    <button type="button" className="underline" style={{ color: '#999' }} onClick={() => patchArtist(i, { portfolio_files: [] })}>Clear</button>
                  </p>
                )}
                {a.portfolio_urls.length + a.portfolio_files.length < MAX_PORTFOLIO && (
                  <input type="file" multiple accept={IMAGE_TYPES} className="block text-xs" style={{ color: '#999' }}
                    onChange={e => {
                      const room = MAX_PORTFOLIO - a.portfolio_urls.length - a.portfolio_files.length
                      const picked = Array.from(e.target.files ?? [])
                      if (picked.length > room) toast.error(`Only ${room} more image${room === 1 ? '' : 's'} fit (max ${MAX_PORTFOLIO}).`)
                      patchArtist(i, { portfolio_files: [...a.portfolio_files, ...picked.slice(0, room)] })
                      e.target.value = ''
                    }} />
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={isArtist ? 'Logo and TV show' : 'Logo'}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FilePick label="Logo" saved={logoUrl} savedLabel="Logo saved" file={logoFile} accept={IMAGE_TYPES}
              onFile={setLogoFile} onRemove={() => { removePublic(logoUrl); setLogoUrl(null) }} />
            {logoUrl && !logoFile && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="mt-2 h-16 w-16 rounded-lg object-contain" style={{ backgroundColor: '#0a0a0a' }} />
            )}
          </div>
          {isArtist && (
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: '#999' }}>Featured on a TV show?</span>
              <div className="flex gap-2">
                {([[true, 'Yes'], [false, 'No'], [null, 'Not asked']] as const).map(([v, label]) => (
                  <Choice key={label} name="tv" checked={tvFeatured === v} onChange={() => setTvFeatured(v)} label={label} />
                ))}
              </div>
              {tvFeatured === true && (
                <input value={tvShow} onChange={e => setTvShow(e.target.value)} placeholder="Show name" className={`${inputCls} mt-2`} style={inputSty} />
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="Price">
        <p className="mb-3 text-sm text-white">List price: <span style={{ color: '#C4A882' }}>{usd(listCents)}</span></p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="money" checked={moneyMode === 'standard'} onChange={() => setMoneyMode('standard')} label="Standard price" detail={`Invoice ${usd(listCents)}`} />
          <Choice name="money" checked={moneyMode === 'custom'} onChange={() => setMoneyMode('custom')} label="Custom total" detail="An agreed total; the list price is kept for reference" />
          <Choice name="money" checked={moneyMode === 'comp_booth'} onChange={() => setMoneyMode('comp_booth')} label="Comp booth"
            detail={isArtist ? `Permits still charged: invoice ${usd(compPreview(true, false))}` : `Invoice ${usd(compPreview(true, false))}`} />
          <Choice name="money" checked={moneyMode === 'comp_all'} onChange={() => setMoneyMode('comp_all')} label="Comp booth + permits" detail="Nothing to pay" />
        </div>
        {moneyMode === 'custom' && (
          <div className="mt-3 max-w-xs">
            <Field label="Agreed total ($)" error={errors.money}>
              <input type="number" min={0} step="0.01" value={customDollars}
                onChange={e => { setCustomDollars(e.target.value); setConfirmedBelowList(false); setAskConfirm(null) }}
                className={inputCls} style={errors.money ? errSty : inputSty} />
            </Field>
            {customBelowList && !askConfirm && (
              <p className="mt-1 text-xs" style={{ color: '#eab308' }}>{usd(listCents - customCents)} below list{confirmedBelowList ? ' (confirmed)' : '; saving asks you to confirm'}.</p>
            )}
          </div>
        )}
        {moneyMode !== 'custom' && errors.money && <p className="mt-2 text-xs" style={{ color: '#ef4444' }}>{errors.money}</p>}
      </Section>

      <Section title="Status">
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="status" checked={status === 'pending'} onChange={() => setStatus('pending')} label="Pending" detail="Default. Not public; no invoice yet." />
          <Choice name="status" checked={status === 'approved'} onChange={() => setStatus('approved')} label="Approved" detail="Creates the invoice now. Public on the directory once the roster is complete." />
        </div>
        {status === 'approved' && isVeteran && (
          <p className="mt-2 text-xs" style={{ color: '#eab308' }}>The veteran discount applies on approval; verify the veteran document in the Applications drawer.</p>
        )}
      </Section>

      {askConfirm && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.35)', color: '#fde68a' }}>
          <p>{askConfirm} List {usd(listCents)}, agreed {usd(customCents)} ({usd(listCents - customCents)} below).</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => { setConfirmedBelowList(true); void save(true) }}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ backgroundColor: '#8B7355' }}>Confirm and save</button>
            <button type="button" onClick={() => setAskConfirm(null)} className="rounded-lg px-3 py-1.5 text-xs" style={{ border: '1px solid #444', color: '#ccc' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 px-4 py-3" style={{ backgroundColor: 'rgba(10,10,10,0.92)', borderTop: '1px solid #2a2a2a' }}>
        {Object.keys(errors).length > 0 && <span className="mr-auto text-xs" style={{ color: '#ef4444' }}>Check the highlighted fields.</span>}
        <Link href="/admin/applications" className="text-sm" style={{ color: '#999' }}>Back to Applications</Link>
        <button type="button" disabled={saving} onClick={() => void save()}
          className="rounded-lg px-5 py-2.5 text-sm font-bold text-white" style={{ backgroundColor: '#8B7355', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : appId ? 'Save changes' : 'Create application'}
        </button>
      </div>
    </div>
  )
}
