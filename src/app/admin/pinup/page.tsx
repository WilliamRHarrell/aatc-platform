'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

// Pinup contest entries. Read through the admin layout's auth gate; the table's
// SELECT policy is admin-only, so a non-admin session sees zero rows rather
// than an error - which is exactly why the empty state below distinguishes
// "no entries yet" from "query failed".

const CAPACITY = 25

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  pending:   { bg: 'rgba(234,179,8,0.15)',   color: '#eab308' },
  waitlist:  { bg: 'rgba(196,168,130,0.15)', color: '#C4A882' },
  withdrawn: { bg: 'rgba(153,153,153,0.15)', color: '#999' },
}

interface Entry {
  id: string
  full_name: string
  stage_name: string | null
  email: string
  phone: string
  address: string | null
  age_confirmed: boolean
  status: string
  created_at: string
}

type SortKey = 'created_at' | 'full_name' | 'status'

export default function AdminPinupPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('created_at')
  const [asc, setAsc] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('pinup_entries')
      .select('id, full_name, stage_name, email, phone, address, age_confirmed, status, created_at')
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
        setEntries((data ?? []) as Entry[])
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
  const remaining = Math.max(0, CAPACITY - taken)

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
          { label: 'Places taken', value: `${taken} / ${CAPACITY}` },
          { label: 'Remaining', value: String(remaining) },
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

      {!failed && sorted.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl" style={{ border: '1px solid #2a2a2a' }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: '#1a1a1a' }}>
              <tr>
                {th('full_name', 'Name')}
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Contact</th>
                {th('status', 'Status')}
                {th('created_at', 'Registered')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((e, i) => {
                const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.pending
                return (
                  <tr key={e.id} style={{ borderTop: '1px solid #2a2a2a', backgroundColor: i % 2 ? '#141414' : 'transparent' }}>
                    <td className="px-3 py-2 text-white">
                      {e.full_name}
                      {e.stage_name && <span className="block text-xs" style={{ color: '#999' }}>{e.stage_name}</span>}
                      {!e.age_confirmed && <span className="block text-xs" style={{ color: '#fca5a5' }}>age not confirmed</span>}
                    </td>
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
