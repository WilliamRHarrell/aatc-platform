'use client'

/**
 * /admin/vip - the Gold Star VIP Meet & Greet artists and their order (098).
 * Artists are ticked "Attending" in the application editor or on the booth
 * page; here admin sets the order /events/vip-meet-greet shows them in and
 * can remove one. Admin only (src/proxy.ts; the table's RLS is admin-only).
 * The public page reads vip_featured_public: approved applications of the
 * active event only, so a row here can be hidden there (shown as such).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { requestRevalidate } from '@/lib/revalidate'
import { VIP_PATHS } from '@/lib/vip-config'

const purge = () => requestRevalidate({ paths: VIP_PATHS, tags: ['vip'] })

interface Row {
  id: string
  application_id: string
  artist_uid: string
  display_order: number
  artistName: string | null
  shop: string
  status: string
}

export default function VipAdminPage() {
  // One client for the page's life, so load() keeps one identity.
  const [supabase] = useState(() => createClient())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: vip, error: e } = await supabase.from('vip_featured_artists')
      .select('id, application_id, artist_uid, display_order').order('display_order').order('created_at')
    if (e) { setError(e.code === '42P01' || e.code === 'PGRST205' ? 'Needs migration 098 applied in Supabase.' : e.message); setLoading(false); return }
    const ids = [...new Set((vip ?? []).map(v => v.application_id))]
    const { data: apps } = ids.length
      ? await supabase.from('applications').select('id, business_name, status, artists').in('id', ids)
      : { data: [] as { id: string; business_name: string; status: string; artists: unknown }[] }
    const byId = new Map((apps ?? []).map(a => [a.id, a]))
    setRows((vip ?? []).map(v => {
      const app = byId.get(v.application_id)
      const roster = Array.isArray(app?.artists) ? (app!.artists as Array<{ uid?: string; name?: string; nickname?: string }>) : []
      const artist = roster.find(a => a?.uid === v.artist_uid)
      return {
        ...v,
        artistName: artist ? (artist.nickname?.trim() || artist.name?.trim() || 'Unnamed artist') : null,
        shop: app?.business_name ?? 'Application not found',
        status: app?.status ?? 'missing',
      }
    }))
    setLoading(false)
  }, [supabase])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  /** Writes display_order 1..n for the new order (only the rows whose number changes). */
  const reorder = async (next: Row[]) => {
    setBusy(true)
    const changes = next.map((r, i) => ({ r, order: i + 1 })).filter(({ r, order }) => r.display_order !== order)
    for (const { r, order } of changes) {
      const res = await guardedWrite(
        supabase.from('vip_featured_artists').update({ display_order: order }).eq('id', r.id).select('id'),
        'Order not saved', `admin/vip reorder ${r.id}`,
      )
      if (!res.ok) { toast.error(res.error); break }
    }
    void purge()
    await load()
    setBusy(false)
  }

  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    void reorder(next)
  }

  const remove = async (r: Row) => {
    setBusy(true)
    const res = await guardedWrite(
      supabase.from('vip_featured_artists').delete().eq('id', r.id).select('id'),
      'Not removed', `admin/vip remove ${r.id}`,
    )
    if (!res.ok) toast.error(res.error); else { toast.success('Removed from the VIP Meet & Greet'); void purge() }
    await load()
    setBusy(false)
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">VIP Meet &amp; Greet</h1>
        <p className="mt-1 text-sm" style={{ color: '#999' }}>
          Artists attending the Gold Star VIP Meet &amp; Greet, in the order <Link href="/events/vip-meet-greet" className="underline" style={{ color: '#C4A882' }}>the public page</Link> shows them.
          Tick &quot;Attending&quot; on an artist in the application editor or on the booth page to add one.
        </p>
      </div>

      {loading && <p className="text-sm" style={{ color: '#999' }}>Loading…</p>}
      {error && <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm" style={{ color: '#999' }}>No artists yet. The public page hides the section until there is one.</p>
      )}

      <ol className="space-y-2">
        {rows.map((r, i) => {
          const publicNow = r.status === 'approved' && r.artistName !== null
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <span className="w-6 text-sm font-bold" style={{ color: '#8B7355' }}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{r.artistName ?? 'No longer on the roster'}</p>
                <p className="text-xs" style={{ color: '#999' }}>
                  {r.shop} ·{' '}
                  <span style={{ color: publicNow ? '#4ade80' : '#eab308' }}>
                    {publicNow ? 'Shown' : r.artistName === null ? 'Hidden: artist removed from the roster' : `Hidden: application ${r.status}`}
                  </span>
                </p>
              </div>
              <Link href={`/admin/applications/${r.application_id}/edit`} className="text-xs underline" style={{ color: '#C4A882' }}>Edit application</Link>
              <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up"
                className="rounded px-2 py-1 text-xs text-white disabled:opacity-30" style={{ border: '1px solid #2a2a2a' }}>↑</button>
              <button type="button" disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down"
                className="rounded px-2 py-1 text-xs text-white disabled:opacity-30" style={{ border: '1px solid #2a2a2a' }}>↓</button>
              <button type="button" disabled={busy} onClick={() => remove(r)}
                className="rounded px-2 py-1 text-xs disabled:opacity-30" style={{ border: '1px solid #2a2a2a', color: '#f87171' }}>Remove</button>
            </li>
          )
        })}
      </ol>
    </>
  )
}
