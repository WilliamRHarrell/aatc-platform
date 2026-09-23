'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { BUCKET_COUNT } from '@/lib/tattoo-battle-config'
import SlotEditor, { type Row } from './SlotEditor'

// Show-floor admin, used from a phone. One expandable card per bucket.
// Reads as the signed-in editor: RLS lets admin/content_editor see drafts.
export default function AdminTattooBattlePage() {
  const supabase = createClient()
  const [eventId, setEventId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const load = useCallback(async () => {
    const { data: ev } = await supabase.from('events').select('id').eq('is_active', true).maybeSingle()
    if (!ev) { setFailed('No active event.'); return }
    setEventId(ev.id)
    const { data, error } = await supabase
      .from('tattoo_battle_entries')
      .select('id, bucket_number, artist_name, shop_name, city_state, instagram, media, is_published, is_champion')
      .eq('event_id', ev.id)
      .order('bucket_number')
    if (error) {
      console.error(`[admin/tattoo-battle] ${error.code}: ${error.message}`)
      setFailed(error.code === '42P01'
        ? 'The tattoo_battle_entries table does not exist yet - migration 069 has not been applied.'
        : `Could not load (${error.code}).`)
      return
    }
    setRows((data ?? []) as unknown as Row[])
  }, [supabase])

  // Deferred rather than called synchronously, the same shape as
  // admin/page-images: load() sets state on its error path, and doing that
  // inside the effect body triggers a cascading render.
  useEffect(() => { void Promise.resolve().then(load) }, [load])

  if (failed) return <p className="p-6 text-sm text-red-400">{failed}</p>
  if (!rows || !eventId) return <p className="p-6 text-sm" style={{ color: '#999' }}>Loading…</p>

  const byBucket = new Map(rows.map(r => [r.bucket_number, r]))
  const champion = rows.find(r => r.is_champion) ?? null

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Tattoo Battle</h1>
        <Link href="/admin/tattoo-battle/print" className="rounded-lg px-4 py-2 text-sm font-semibold text-black" style={{ backgroundColor: '#C4A882' }}>Print QR codes</Link>
      </div>

      <div className="mb-4 rounded-xl p-4 text-sm" style={{ backgroundColor: 'rgba(196,168,130,0.12)', border: '1px solid #8B7355', color: '#ddd' }}>
        <strong className="text-white">Before you shoot:</strong> record video at 1080p, keep clips under about 30 seconds (50 MB limit), and on iPhone set Camera → Formats → <strong className="text-white">Most Compatible</strong> so photos and video upload as JPEG and H.264.
      </div>

      {champion && (
        <p className="mb-4 text-sm" style={{ color: '#C4A882' }}>Champion: Bucket #{champion.bucket_number} · {champion.artist_name}</p>
      )}

      <ul className="space-y-2">
        {Array.from({ length: BUCKET_COUNT }, (_, i) => i + 1).map(n => {
          const row = byBucket.get(n) ?? null
          const status = !row ? 'empty' : row.is_published ? 'published' : 'draft'
          const color = status === 'published' ? '#4ade80' : status === 'draft' ? '#eab308' : '#8a8a8a'
          return (
            <li key={n} className="rounded-xl" style={{ backgroundColor: '#1a1a1a', border: `1px solid ${row?.is_champion ? '#C4A882' : '#2a2a2a'}` }}>
              <button type="button" onClick={() => setOpen(open === n ? null : n)} className="flex w-full items-center justify-between gap-3 p-4 text-left" aria-expanded={open === n}>
                <span className="flex items-center gap-3">
                  <span className="text-lg font-bold text-white">#{n}</span>
                  <span className="text-sm" style={{ color: '#ddd' }}>{row?.artist_name || <span style={{ color: '#8a8a8a' }}>unassigned</span>}</span>
                  {row?.is_champion && <span className="rounded px-2 py-0.5 text-xs font-bold text-black" style={{ backgroundColor: '#C4A882' }}>CHAMPION</span>}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{status}{row ? ` · ${row.media.length} media` : ''}</span>
              </button>
              {open === n && (
                <div className="border-t p-4" style={{ borderColor: '#2a2a2a' }}>
                  <SlotEditor eventId={eventId} bucket={n} row={row} hasChampion={!!champion} onChanged={load} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-6 text-xs" style={{ color: '#8a8a8a' }}>Nothing here records votes or money. Buckets are counted on paper on Sunday.</p>
    </div>
  )
}
