'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { requestRevalidate } from '@/lib/revalidate'
import { entryPath, mediaPublicUrl, type MediaItem } from '@/lib/tattoo-battle'
import { ACCEPT_ATTR, capturePoster, manualPosterPath, moveItem, objectPath, posterPath, uploadWithProgress, validateFile } from '@/lib/tattoo-battle-media'

export interface Row {
  id: string
  bucket_number: number
  artist_name: string
  shop_name: string
  city_state: string
  instagram: string
  media: MediaItem[]
  is_published: boolean
  is_champion: boolean
}

const TABLE = 'tattoo_battle_entries'
const BUCKET = 'tattoo-battle-media'

function trim(f: { artist_name: string; shop_name: string; city_state: string; instagram: string }) {
  return { artist_name: f.artist_name.trim(), shop_name: f.shop_name.trim(), city_state: f.city_state.trim(), instagram: f.instagram.trim().replace(/^@/, '') }
}

export default function SlotEditor({ eventId, bucket, row, hasChampion, onChanged }: {
  eventId: string; bucket: number; row: Row | null; hasChampion: boolean; onChanged: () => Promise<void> | void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    artist_name: row?.artist_name ?? '', shop_name: row?.shop_name ?? '', city_state: row?.city_state ?? '', instagram: row?.instagram ?? '',
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null)
  const [confirmChampion, setConfirmChampion] = useState(false)

  const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }
  const revalidate = () => requestRevalidate({ paths: ['/tattoo-battle', entryPath(bucket)], tags: ['tattoo-battle'] })

  // Upsert the details; creates the row on first save.
  const saveDetails = async () => {
    setBusy('save')
    const res = row
      ? await guardedWrite(supabase.from(TABLE).update(trim(form)).eq('id', row.id).select('id'), 'Details not saved', `admin/tattoo-battle save bucket=${bucket}`)
      : await guardedWrite(supabase.from(TABLE).insert({ event_id: eventId, bucket_number: bucket, ...trim(form) }).select('id'), 'Slot not created', `admin/tattoo-battle create bucket=${bucket}`)
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Saved')
    if (row?.is_published) await revalidate()
    await onChanged()
  }

  const setMedia = async (media: MediaItem[], label: string) => {
    if (!row) return false
    const res = await guardedWrite(supabase.from(TABLE).update({ media }).eq('id', row.id).select('id'), `${label} not saved`, `admin/tattoo-battle media bucket=${bucket}`)
    if (!res.ok) { toast.error(res.error); return false }
    if (row.is_published) await revalidate()
    await onChanged()
    return true
  }

  const upload = async (file: File) => {
    if (!row) { toast.error('Save the artist details first.'); return }
    const v = validateFile(file)
    if (!v.ok) { toast.error(v.reason); return }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { toast.error('Signed out. Sign in again.'); return }
    setBusy('upload')
    const ext = file.name.split('.').pop() ?? (v.kind === 'video' ? 'mp4' : 'jpg')
    const path = objectPath(eventId, bucket, v.kind, ext)
    const item: MediaItem = { type: v.kind, path }
    try {
      await uploadWithProgress({ ...env, token: session.access_token, path, file, contentType: file.type, onProgress: pct => setProgress({ name: file.name, pct }) })
      if (v.kind === 'video') {
        const poster = await capturePoster(file)
        if (poster) {
          const pp = posterPath(path)
          await uploadWithProgress({ ...env, token: session.access_token, path: pp, file: poster, contentType: 'image/jpeg', onProgress: () => {} })
          item.poster_path = pp
        } else {
          toast('Could not make a poster frame for that video. Add one with "Set poster".', { icon: '⚠️' })
        }
      }
    } catch (e) {
      setBusy(null); setProgress(null)
      toast.error(`Upload failed: ${(e as Error).message}`)
      return
    }
    // Row update after the file, and the file is removed if the row refuses
    // it: the harmless order (an orphan file is invisible; a row pointing at
    // nothing renders broken).
    const ok = await setMedia([...row.media, item], 'Media')
    if (!ok) await supabase.storage.from(BUCKET).remove([path, ...(item.poster_path ? [item.poster_path] : [])])
    setBusy(null); setProgress(null)
    if (ok) toast.success('Uploaded')
  }

  const setPoster = async (index: number, file: File) => {
    if (!row) return
    const v = validateFile(file)
    if (!v.ok || v.kind !== 'image') { toast.error('Poster must be a JPEG, PNG or WebP image.'); return }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { toast.error('Signed out. Sign in again.'); return }
    setBusy('poster')
    const ext = file.name.split('.').pop() ?? 'jpg'
    const pp = manualPosterPath(row.media[index].path, ext)
    try {
      await uploadWithProgress({ ...env, token: session.access_token, path: pp, file, contentType: file.type, onProgress: () => {} })
    } catch (e) { setBusy(null); toast.error(`Upload failed: ${(e as Error).message}`); return }
    const media = row.media.map((m, i) => i === index ? { ...m, poster_path: pp } : m)
    const ok = await setMedia(media, 'Poster')
    if (!ok) await supabase.storage.from(BUCKET).remove([pp])
    setBusy(null)
  }

  const removeMedia = async (index: number) => {
    if (!row) return
    const item = row.media[index]
    if (!window.confirm('Remove this media item?')) return
    setBusy('remove')
    const ok = await setMedia(row.media.filter((_, i) => i !== index), 'Remove')
    if (ok) await supabase.storage.from(BUCKET).remove([item.path, ...(item.poster_path ? [item.poster_path] : [])])
    setBusy(null)
  }

  const move = async (from: number, to: number) => {
    if (!row) return
    setBusy('move'); await setMedia(moveItem(row.media, from, to), 'Reorder'); setBusy(null)
  }

  const publish = async (next: boolean) => {
    if (!row) return
    if (next && (!row.artist_name.trim() || row.media.length === 0)) { toast.error('Add an artist name and at least one photo or video before publishing.'); return }
    if (!next && row.is_champion) { toast.error('Unset the champion first, then unpublish.'); return }
    setBusy('publish')
    const res = await guardedWrite(supabase.from(TABLE).update({ is_published: next }).eq('id', row.id).select('id'), next ? 'Not published' : 'Not unpublished', `admin/tattoo-battle publish bucket=${bucket}`)
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    await revalidate()
    toast.success(next ? `Bucket #${bucket} is live` : 'Unpublished')
    await onChanged()
  }

  const clearSlot = async () => {
    if (!row) return
    if (!window.confirm(`Clear Bucket #${bucket}? This deletes the entry and its media.`)) return
    setBusy('clear')
    const paths = row.media.flatMap(m => [m.path, ...(m.poster_path ? [m.poster_path] : [])])
    const res = await guardedWrite(supabase.from(TABLE).delete().eq('id', row.id).select('id'), 'Slot not cleared', `admin/tattoo-battle clear bucket=${bucket}`)
    if (res.ok && paths.length) await supabase.storage.from(BUCKET).remove(paths)
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    await revalidate()
    toast.success('Slot cleared')
    await onChanged()
  }

  const setChampion = async (entryId: string | null) => {
    setBusy('champion')
    const res = await guardedWrite(supabase.rpc('set_tattoo_battle_champion', { p_entry_id: entryId }), 'Champion not set', `admin/tattoo-battle champion bucket=${bucket}`)
    setBusy(null); setConfirmChampion(false)
    if (!res.ok) { toast.error(res.error); return }
    await revalidate()
    toast.success(entryId ? `Bucket #${bucket} is the champion` : 'Champion cleared')
    await onChanged()
  }

  const field = (key: keyof typeof form, label: string, placeholder = '') => (
    <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>
      {label}
      <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
             className="mt-1 w-full rounded-lg px-3 py-3 text-base text-white" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }} />
    </label>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {field('artist_name', 'Artist')}
        {field('shop_name', 'Shop')}
        {field('city_state', 'City, State', 'Fayetteville, NC')}
        {field('instagram', 'Instagram', '@handle')}
      </div>
      <button type="button" disabled={busy !== null} onClick={saveDetails} className="w-full rounded-lg px-4 py-3 text-sm font-bold text-white sm:w-auto" style={{ backgroundColor: '#866f52' }}>
        {busy === 'save' ? 'Saving…' : row ? 'Save details' : 'Create slot'}
      </button>

      {row && (
        <>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Media ({row.media.length})</p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {row.media.map((m, i) => (
                <li key={m.path} className="relative overflow-hidden rounded-lg" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaPublicUrl(m.type === 'image' ? m.path : (m.poster_path ?? m.path))} alt={`${m.type} ${i + 1}`} className="aspect-square w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                  <span className="absolute left-1 top-1 rounded px-1 text-[10px] font-bold uppercase text-black" style={{ backgroundColor: '#C4A882' }}>{m.type}</span>
                  <div className="flex items-center justify-between p-1">
                    <button type="button" aria-label="Move earlier" disabled={i === 0 || busy !== null} onClick={() => move(i, i - 1)} className="px-2 text-white disabled:opacity-30">←</button>
                    {m.type === 'video' && (
                      <label className="cursor-pointer px-1 text-[10px] font-semibold uppercase" style={{ color: '#C4A882' }}>
                        {m.poster_path ? 'Poster' : 'Set poster'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPoster(i, f) }} />
                      </label>
                    )}
                    <button type="button" aria-label="Remove" disabled={busy !== null} onClick={() => removeMedia(i)} className="px-2 text-red-400">✕</button>
                    <button type="button" aria-label="Move later" disabled={i === row.media.length - 1 || busy !== null} onClick={() => move(i, i + 1)} className="px-2 text-white disabled:opacity-30">→</button>
                  </div>
                </li>
              ))}
            </ul>
            <label className="mt-3 block w-full cursor-pointer rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm font-semibold" style={{ borderColor: '#8B7355', color: '#C4A882' }}>
              {busy === 'upload' ? (progress ? `Uploading ${progress.name}: ${progress.pct}%` : 'Preparing…') : 'Add photo or video from your phone'}
              <input type="file" accept={ACCEPT_ATTR} className="hidden" disabled={busy !== null}
                     onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
            </label>
            {progress && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded" style={{ backgroundColor: '#2a2a2a' }} role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full" style={{ width: `${progress.pct}%`, backgroundColor: '#C4A882' }} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => publish(!row.is_published)} className="rounded-lg px-4 py-3 text-sm font-bold" style={{ backgroundColor: row.is_published ? '#2a2a2a' : '#4ade80', color: row.is_published ? '#fff' : '#000' }}>
              {row.is_published ? 'Unpublish' : 'Publish'}
            </button>
            <a href={entryPath(bucket)} target="_blank" rel="noopener noreferrer" className="rounded-lg px-4 py-3 text-sm font-semibold underline" style={{ color: '#C4A882' }}>Open public page</a>
            {row.is_champion ? (
              <button type="button" disabled={busy !== null} onClick={() => setChampion(null)} className="rounded-lg px-4 py-3 text-sm font-bold text-white" style={{ backgroundColor: '#2a2a2a' }}>Unset champion</button>
            ) : (
              <button type="button" disabled={busy !== null || !row.is_published} title={row.is_published ? '' : 'Publish first'} onClick={() => setConfirmChampion(true)} className="rounded-lg px-4 py-3 text-sm font-bold text-black disabled:opacity-40" style={{ backgroundColor: '#C4A882' }}>Mark as champion</button>
            )}
            <button type="button" disabled={busy !== null} onClick={clearSlot} className="ml-auto rounded-lg px-4 py-3 text-sm font-semibold text-red-400">Clear slot</button>
          </div>

          <Dialog.Root open={confirmChampion} onOpenChange={setConfirmChampion}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/70" />
              <Dialog.Content className="fixed left-1/2 top-1/2 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #8B7355' }}>
                <Dialog.Title className="text-lg font-bold text-white">Crown Bucket #{bucket}?</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm" style={{ color: '#ddd' }}>
                  {row.artist_name} becomes the champion{hasChampion ? ' and the current champion is unset' : ''}. The public page shows a champion banner immediately.
                </Dialog.Description>
                <div className="mt-6 flex justify-end gap-2">
                  <Dialog.Close className="rounded-lg px-4 py-2 text-sm text-white" style={{ backgroundColor: '#2a2a2a' }}>Cancel</Dialog.Close>
                  <button type="button" onClick={() => setChampion(row.id)} className="rounded-lg px-4 py-2 text-sm font-bold text-black" style={{ backgroundColor: '#C4A882' }}>Crown them</button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </>
      )}
    </div>
  )
}
