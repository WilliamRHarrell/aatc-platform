'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { requestRevalidate } from '@/lib/revalidate'
import { formatEastern } from '@/lib/pinup-export'
import { photoQuality, duplicateHonoreeKey, WOH_SUBMISSIONS_BUCKET, TRIBUTE_MAX } from '@/lib/wall-of-honor-submission'
import type { Database } from '@/types/database'

// Wall of Honor submissions (104). The table is admin only (RLS "wall_of_honor:
// admin all"); the original tribute is never editable and a trigger keeps it,
// so no update here ever sends it. Rejecting sends no email. Publishing is PR 2:
// is_published is shown, never written.

type Entry = Database['public']['Tables']['wall_of_honor_entries']['Row']

const STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const
type StatusFilter = typeof STATUSES[number] | 'all'

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  approved:  { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  pending:   { bg: 'rgba(234,179,8,0.15)',   color: '#eab308' },
  rejected:  { bg: 'rgba(239,68,68,0.12)',   color: '#fca5a5' },
  withdrawn: { bg: 'rgba(153,153,153,0.15)', color: '#999' },
}

// Every column an update here may send. tribute is deliberately not one of them.
type EntryPatch = Partial<Pick<Entry,
  'status' | 'decided_at' | 'decided_by' | 'admin_notes' | 'include_in_print'
  | 'honoree_name' | 'honoree_rank' | 'branch' | 'unit' | 'service_years' | 'tribute_display'>>

const QUALITY_COLOR: Record<'good' | 'usable' | 'low', string> = { good: '#4ade80', usable: '#eab308', low: '#fca5a5' }

interface DisplayForm {
  honoree_name: string
  honoree_rank: string
  branch: string
  unit: string
  service_years: string
  tribute_display: string
}

const toForm = (e: Entry): DisplayForm => ({
  honoree_name: e.honoree_name,
  honoree_rank: e.honoree_rank ?? '',
  branch: e.branch,
  unit: e.unit ?? '',
  service_years: e.service_years ?? '',
  tribute_display: e.tribute_display ?? '',
})

const inputStyle = { backgroundColor: '#111', border: '1px solid #2a2a2a', color: '#fff' }
const btnStyle = { backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }

export default function AdminWallOfHonorPage() {
  const supabase = createClient()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  // null = the switch column is missing (104 not applied): the switch stays hidden.
  const [open, setOpen] = useState<boolean | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const [openId, setOpenId] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const load = async () => {
    const { data: ev, error: evErr } = await supabase
      .from('events').select('id, wall_of_honor_open').eq('is_active', true).maybeSingle()
    if (evErr) {
      if (evErr.code !== '42703') console.error(`[admin/wall-of-honor] event: ${evErr.code}: ${evErr.message}`)
      setOpen(null)
      setFailed('Could not read the active event (migration 104 may not be applied).')
      return
    }
    if (!ev) { setFailed('No active event.'); return }
    setEventId(ev.id)
    setOpen(ev.wall_of_honor_open)

    const { data, error } = await supabase
      .from('wall_of_honor_entries')
      .select('*')
      .eq('event_id', ev.id)
      .order('submitted_at', { ascending: false })
    if (error) {
      console.error(`[admin/wall-of-honor] ${error.code}: ${error.message}`)
      setFailed(error.code === '42P01'
        ? 'The wall_of_honor_entries table does not exist yet - migration 104 has not been applied.'
        : `Could not load submissions (${error.code}).`)
      return
    }
    setEntries((data ?? []) as Entry[])
  }

  useEffect(() => { load() }, [])

  // Over every fetched entry, whatever the filter shows.
  const duplicateKeys = useMemo(() => {
    const seen = new Map<string, number>()
    for (const e of entries ?? []) {
      const k = duplicateHonoreeKey(e.honoree_name, e.branch)
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k))
  }, [entries])
  const isDuplicate = (e: Entry) => duplicateKeys.has(duplicateHonoreeKey(e.honoree_name, e.branch))

  const counts = useMemo(() => Object.fromEntries(
    [...STATUSES, 'all'].map(s => [s, s === 'all' ? (entries?.length ?? 0) : (entries ?? []).filter(e => e.status === s).length]),
  ) as Record<StatusFilter, number>, [entries])

  const shown = useMemo(() => (entries ?? []).filter(e => filter === 'all' || e.status === filter), [entries, filter])
  const current = entries?.find(e => e.id === openId) ?? null

  // ── Switch (events row, "events: admin write") ──
  const toggleOpen = async () => {
    if (open === null || !eventId) return
    const next = !open
    if (next && !window.confirm('Open Wall of Honor submissions? The form at /info/wall-of-honor/submit goes live.')) return
    const res = await guardedWrite(
      supabase.from('events').update({ wall_of_honor_open: next }).eq('id', eventId).select('id'),
      'Wall of Honor switch not saved',
      `admin/wall-of-honor switch event=${eventId}`,
    )
    if (!res.ok) { toast.error(res.error); return }
    setOpen(next)
    const purged = await requestRevalidate({ paths: ['/info/wall-of-honor/submit'], tags: ['wall-of-honor'] })
    if (!purged) toast('Saved. The public page may take up to a minute to update.')
    toast.success(next ? 'Wall of Honor submissions are open' : 'Wall of Honor submissions are closed')
  }

  // ── Entry writes (admin RLS) ──
  const saveEntry = async (id: string, patch: EntryPatch, what: string): Promise<boolean> => {
    setWorking(true)
    try {
      const res = await guardedWrite(
        supabase.from('wall_of_honor_entries').update(patch).eq('id', id).select('*'),
        `${what} not saved`,
        `admin/wall-of-honor ${what} id=${id}`,
      )
      if (!res.ok) { toast.error(res.error); return false }
      const row = res.data[0] as Entry
      setEntries(prev => (prev ?? []).map(e => e.id === id ? row : e))
      return true
    } finally {
      setWorking(false)
    }
  }

  const decide = async (e: Entry, status: 'approved' | 'rejected') => {
    const verb = status === 'approved' ? 'Approve' : 'Reject'
    const note = status === 'rejected' ? ' No email is sent.' : ''
    if (!window.confirm(`${verb} the tribute for ${e.honoree_name}?${note}`)) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Your session has expired. Sign in again.'); return }
    if (await saveEntry(e.id, { status, decided_at: new Date().toISOString(), decided_by: user.id }, verb)) {
      toast.success(status === 'approved' ? 'Approved' : 'Rejected')
    }
  }

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-white">Wall of Honor</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {open !== null && (
          <div className="flex items-center gap-3 rounded-xl px-5 py-3" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: '#999' }}>Submissions</p>
              <p className="mt-1 text-xl font-bold" style={{ color: open ? '#4ade80' : '#fff' }}>{open ? 'Open' : 'Closed'}</p>
            </div>
            <button onClick={toggleOpen} className="rounded-lg px-4 py-2 text-xs font-semibold" style={btnStyle}>
              {open ? 'Close submissions' : 'Open submissions'}
            </button>
          </div>
        )}
        <div className="rounded-xl px-5 py-3" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: '#999' }}>Pending</p>
          <p className="mt-1 text-xl font-bold" style={{ color: counts.pending ? '#eab308' : '#fff' }}>{counts.pending} pending</p>
        </div>
      </div>

      {failed && (
        <p className="mt-6 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>{failed}</p>
      )}
      {!failed && entries === null && <p className="mt-6 text-sm" style={{ color: '#999' }}>Loading...</p>}

      {!failed && entries && (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {(['pending', 'approved', 'rejected', 'withdrawn', 'all'] as StatusFilter[]).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className="rounded-full px-3 py-1 text-xs font-semibold capitalize"
                style={filter === s ? { backgroundColor: '#C4A882', color: '#111' } : { backgroundColor: '#1a1a1a', color: '#999', border: '1px solid #2a2a2a' }}
              >
                {s} ({counts[s]})
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="mt-6 text-sm" style={{ color: '#999' }}>No {filter === 'all' ? '' : `${filter} `}submissions.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl" style={{ border: '1px solid #2a2a2a' }}>
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: '#1a1a1a' }}>
                  <tr>
                    {['Honoree', 'Branch', 'Submitted by', 'Submitted', 'Photos', 'Status', 'Published'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e, i) => {
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
                            {e.honoree_name}
                          </button>
                          {isDuplicate(e) && <span className="block text-xs" style={{ color: '#fca5a5' }}>possible duplicate</span>}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: '#ccc' }}>{e.branch}</td>
                        <td className="px-3 py-2" style={{ color: '#999' }}>
                          <span className="block text-xs text-white">{e.submitter_name}</span>
                          <span className="block text-xs">{e.submitter_relationship}</span>
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: '#999' }}>{formatEastern(e.submitted_at)}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: '#ccc' }}>{e.photo_paths.length}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{e.status}</span>
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: e.is_published ? '#4ade80' : '#555' }}>{e.is_published ? 'Yes' : 'No'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {current && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={ev => { if (ev.target === ev.currentTarget) setOpenId(null) }}
          onKeyDown={ev => { if (ev.key === 'Escape') setOpenId(null) }}
        >
          <EntryDetail
            key={current.id}
            entry={current}
            duplicate={isDuplicate(current)}
            working={working}
            onClose={() => setOpenId(null)}
            onDecide={status => decide(current, status)}
            onSave={(patch, what) => saveEntry(current.id, patch, what)}
          />
        </div>
      )}
    </div>
  )
}

function EntryDetail({ entry: e, duplicate, working, onClose, onDecide, onSave }: {
  entry: Entry
  duplicate: boolean
  working: boolean
  onClose: () => void
  onDecide: (status: 'approved' | 'rejected') => void
  onSave: (patch: EntryPatch, what: string) => Promise<boolean>
}) {
  const supabase = createClient()
  // photo_paths never changes here (no update writes it) and the panel is keyed
  // by entry id, so the paths are read once.
  const [paths] = useState(e.photo_paths)
  const [urls, setUrls] = useState<(string | null)[] | null>(paths.length ? null : [])
  const [dims, setDims] = useState<Record<number, { w: number; h: number }>>({})
  const [notes, setNotes] = useState(e.admin_notes ?? '')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<DisplayForm>(toForm(e))

  // Private bucket, admin read policy. An hour is plenty for a review sitting.
  useEffect(() => {
    if (paths.length === 0) return
    supabase.storage.from(WOH_SUBMISSIONS_BUCKET).createSignedUrls(paths, 3600).then(({ data, error }) => {
      if (error) console.error(`[admin/wall-of-honor] signed urls: ${error.message}`)
      setUrls(paths.map(p => data?.find(d => d.path === p)?.signedUrl ?? null))
    })
  }, [paths]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveDisplay = async () => {
    const name = form.honoree_name.trim()
    const branch = form.branch.trim()
    if (!name || !branch) { toast.error('Honoree name and branch are required'); return }
    const td = form.tribute_display.trim()
    if (td.length > TRIBUTE_MAX) { toast.error(`Display tribute is over ${TRIBUTE_MAX.toLocaleString('en-US')} characters`); return }
    const ok = await onSave({
      honoree_name: name,
      honoree_rank: form.honoree_rank.trim() || null,
      branch,
      unit: form.unit.trim() || null,
      service_years: form.service_years.trim() || null,
      tribute_display: td || null,
    }, 'Display fields')
    if (ok) { setEditing(false); toast.success('Display fields saved') }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[9rem_1fr] gap-3 text-sm">
      <dt style={{ color: '#888' }}>{label}</dt>
      <dd className="whitespace-pre-wrap break-words" style={{ color: value ? '#fff' : '#555' }}>{value || 'Not given'}</dd>
    </div>
  )

  const field = (key: keyof DisplayForm, label: string) => (
    <label className="block text-xs" style={{ color: '#888' }}>
      {label}
      <input
        value={form[key]}
        onChange={ev => setForm(f => ({ ...f, [key]: ev.target.value }))}
        className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
        style={inputStyle}
      />
    </label>
  )

  const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.pending

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={`Wall of Honor submission: ${e.honoree_name}`}
      className="h-full w-full max-w-2xl overflow-y-auto p-6"
      style={{ backgroundColor: '#1a1a1a', borderLeft: '1px solid #2a2a2a' }}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">{e.honoree_name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: '#666' }}>
            <span className="rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{e.status}</span>
            <span>Submitted {formatEastern(e.submitted_at)} ET</span>
            {duplicate && <span style={{ color: '#fca5a5' }}>possible duplicate</span>}
          </p>
        </div>
        <button autoFocus onClick={onClose} className="text-xl leading-none" style={{ color: '#999' }} aria-label="Close">&times;</button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button disabled={working || e.status === 'approved'} onClick={() => onDecide('approved')}
          className="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
          style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
          Approve
        </button>
        <button disabled={working || e.status === 'rejected'} onClick={() => onDecide('rejected')}
          className="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
          Reject
        </button>
        <button disabled={working} onClick={() => { setForm(toForm(e)); setEditing(v => !v) }}
          className="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40" style={btnStyle}>
          {editing ? 'Cancel edit' : 'Edit display fields'}
        </button>
        <label className="flex items-center gap-2 text-xs" style={{ color: '#ccc' }}>
          <input
            type="checkbox"
            checked={e.include_in_print}
            disabled={working}
            onChange={async ev => {
              const next = ev.target.checked
              if (await onSave({ include_in_print: next }, 'Include in print')) toast.success(next ? 'Included in print' : 'Left out of print')
            }}
          />
          Include in print
        </label>
      </div>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#C4A882' }}>Photos</h3>
      {urls === null ? (
        <p className="mb-6 text-sm" style={{ color: '#999' }}>Loading...</p>
      ) : urls.length === 0 ? (
        <p className="mb-6 text-sm" style={{ color: '#555' }}>No photos.</p>
      ) : (
        <div className="mb-6 grid grid-cols-3 gap-3">
          {urls.map((u, i) => {
            const d = dims[i]
            const q = d ? photoQuality(Math.min(d.w, d.h)) : null
            return (
              <div key={i}>
                {u ? (
                  <a href={u} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt={`Photo ${i + 1} of ${e.honoree_name}`}
                      className="aspect-square w-full rounded-lg object-cover"
                      onLoad={ev => {
                        const img = ev.currentTarget
                        setDims(prev => ({ ...prev, [i]: { w: img.naturalWidth, h: img.naturalHeight } }))
                      }}
                    />
                  </a>
                ) : (
                  <p className="text-xs" style={{ color: '#fca5a5' }}>Could not load {paths[i]}</p>
                )}
                {d && q && (
                  <p className="mt-1 text-xs" style={{ color: '#999' }}>
                    {d.w} x {d.h} <span className="font-semibold" style={{ color: QUALITY_COLOR[q] }}>{q}</span>
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#C4A882' }}>Honoree</h3>
      {editing ? (
        <div className="mb-6 space-y-3">
          {field('honoree_name', 'Honoree name')}
          {field('honoree_rank', 'Rank')}
          {field('branch', 'Branch')}
          {field('unit', 'Unit')}
          {field('service_years', 'Service years')}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-xs" style={{ color: '#888' }}>
              Tribute as submitted (read only)
              <p className="mt-1 whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm" style={{ ...inputStyle, color: '#ccc' }}>{e.tribute}</p>
            </div>
            <label className="block text-xs" style={{ color: '#888' }}>
              Display tribute (empty shows the tribute as submitted)
              <textarea
                value={form.tribute_display}
                onChange={ev => setForm(f => ({ ...f, tribute_display: ev.target.value }))}
                rows={10}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
              />
              <span style={{ color: form.tribute_display.trim().length > TRIBUTE_MAX ? '#fca5a5' : '#666' }}>
                {form.tribute_display.trim().length} / {TRIBUTE_MAX}
              </span>
            </label>
          </div>
          <button disabled={working} onClick={saveDisplay} className="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40" style={btnStyle}>
            Save display fields
          </button>
        </div>
      ) : (
        <dl className="mb-6 space-y-3">
          {row('Name', e.honoree_name)}
          {row('Rank', e.honoree_rank)}
          {row('Branch', e.branch)}
          {row('Unit', e.unit)}
          {row('Service years', e.service_years)}
          {row('Tribute as submitted', e.tribute)}
          {row('Display tribute', e.tribute_display)}
        </dl>
      )}

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#C4A882' }}>Submitter</h3>
      <dl className="mb-6 space-y-3">
        {row('Name', e.submitter_name)}
        {row('Relationship', e.submitter_relationship)}
        {row('Email', e.submitter_email ? <a href={`mailto:${e.submitter_email}`} className="hover:underline">{e.submitter_email}</a> : null)}
        {row('Phone', e.submitter_phone)}
        {row('Consent given', formatEastern(e.consent_at))}
        {row('Social media consent', e.consent_social ? 'Yes' : 'No')}
      </dl>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#C4A882' }}>Review</h3>
      <dl className="mb-4 space-y-3">
        {row('Include in print', e.include_in_print ? 'Yes' : 'No')}
        {row('Published', e.is_published ? `Yes${e.published_at ? `, ${formatEastern(e.published_at)}` : ''}` : 'No')}
        {row('Decided', e.decided_at ? formatEastern(e.decided_at) : null)}
        {row('Decided by', e.decided_by)}
      </dl>
      <label className="block text-xs" style={{ color: '#888' }}>
        Admin notes
        <textarea
          value={notes}
          onChange={ev => setNotes(ev.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
          style={inputStyle}
        />
      </label>
      <button
        disabled={working || notes === (e.admin_notes ?? '')}
        onClick={async () => {
          const next = notes.trim()
          if (await onSave({ admin_notes: next || null }, 'Admin notes')) { setNotes(next); toast.success('Notes saved') }
        }}
        className="mt-2 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
        style={btnStyle}
      >
        Save notes
      </button>
    </aside>
  )
}
