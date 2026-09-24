'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { requestRevalidate } from '@/lib/revalidate'

// Venues for after parties (migration 070). Facts about a place live here and
// only here; which night uses which venue lives on the schedule row
// (/admin/schedule). The logo is a page_images slot named venue-<slug>,
// uploaded at /admin/page-images.

interface Venue {
  id: string
  name: string
  slug: string
  blurb: string
  address: string | null
  phone: string | null
  website_url: string | null
  instagram_url: string | null
  instagram_label: string | null
  facebook_url: string | null
  tiktok_url: string | null
  logo_slot: string | null
}

type Form = Omit<Venue, 'id'>
const EMPTY: Form = { name: '', slug: '', blurb: '', address: '', phone: '', website_url: '', instagram_url: '', instagram_label: '', facebook_url: '', tiktok_url: '', logo_slot: '' }

const FIELDS: Array<{ key: keyof Form; label: string; placeholder?: string; wide?: boolean }> = [
  { key: 'name', label: 'Name *', wide: true },
  { key: 'slug', label: 'Slug * (lowercase, hyphens)', placeholder: 'uptowns' },
  { key: 'logo_slot', label: 'Logo slot (page_images slug)', placeholder: 'venue-uptowns' },
  { key: 'blurb', label: 'Blurb', wide: true },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'website_url', label: 'Website URL' },
  { key: 'instagram_url', label: 'Instagram URL' },
  { key: 'instagram_label', label: 'Instagram label (overrides "Name on Instagram")', wide: true },
  { key: 'facebook_url', label: 'Facebook URL' },
  { key: 'tiktok_url', label: 'TikTok URL' },
]

const nullIfBlank = (v: string | null) => (v && v.trim() ? v.trim() : null)

export default function AdminVenuesPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Venue[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [slots, setSlots] = useState<string[]>([])

  const load = useCallback(async () => {
    const { data: ev } = await supabase.from('events').select('id').eq('is_active', true).maybeSingle()
    setEventId(ev?.id ?? null)
    const { data, error } = await supabase.from('venues').select('*').order('name')
    if (error) {
      console.error(`[admin/venues] ${error.code}: ${error.message}`)
      setFailed(error.code === '42P01' ? 'The venues table does not exist yet - migration 070 has not been applied.' : `Could not load (${error.code}).`)
      return
    }
    setRows((data ?? []) as Venue[])
    // Slots are created by migration (050's rule: a slug only means something
    // if a page renders it). The picker lists what exists; it cannot invent one.
    const { data: slotRows } = await supabase.from('page_images').select('slug').like('slug', 'venue-%').order('slug')
    setSlots((slotRows ?? []).map(r => r.slug))
  }, [supabase])

  // Deferred, same shape as admin/page-images: load() sets state on its error path.
  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const startEdit = (v: Venue) => { setEditing(v.id); setForm({ ...v, address: v.address ?? '', phone: v.phone ?? '', website_url: v.website_url ?? '', instagram_url: v.instagram_url ?? '', instagram_label: v.instagram_label ?? '', facebook_url: v.facebook_url ?? '', tiktok_url: v.tiktok_url ?? '', logo_slot: v.logo_slot ?? '' }) }
  const startNew = () => { setEditing('new'); setForm(EMPTY) }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (!/^[a-z0-9-]+$/.test(form.slug)) { toast.error('Slug must be lowercase letters, digits and hyphens'); return }
    setBusy(true)
    const payload = {
      name: form.name.trim(), slug: form.slug, blurb: form.blurb.trim(),
      address: nullIfBlank(form.address), phone: nullIfBlank(form.phone),
      website_url: nullIfBlank(form.website_url), instagram_url: nullIfBlank(form.instagram_url), instagram_label: nullIfBlank(form.instagram_label),
      facebook_url: nullIfBlank(form.facebook_url), tiktok_url: nullIfBlank(form.tiktok_url), logo_slot: nullIfBlank(form.logo_slot),
    }
    const res = editing === 'new'
      ? await guardedWrite(supabase.from('venues').insert({ ...payload, event_id: eventId }).select('id'), 'Venue not created', 'admin/venues insert')
      : await guardedWrite(supabase.from('venues').update(payload).eq('id', editing!).select('id'), 'Venue not saved', `admin/venues update id=${editing}`)
    setBusy(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Saved')
    setEditing(null)
    await requestRevalidate({ paths: ['/', '/events/after-parties'], tags: ['after-parties'] })
    await load()
  }

  const remove = async (v: Venue) => {
    // A night that points here would silently lose its venue details on the
    // public card. Refuse until the schedule row is unlinked (plan Task 6).
    const { count } = await supabase.from('schedule_items').select('id', { count: 'exact', head: true }).eq('venue_id', v.id)
    if ((count ?? 0) > 0) { toast.error(`${v.name} is used by ${count} schedule row${count === 1 ? '' : 's'}. Unlink it from the schedule first.`); return }
    if (!window.confirm(`Delete ${v.name}?`)) return
    setBusy(true)
    const res = await guardedWrite(supabase.from('venues').delete().eq('id', v.id).select('id'), 'Venue not deleted', `admin/venues delete id=${v.id}`)
    setBusy(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Deleted')
    await requestRevalidate({ paths: ['/', '/events/after-parties'], tags: ['after-parties'] })
    await load()
  }

  if (failed) return <p className="p-6 text-sm text-red-400">{failed}</p>
  if (!rows) return <p className="p-6 text-sm" style={{ color: '#999' }}>Loading…</p>

  const input = 'mt-1 w-full rounded-lg px-3 py-2 text-sm text-white outline-none'
  const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }

  const formBox = (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(139,115,85,0.4)' }}>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(f => (
          <label key={f.key} className={`block text-xs font-semibold uppercase tracking-widest ${f.wide ? 'sm:col-span-2' : ''}`} style={{ color: '#8B7355' }}>
            {f.label}
            {f.key === 'blurb' ? (
              <textarea rows={3} value={form.blurb} onChange={e => setForm({ ...form, blurb: e.target.value })} className={input} style={inputStyle} />
            ) : f.key === 'logo_slot' ? (
              <select value={form.logo_slot ?? ''} onChange={e => setForm({ ...form, logo_slot: e.target.value })} className={input} style={inputStyle}>
                <option value="">None</option>
                {slots.map(sl => <option key={sl} value={sl}>{sl}</option>)}
              </select>
            ) : (
              <input type="text" value={form[f.key] ?? ''} placeholder={f.placeholder} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className={input} style={inputStyle} />
            )}
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs" style={{ color: '#8a8a8a' }}>Only http(s) links render. The Instagram label replaces the default link text and tooltip; it never creates a link on its own. Logo slots are created by migration (venue-&lt;slug&gt;); a brand-new venue needs one added before its logo can be uploaded at /admin/page-images.</p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#8B7355' }}>{busy ? 'Saving…' : 'Save venue'}</button>
        <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-4 py-2 text-sm" style={{ color: '#8a8a8a', border: '1px solid #2a2a2a' }}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Venues</h1>
        <button type="button" onClick={startNew} className="rounded-lg px-4 py-2 text-sm font-semibold text-black" style={{ backgroundColor: '#C4A882' }}>Add venue</button>
      </div>
      <p className="mb-4 text-sm" style={{ color: '#999' }}>A venue is a place. Which night uses it, and whether that night is published, lives on the schedule row at /admin/schedule. Logos are uploaded at /admin/page-images into the slot picked here.</p>
      {editing === 'new' && <div className="mb-4">{formBox}</div>}
      <ul className="space-y-2">
        {rows.map(v => (
          <li key={v.id} className="rounded-xl p-4" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            {editing === v.id ? formBox : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-white">{v.name} <span className="text-xs font-normal" style={{ color: '#8a8a8a' }}>({v.slug})</span></p>
                  <p className="text-xs" style={{ color: '#999' }}>{v.address ?? 'no address'} · {v.phone ?? 'no phone'} · logo slot {v.logo_slot ?? 'none'}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => startEdit(v)} className="rounded-lg px-3 py-2 text-sm text-white" style={{ backgroundColor: '#2a2a2a' }}>Edit</button>
                  <button type="button" onClick={() => remove(v)} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-red-400">Delete</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm" style={{ color: '#8a8a8a' }}>No venues yet. Run seeds/070_after_parties_data.sql or add one.</li>}
      </ul>
    </div>
  )
}
