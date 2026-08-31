'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import toast from 'react-hot-toast'

// Team members on /info/about.
//
// NO PLACEHOLDER HUMANS. Three of the four people once on that page did not
// exist, shipped live as named staff with invented biographies. An empty
// unpublished row is how a seat is held open here - it has no name, no role and
// no bio, and migration 059 has a check constraint that refuses to publish one
// until all three are filled in. This screen surfaces that as validation rather
// than letting the insert fail with a raw 23514.

const BUCKET = 'page-images'
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

interface Member {
  id: string
  name: string | null
  role: string | null
  bio: string | null
  photo_path: string | null
  sort_order: number
  published: boolean
}

export default function AdminTeamPage() {
  const [rows, setRows] = useState<Member[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const supabase = createClient()
  const src = (p: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`

  const load = async () => {
    const { data, error } = await supabase
      .from('team_members')
      .select('id, name, role, bio, photo_path, sort_order, published')
      .order('sort_order').order('created_at')
    if (error) {
      console.error(`[admin/team] ${error.code}: ${error.message}`)
      setFailed(error.code === '42P01'
        ? 'The team_members table does not exist yet - migration 059 has not been applied.'
        : `Could not load the team (${error.code}).`)
      return
    }
    setFailed(null)
    setRows((data ?? []) as Member[])
  }

  useEffect(() => { void Promise.resolve().then(load) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (m: Member, f: { name: string; role: string; bio: string }) => {
    setBusy(m.id)
    const res = await guardedWrite(
      supabase.from('team_members')
        .update({ name: f.name.trim() || null, role: f.role.trim() || null, bio: f.bio.trim() || null })
        .eq('id', m.id).select('id'),
      'Not saved', `admin/team save id=${m.id}`,
    )
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Saved'); load()
  }

  const publish = async (m: Member, f: { name: string; role: string; bio: string }) => {
    // The constraint in 059 rejects publishing an incomplete row. Checked here
    // so the person is told which field is missing rather than seeing a 23514.
    if (!m.published) {
      const missing = [
        !f.name.trim() && 'a name',
        !f.role.trim() && 'a role',
        !f.bio.trim() && 'a bio',
      ].filter(Boolean)
      if (missing.length) {
        toast.error(`Add ${missing.join(', ')} before publishing. An empty seat stays unpublished rather than showing a placeholder person.`)
        return
      }
    }
    setBusy(m.id)
    const res = await guardedWrite(
      supabase.from('team_members').update({ published: !m.published }).eq('id', m.id).select('id'),
      'Status not changed', `admin/team publish id=${m.id}`,
    )
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(m.published ? 'Hidden from the site' : 'Published'); load()
  }

  const move = async (m: Member, dir: 'up' | 'down') => {
    const list = rows ?? []
    const i = list.findIndex(r => r.id === m.id)
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= list.length) return
    const other = list[j]
    setBusy(m.id)
    const [ra, rb] = await Promise.all([
      guardedWrite(supabase.from('team_members').update({ sort_order: other.sort_order }).eq('id', m.id).select('id'),
        'Order not saved', `admin/team move id=${m.id}`),
      guardedWrite(supabase.from('team_members').update({ sort_order: m.sort_order }).eq('id', other.id).select('id'),
        'Order not saved', `admin/team move id=${other.id}`),
    ])
    setBusy(null)
    if (!ra.ok || !rb.ok) toast.error('Order not saved.')
    load()
  }

  const upload = async (m: Member, file: File) => {
    // A photo requires a name - 059 enforces it, because a portrait's alt text
    // IS the name and there is nothing sensible to render without one.
    if (!m.name?.trim()) { toast.error('Add a name before uploading a photo. The name becomes the alt text.'); return }
    if (!ACCEPT.includes(file.type)) { toast.error('JPEG, PNG or WebP only.'); return }
    if (file.size > MAX_BYTES) { toast.error('That file is over 10 MB.'); return }
    setBusy(m.id)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `team/${m.id}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (upErr) { setBusy(null); toast.error('Upload failed. You may not have permission to upload images.'); return }
    const res = await guardedWrite(
      supabase.from('team_members').update({ photo_path: path }).eq('id', m.id).select('id'),
      'Photo uploaded but not linked', `admin/team photo id=${m.id}`,
    )
    if (!res.ok) {
      await supabase.storage.from(BUCKET).remove([path])
      setBusy(null); toast.error(`${res.error} The file was removed rather than left unlinked.`); return
    }
    setBusy(null); toast.success('Photo uploaded'); load()
  }

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-white">Team</h1>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed" style={{ color: '#999' }}>
        Shown on the About page. An unpublished row is an empty seat - leave the fields blank until
        there is a real person to put in it. A row cannot be published without a name, role and bio.
      </p>

      {failed && <p className="mt-6 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>{failed}</p>}
      {!failed && rows === null && <p className="mt-6 text-sm" style={{ color: '#999' }}>Loading...</p>}

      <div className="mt-6 space-y-4">
        {(rows ?? []).map((m, i) => (
          <MemberCard
            key={m.id} m={m} index={i} total={(rows ?? []).length} busy={busy === m.id}
            photo={m.photo_path ? src(m.photo_path) : null}
            onSave={save} onPublish={publish} onMove={move} onUpload={upload}
          />
        ))}
      </div>
    </div>
  )
}

function MemberCard({
  m, index, total, busy, photo, onSave, onPublish, onMove, onUpload,
}: {
  m: Member; index: number; total: number; busy: boolean; photo: string | null
  onSave: (m: Member, f: { name: string; role: string; bio: string }) => void
  onPublish: (m: Member, f: { name: string; role: string; bio: string }) => void
  onMove: (m: Member, d: 'up' | 'down') => void
  onUpload: (m: Member, f: File) => void
}) {
  const [name, setName] = useState(m.name ?? '')
  const [role, setRole] = useState(m.role ?? '')
  const [bio, setBio] = useState(m.bio ?? '')
  const f = { name, role, bio }
  const input = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none'
  const inputStyle = { backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }
  const empty = !name.trim() && !role.trim() && !bio.trim()

  return (
    <div className="grid gap-4 rounded-2xl p-5 sm:grid-cols-[40px_120px_1fr]" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => onMove(m, 'up')} disabled={busy || index === 0} className="rounded px-2 py-1 text-xs disabled:opacity-30" style={{ backgroundColor: '#2a2a2a', color: '#C4A882' }} aria-label="Move up">^</button>
        <span className="text-xs" style={{ color: '#666' }}>{index + 1}</span>
        <button onClick={() => onMove(m, 'down')} disabled={busy || index === total - 1} className="rounded px-2 py-1 text-xs disabled:opacity-30" style={{ backgroundColor: '#2a2a2a', color: '#C4A882' }} aria-label="Move down">v</button>
      </div>

      <div>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={name || 'Team member'} className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full text-xs" style={{ backgroundColor: '#141414', border: '1px dashed #3a3a3a', color: '#666' }}>
            {empty ? 'Empty seat' : 'No photo'}
          </div>
        )}
        <label className="mt-2 inline-block cursor-pointer text-xs underline" style={{ color: '#C4A882' }}>
          {photo ? 'Replace' : 'Upload photo'}
          <input type="file" accept={ACCEPT.join(',')} className="hidden" disabled={busy}
                 onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(m, file); e.target.value = '' }} />
        </label>
      </div>

      <div className="space-y-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className={input} style={inputStyle} />
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role" className={input} style={inputStyle} />
        <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Bio" rows={3} className={input} style={inputStyle} />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => onSave(m, f)} disabled={busy} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }}>Save</button>
          <button onClick={() => onPublish(m, f)} disabled={busy} className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  style={m.published ? { backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80' } : { backgroundColor: 'rgba(153,153,153,0.15)', color: '#999' }}>
            {m.published ? 'Published' : 'Unpublished'}
          </button>
          {empty && !m.published && <span className="text-xs" style={{ color: '#666' }}>Empty seat - fill it in to publish</span>}
        </div>
      </div>
    </div>
  )
}
