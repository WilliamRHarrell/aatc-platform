'use client'

import { useEffect, useMemo, useState } from 'react'
import { spotsRemaining } from '@/lib/pinup-capacity'
import { createClient } from '@/lib/supabase'
import AddPinupEntry from '@/components/admin/AddPinupEntry'
import { PINUP_FIELDS, PINUP_SELECT, pinupCsv, formatEastern, type PinupEntry } from '@/lib/pinup-export'

// Pinup contest entries. Read through the admin layout's auth gate; the table's
// SELECT policy is admin-only, so a non-admin session sees zero rows rather
// than an error - which is exactly why the empty state below distinguishes
// "no entries yet" from "query failed".


const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  pending:   { bg: 'rgba(234,179,8,0.15)',   color: '#eab308' },
  waitlist:  { bg: 'rgba(196,168,130,0.15)', color: '#C4A882' },
  withdrawn: { bg: 'rgba(153,153,153,0.15)', color: '#999' },
}

// Every column (lib/pinup-export.ts): the detail panel and the CSV show all of them.
type Entry = PinupEntry

type SortKey = 'created_at' | 'full_name' | 'stage_name' | 'status'

export default function AdminPinupPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  // events.pinup_capacity (074) - the number's one home. Null until 074 is applied.
  const [capacity, setCapacity] = useState<number | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('created_at')
  const [asc, setAsc] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    // The cap, from its one home. A missing column (074 not applied) reads as
    // null and the cards say so instead of inventing a number.
    supabase.from('events').select('id, pinup_capacity').eq('is_active', true).maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error(`[admin/pinup] capacity: ${error.code}: ${error.message}`); return }
        const row = data as { id?: string; pinup_capacity?: number } | null
        if (row?.id) setEventId(row.id)
        if (typeof row?.pinup_capacity === 'number') setCapacity(row.pinup_capacity)
      })
    supabase
      .from('pinup_entries')
      .select(PINUP_SELECT)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          // 42P01 means migration 051 has not been applied yet.
          console.error(`[admin/pinup] ${error.code}: ${error.message}`)
          setFailed(
            error.code === '42P01'
              ? 'The pinup_entries table does not exist yet - migration 051 has not been applied.'
              : `Could not load entries (${error.code}).`
          )
          return
        }
        setEntries((data ?? []) as unknown as Entry[])
      })
  }, [])

  const sorted = useMemo(() => {
    if (!entries) return []
    const rows = [...entries]
    rows.sort((a, b) => {
      const av = String(a[sort] ?? '')
      const bv = String(b[sort] ?? '')
      return asc ? av.localeCompare(bv) : bv.localeCompare(av)
    })
    return rows
  }, [entries, sort, asc])

  // Counts against the cap. Withdrawn entries free their place, which is why
  // they are excluded here and in register_pinup_entry().
  const taken = entries?.filter(e => e.status === 'confirmed' || e.status === 'pending').length ?? 0
  const waitlisted = entries?.filter(e => e.status === 'waitlist').length ?? 0
  const remaining = capacity == null ? null : spotsRemaining(capacity, taken)

  // For the stage manager and the announcer: every field, in the sorted order.
  const exportCsv = () => {
    const blob = new Blob([pinupCsv(sorted)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pinup-entries-${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const open = entries?.find(e => e.id === openId) ?? null

  const th = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-left">
      <button
        onClick={() => { if (sort === key) setAsc(!asc); else { setSort(key); setAsc(true) } }}
        className="text-xs font-semibold uppercase tracking-wider hover:text-white"
        style={{ color: sort === key ? '#C4A882' : '#999' }}
      >
        {label}{sort === key ? (asc ? ' ^' : ' v') : ''}
      </button>
    </th>
  )

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-white">Pinup Contest Entries</h1>

      <div className="mt-4 flex flex-wrap gap-3">
        {[
          { label: 'Places taken', value: capacity == null ? `${taken} / ? (apply 074)` : `${taken} / ${capacity}` },
          { label: 'Remaining', value: remaining == null ? '?' : String(remaining) },
          { label: 'Waitlisted', value: String(waitlisted) },
        ].map(c => (
          <div key={c.label} className="rounded-xl px-5 py-3" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <p className="text-xs uppercase tracking-wider" style={{ color: '#999' }}>{c.label}</p>
            <p className="mt-1 text-xl font-bold" style={{ color: c.label === 'Remaining' && remaining === 0 ? '#C4A882' : '#fff' }}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {!failed && (
        <AddPinupEntry taken={taken} capacity={capacity} eventId={eventId}
          onAdded={row => setEntries(prev => [row, ...(prev ?? [])])} />
      )}

      {!failed && sorted.length > 0 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-xs" style={{ color: '#666' }}>Click an entry to see everything submitted.</p>
          <button
            onClick={exportCsv}
            className="rounded-lg px-4 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
          >
            Export CSV ({sorted.length})
          </button>
        </div>
      )}

      {failed && (
        <p className="mt-6 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>
          {failed}
        </p>
      )}

      {!failed && entries === null && (
        <p className="mt-6 text-sm" style={{ color: '#999' }}>Loading...</p>
      )}

      {!failed && entries?.length === 0 && (
        <p className="mt-6 text-sm" style={{ color: '#999' }}>No entries yet.</p>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={ev => { if (ev.target === ev.currentTarget) setOpenId(null) }}
          onKeyDown={ev => { if (ev.key === 'Escape') setOpenId(null) }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Pinup entry: ${open.full_name}`}
            className="h-full w-full max-w-md overflow-y-auto p-6"
            style={{ backgroundColor: '#1a1a1a', borderLeft: '1px solid #2a2a2a' }}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">{open.full_name}</h2>
                {open.stage_name && <p className="text-sm" style={{ color: '#C4A882' }}>{open.stage_name}</p>}
                <p className="mt-1 text-xs" style={{ color: '#666' }}>Registered {formatEastern(open.created_at)} ET</p>
              </div>
              <button autoFocus onClick={() => setOpenId(null)} className="text-xl leading-none" style={{ color: '#999' }} aria-label="Close">&times;</button>
            </div>
            <dl className="space-y-3">
              {PINUP_FIELDS.map(f => {
                const v = f.value(open)
                // Only a missing age confirmation or likeness release is a problem.
                const alert = (f.key === 'age_confirmed' || f.key === 'likeness_release') && v === 'No'
                return (
                  <div key={f.key} className="grid grid-cols-[10rem_1fr] gap-3 text-sm">
                    <dt style={{ color: '#888' }}>{f.label}</dt>
                    <dd className="whitespace-pre-wrap break-words" style={{ color: alert ? '#fca5a5' : v ? '#fff' : '#555' }}>{v || 'Not given'}</dd>
                  </div>
                )
              })}
            </dl>
          </aside>
        </div>
      )}

      {!failed && sorted.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl" style={{ border: '1px solid #2a2a2a' }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: '#1a1a1a' }}>
              <tr>
                {th('full_name', 'Name')}
                {th('stage_name', 'Stage name')}
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Contact</th>
                {th('status', 'Status')}
                {th('created_at', 'Registered')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((e, i) => {
                const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.pending
                return (
                  <tr
                    key={e.id}
                    onClick={() => setOpenId(e.id)}
                    className="cursor-pointer hover:bg-[#1f1f1f]"
                    style={{ borderTop: '1px solid #2a2a2a', backgroundColor: i % 2 ? '#141414' : 'transparent' }}
                  >
                    <td className="px-3 py-2 text-white">
                      <button
                        type="button"
                        onClick={ev => { ev.stopPropagation(); setOpenId(e.id) }}
                        className="text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C4A882]"
                      >
                        {e.full_name}
                      </button>
                      {!e.age_confirmed && <span className="block text-xs" style={{ color: '#fca5a5' }}>age not confirmed</span>}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: e.stage_name ? '#ccc' : '#555' }}>{e.stage_name || '-'}</td>
                    <td className="px-3 py-2" style={{ color: '#999' }}>
                      <span className="block text-xs">{e.email}</span>
                      <span className="block text-xs">{e.phone}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: '#999' }}>
                      {new Date(e.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
