'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import toast from 'react-hot-toast'

// Page image slots. The rows are created by migration 050; this screen fills
// them in. Slugs are NOT creatable here on purpose - a slug only means anything
// if a page renders it, so adding one is a code change, and a free-text slug
// field would just let someone create a row nothing reads.

const BUCKET = 'page-images'
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

// Where each slot appears, so the person filling it in knows what they are
// choosing an image for. Kept beside the slug because there is no other way to
// tell from the admin what 'contest-prizes' looks like on the site.
const WHERE: Record<string, { page: string; position: string; href: string }> = {
  'schedule-hero':  { page: 'Event Schedule',  position: 'under the hero, above the schedule', href: '/events/schedule' },
  'pinup-entry':    { page: 'Pinup Contest',   position: 'above the entry form',               href: '/events/pinup-contest' },
  'contest-prizes': { page: 'Tattoo Contests', position: 'in the prizes section',              href: '/events/tattoo-contests' },
  'after-parties-hero':   { page: 'After Parties', position: 'under the header',        href: '/events/after-parties' },
  'after-party-thursday': { page: 'After Parties', position: 'Thursday card (April 15, before the convention opens)', href: '/events/after-parties' },
  'after-party-friday':   { page: 'After Parties', position: 'Friday card (April 16)',   href: '/events/after-parties' },
  'after-party-saturday': { page: 'After Parties', position: 'Saturday card (April 17)', href: '/events/after-parties' },
}

interface Row {
  id: string
  slug: string
  image_path: string | null
  alt: string | null
  caption: string | null
  active: boolean
}

export default function AdminPageImagesPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, { alt: string; caption: string }>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const supabase = createClient()
  const publicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`

  const load = async () => {
    const { data, error } = await supabase
      .from('page_images')
      .select('id, slug, image_path, alt, caption, active')
      .order('slug')
    if (error) {
      console.error(`[admin/page-images] ${error.code}: ${error.message}`)
      setFailed(
        error.code === '42P01'
          ? 'The page_images table does not exist yet - migration 050 has not been applied.'
          : `Could not load slots (${error.code}).`
      )
      return
    }
    const list = (data ?? []) as Row[]
    setRows(list)
    setDraft(Object.fromEntries(list.map(r => [r.id, { alt: r.alt ?? '', caption: r.caption ?? '' }])))
  }

  // Deferred rather than called synchronously: load() sets state on its error
  // path, and doing that inside the effect body triggers a cascading render.
  useEffect(() => { void Promise.resolve().then(load) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Alt text is enforced by a check constraint in migration 050. Validating here
  // as well so the person gets a field-level message instead of a raw 23514.
  const validate = (row: Row, alt: string, willHaveImage: boolean): string | null => {
    if (willHaveImage && !alt.trim()) {
      return 'Alt text is required when there is an image. Describe what is in it for someone who cannot see it.'
    }
    return null
  }

  const save = async (row: Row) => {
    const d = draft[row.id] ?? { alt: '', caption: '' }
    const problem = validate(row, d.alt, Boolean(row.image_path))
    if (problem) { setErrors(p => ({ ...p, [row.id]: problem })); return }
    setErrors(p => ({ ...p, [row.id]: '' }))
    setBusy(row.id)

    const res = await guardedWrite(
      supabase.from('page_images')
        .update({ alt: d.alt.trim() || null, caption: d.caption.trim() || null })
        .eq('id', row.id)
        .select('id'),
      'Not saved',
      `admin/page-images save slug=${row.slug}`,
    )
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Saved')
    load()
  }

  const upload = async (row: Row, file: File) => {
    if (!ACCEPT.includes(file.type)) { toast.error('JPEG, PNG or WebP only.'); return }
    if (file.size > MAX_BYTES) { toast.error('That file is over 10 MB.'); return }

    const alt = (draft[row.id]?.alt ?? '').trim()
    // Checked BEFORE the upload, not after. Uploading first and failing the row
    // update would leave a file in the bucket that nothing references.
    const problem = validate(row, alt, true)
    if (problem) { setErrors(p => ({ ...p, [row.id]: problem })); toast.error(problem); return }
    setErrors(p => ({ ...p, [row.id]: '' }))

    setBusy(row.id)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${row.slug}-${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (upErr) {
      setBusy(null)
      console.error(`[admin/page-images] upload failed: ${upErr.message}`)
      toast.error('Upload failed. You may not have permission to upload images.')
      return
    }

    const res = await guardedWrite(
      supabase.from('page_images')
        .update({ image_path: path, alt })
        .eq('id', row.id)
        .select('id'),
      'Image uploaded but not linked',
      `admin/page-images upload slug=${row.slug}`,
    )
    if (!res.ok) {
      // Roll the file back. Otherwise the bucket accumulates orphans that look
      // like successful uploads to whoever browses it later.
      await supabase.storage.from(BUCKET).remove([path])
      setBusy(null)
      toast.error(`${res.error} The file was removed rather than left unlinked.`)
      return
    }
    setBusy(null)
    toast.success('Image uploaded')
    load()
  }

  const removeImage = async (row: Row) => {
    if (!row.image_path) return
    if (!window.confirm(`Remove the image from "${row.slug}"? The slot will render nothing.`)) return
    setBusy(row.id)
    // Row first, then the file. If the row update is blocked, the page keeps
    // rendering an image that still exists - the harmless order. The reverse
    // leaves a live row pointing at a deleted file, which renders broken.
    const res = await guardedWrite(
      supabase.from('page_images')
        .update({ image_path: null, alt: null })
        .eq('id', row.id)
        .select('id'),
      'Image not removed',
      `admin/page-images remove slug=${row.slug}`,
    )
    if (!res.ok) { setBusy(null); toast.error(res.error); return }
    await supabase.storage.from(BUCKET).remove([row.image_path])
    setBusy(null)
    toast.success('Image removed')
    load()
  }

  const toggleActive = async (row: Row) => {
    setBusy(row.id)
    const res = await guardedWrite(
      supabase.from('page_images')
        .update({ active: !row.active })
        .eq('id', row.id)
        .select('id'),
      'Status not changed',
      `admin/page-images toggle slug=${row.slug}`,
    )
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(row.active ? 'Hidden from the site' : 'Showing on the site')
    load()
  }

  const card = { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }
  const input = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none'
  const inputStyle = { backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-white">Page Images</h1>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed" style={{ color: '#999' }}>
        Each slot is a fixed position on a page. A slot with no image renders nothing at all -
        no placeholder and no gap - so it is always safe to leave one empty. JPEG, PNG or WebP,
        up to 10 MB.
      </p>

      {failed && (
        <p className="mt-6 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>
          {failed}
        </p>
      )}
      {!failed && rows === null && <p className="mt-6 text-sm" style={{ color: '#999' }}>Loading...</p>}
      {!failed && rows?.length === 0 && (
        <p className="mt-6 text-sm" style={{ color: '#999' }}>
          No slots exist. Migration 050 seeds three; if this is empty it has not been applied.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {(rows ?? []).map(row => {
          const w = WHERE[row.slug]
          const d = draft[row.id] ?? { alt: '', caption: '' }
          return (
            <div key={row.id} className="rounded-2xl p-5" style={card}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{w ? w.page : row.slug}</p>
                  <p className="text-xs" style={{ color: '#999' }}>
                    {w ? w.position : 'No page renders this slug yet.'}
                    <span className="ml-2" style={{ color: '#666' }}>({row.slug})</span>
                  </p>
                  {w && (
                    <a href={w.href} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: '#C4A882' }}>
                      View the page
                    </a>
                  )}
                </div>
                <button
                  onClick={() => toggleActive(row)}
                  disabled={busy === row.id}
                  className="rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50"
                  style={row.active
                    ? { backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80' }
                    : { backgroundColor: 'rgba(153,153,153,0.15)', color: '#999' }}
                >
                  {row.active ? 'Showing' : 'Hidden'}
                </button>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
                <div>
                  {row.image_path ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={publicUrl(row.image_path)} alt={row.alt ?? ''} className="w-full rounded-lg" />
                      <button
                        onClick={() => removeImage(row)}
                        disabled={busy === row.id}
                        className="mt-2 text-xs underline disabled:opacity-50"
                        style={{ color: '#fca5a5' }}
                      >
                        Remove image
                      </button>
                    </>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-lg text-xs"
                         style={{ backgroundColor: '#141414', border: '1px dashed #3a3a3a', color: '#666' }}>
                      No image
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs" style={{ color: '#999' }}>
                      Alt text {row.image_path && <span style={{ color: '#C4A882' }}>(required)</span>}
                    </label>
                    <input
                      value={d.alt}
                      onChange={e => setDraft(p => ({ ...p, [row.id]: { ...d, alt: e.target.value } }))}
                      placeholder="Describe the image for someone who cannot see it"
                      className={input}
                      style={{ ...inputStyle, borderColor: errors[row.id] ? '#ef4444' : '#3a3a3a' }}
                    />
                    {errors[row.id] && <p className="mt-1 text-xs" style={{ color: '#fca5a5' }}>{errors[row.id]}</p>}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs" style={{ color: '#999' }}>Caption (optional)</label>
                    <input
                      value={d.caption}
                      onChange={e => setDraft(p => ({ ...p, [row.id]: { ...d, caption: e.target.value } }))}
                      className={input}
                      style={inputStyle}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label
                      className="cursor-pointer rounded-lg px-4 py-2 text-xs font-bold text-white"
                      style={{ backgroundColor: '#8B7355' }}
                    >
                      {row.image_path ? 'Replace image' : 'Upload image'}
                      <input
                        type="file"
                        accept={ACCEPT.join(',')}
                        className="hidden"
                        disabled={busy === row.id}
                        onChange={e => { const f = e.target.files?.[0]; if (f) upload(row, f); e.target.value = '' }}
                      />
                    </label>
                    <button
                      onClick={() => save(row)}
                      disabled={busy === row.id}
                      className="rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                      style={{ backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }}
                    >
                      {busy === row.id ? 'Working...' : 'Save text'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
