'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import toast from 'react-hot-toast'

// Gallery contents. Unlike /admin/page-images, rows here are CREATED by the
// admin - a gallery is a collection, not a fixed slot.
//
// Reordering is up/down buttons, matching /admin/contests. Nobody types a
// sort_order: an integer field would make the person do the computer's job and
// would let two images share a position.

const BUCKET = 'page-images'
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

const GALLERIES: { slug: string; label: string; where: string; href?: string }[] = [
  { slug: 'about', label: 'About AATC', where: 'lower on /info/about', href: '/info/about' },
  { slug: 'kids-contest', label: 'Kids Contest', where: 'on /events/kids-contest', href: '/events/kids-contest' },
]

interface Img {
  id: string
  gallery_slug: string
  image_path: string
  alt: string
  caption: string | null
  sort_order: number
  active: boolean
}

export default function AdminGalleriesPage() {
  const [slug, setSlug] = useState(GALLERIES[0].slug)
  const [rows, setRows] = useState<Img[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pendingAlt, setPendingAlt] = useState('')

  const supabase = createClient()
  const src = (p: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`

  const load = async (s: string) => {
    const { data, error } = await supabase
      .from('page_galleries')
      .select('id, gallery_slug, image_path, alt, caption, sort_order, active')
      .eq('gallery_slug', s)
      .order('sort_order')
      .order('created_at')
    if (error) {
      console.error(`[admin/galleries] ${error.code}: ${error.message}`)
      setFailed(
        error.code === '42P01'
          ? 'The page_galleries table does not exist yet - migration 057 has not been applied.'
          : `Could not load the gallery (${error.code}).`
      )
      return
    }
    setFailed(null)
    setRows((data ?? []) as Img[])
  }

  useEffect(() => { void Promise.resolve().then(() => load(slug)) }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (file: File) => {
    // Alt text is required by the table, so it is required BEFORE the upload.
    // Uploading first and failing the insert would leave a file in the bucket
    // that nothing references and nobody knows to delete.
    const alt = pendingAlt.trim()
    if (!alt) { toast.error('Add alt text before uploading. Describe the image for someone who cannot see it.'); return }
    if (!ACCEPT.includes(file.type)) { toast.error('JPEG, PNG or WebP only.'); return }
    if (file.size > MAX_BYTES) { toast.error('That file is over 10 MB.'); return }

    setBusy('add')
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `gallery/${slug}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (upErr) {
      setBusy(null)
      console.error(`[admin/galleries] upload failed: ${upErr.message}`)
      toast.error('Upload failed. You may not have permission to upload images.')
      return
    }

    const next = ((rows ?? []).reduce((m, r) => Math.max(m, r.sort_order), -1)) + 1
    const res = await guardedWrite(
      supabase.from('page_galleries')
        .insert({ gallery_slug: slug, image_path: path, alt, sort_order: next })
        .select('id'),
      'Image uploaded but not added to the gallery',
      `admin/galleries add slug=${slug}`,
    )
    if (!res.ok) {
      await supabase.storage.from(BUCKET).remove([path])
      setBusy(null)
      toast.error(`${res.error} The file was removed rather than left unlinked.`)
      return
    }
    setBusy(null); setPendingAlt(''); toast.success('Image added'); load(slug)
  }

  const move = async (img: Img, dir: 'up' | 'down') => {
    const list = rows ?? []
    const i = list.findIndex(r => r.id === img.id)
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= list.length) return
    const other = list[j]

    // Optimistic swap so the buttons feel immediate, reverted if either write
    // is refused. Both writes are guarded: the reorder in /admin/contests was
    // unchecked and left the list showing an order the database did not have.
    const optimistic = [...list]
    optimistic[i] = { ...img, sort_order: other.sort_order }
    optimistic[j] = { ...other, sort_order: img.sort_order }
    optimistic.sort((a, b) => a.sort_order - b.sort_order)
    setRows(optimistic)
    setBusy(img.id)

    const [ra, rb] = await Promise.all([
      guardedWrite(supabase.from('page_galleries').update({ sort_order: other.sort_order }).eq('id', img.id).select('id'),
        'Order not saved', `admin/galleries move id=${img.id}`),
      guardedWrite(supabase.from('page_galleries').update({ sort_order: img.sort_order }).eq('id', other.id).select('id'),
        'Order not saved', `admin/galleries move id=${other.id}`),
    ])
    setBusy(null)
    if (!ra.ok || !rb.ok) { toast.error('Order not saved.'); load(slug); return }
    load(slug)
  }

  const saveText = async (img: Img, alt: string, caption: string) => {
    if (!alt.trim()) { toast.error('Alt text cannot be empty.'); return }
    setBusy(img.id)
    const res = await guardedWrite(
      supabase.from('page_galleries').update({ alt: alt.trim(), caption: caption.trim() || null }).eq('id', img.id).select('id'),
      'Not saved', `admin/galleries text id=${img.id}`,
    )
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Saved'); load(slug)
  }

  const toggle = async (img: Img) => {
    setBusy(img.id)
    const res = await guardedWrite(
      supabase.from('page_galleries').update({ active: !img.active }).eq('id', img.id).select('id'),
      'Status not changed', `admin/galleries toggle id=${img.id}`,
    )
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    load(slug)
  }

  const remove = async (img: Img) => {
    if (!window.confirm('Remove this image from the gallery?')) return
    setBusy(img.id)
    // Row first, then the file - a blocked row delete leaves the image showing,
    // which is harmless. The reverse renders broken.
    const res = await guardedWrite(
      supabase.from('page_galleries').delete().eq('id', img.id).select('id'),
      'Image not removed', `admin/galleries remove id=${img.id}`,
    )
    if (!res.ok) { setBusy(null); toast.error(res.error); return }
    await supabase.storage.from(BUCKET).remove([img.image_path])
    setBusy(null); toast.success('Removed'); load(slug)
  }

  const current = GALLERIES.find(g => g.slug === slug)!
  const input = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none'
  const inputStyle = { backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-white">Galleries</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {GALLERIES.map(g => (
          <button
            key={g.slug}
            onClick={() => { setRows(null); setSlug(g.slug) }}
            className="rounded-lg px-4 py-2 text-xs font-semibold"
            style={slug === g.slug
              ? { backgroundColor: '#8B7355', color: '#fff' }
              : { backgroundColor: '#1a1a1a', color: '#999', border: '1px solid #2a2a2a' }}
          >
            {g.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs" style={{ color: '#999' }}>
        Appears {current.where}.{' '}
        {current.href && <a href={current.href} target="_blank" rel="noreferrer" className="underline" style={{ color: '#C4A882' }}>View the page</a>}
        {' '}An empty gallery renders nothing at all, so it is always safe to leave one empty.
      </p>

      {failed && (
        <p className="mt-6 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>{failed}</p>
      )}

      {!failed && (
        <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="mb-2 text-sm font-semibold text-white">Add an image</p>
          <input
            value={pendingAlt}
            onChange={e => setPendingAlt(e.target.value)}
            placeholder="Alt text (required) - describe the image for someone who cannot see it"
            className={input}
            style={inputStyle}
          />
          <label className="mt-3 inline-block cursor-pointer rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ backgroundColor: '#8B7355' }}>
            {busy === 'add' ? 'Uploading...' : 'Choose image'}
            <input type="file" accept={ACCEPT.join(',')} className="hidden" disabled={busy === 'add'}
                   onChange={e => { const f = e.target.files?.[0]; if (f) add(f); e.target.value = '' }} />
          </label>
        </div>
      )}

      {!failed && rows === null && <p className="mt-6 text-sm" style={{ color: '#999' }}>Loading...</p>}
      {!failed && rows?.length === 0 && <p className="mt-6 text-sm" style={{ color: '#999' }}>No images in this gallery yet.</p>}

      <div className="mt-4 space-y-3">
        {(rows ?? []).map((img, i) => (
          <GalleryRowCard
            key={img.id} img={img} index={i} total={(rows ?? []).length} busy={busy === img.id}
            src={src(img.image_path)} onMove={move} onSave={saveText} onToggle={toggle} onRemove={remove}
          />
        ))}
      </div>
    </div>
  )
}

function GalleryRowCard({
  img, index, total, busy, src, onMove, onSave, onToggle, onRemove,
}: {
  img: Img; index: number; total: number; busy: boolean; src: string
  onMove: (i: Img, d: 'up' | 'down') => void
  onSave: (i: Img, alt: string, caption: string) => void
  onToggle: (i: Img) => void
  onRemove: (i: Img) => void
}) {
  const [alt, setAlt] = useState(img.alt)
  const [caption, setCaption] = useState(img.caption ?? '')
  const input = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none'
  const inputStyle = { backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }

  return (
    <div className="grid gap-4 rounded-2xl p-4 sm:grid-cols-[40px_140px_1fr]" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => onMove(img, 'up')} disabled={busy || index === 0}
                className="rounded px-2 py-1 text-xs disabled:opacity-30" style={{ backgroundColor: '#2a2a2a', color: '#C4A882' }} aria-label="Move up">^</button>
        <span className="text-xs" style={{ color: '#666' }}>{index + 1}</span>
        <button onClick={() => onMove(img, 'down')} disabled={busy || index === total - 1}
                className="rounded px-2 py-1 text-xs disabled:opacity-30" style={{ backgroundColor: '#2a2a2a', color: '#C4A882' }} aria-label="Move down">v</button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={img.alt} className="h-28 w-full rounded-lg object-cover" style={{ opacity: img.active ? 1 : 0.4 }} />
      <div className="space-y-2">
        <input value={alt} onChange={e => setAlt(e.target.value)} className={input} style={inputStyle} placeholder="Alt text (required)" />
        <input value={caption} onChange={e => setCaption(e.target.value)} className={input} style={inputStyle} placeholder="Caption (optional)" />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onSave(img, alt, caption)} disabled={busy}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }}>Save</button>
          <button onClick={() => onToggle(img)} disabled={busy}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  style={img.active ? { backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80' } : { backgroundColor: 'rgba(153,153,153,0.15)', color: '#999' }}>
            {img.active ? 'Showing' : 'Hidden'}
          </button>
          <button onClick={() => onRemove(img)} disabled={busy} className="text-xs underline disabled:opacity-50" style={{ color: '#fca5a5' }}>Remove</button>
        </div>
      </div>
    </div>
  )
}
