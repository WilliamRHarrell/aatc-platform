'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { requestRevalidate } from '@/lib/revalidate'
import { formatEastern } from '@/lib/pinup-export'
import { canPublish } from '@/lib/wall-of-honor-publish'
import { photoQuality, duplicateHonoreeKey, WOH_SUBMISSIONS_BUCKET, WOH_PHOTO_MAX_COUNT, TRIBUTE_MAX } from '@/lib/wall-of-honor-submission'
import type { Database } from '@/types/database'

// Wall of Honor submissions (104). The table is admin only (RLS "wall_of_honor:
// admin all"); the original tribute is never editable and a trigger keeps it,
// so no update here ever sends it. Rejecting sends no email. Publishing never goes
// through a table update: the drawer posts to /api/admin/wall-of-honor/publish.
// The list spans every event (a Year column and filter); the open/closed switch
// stays on the active event.

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
  | 'honoree_name' | 'honoree_rank' | 'branch' | 'unit' | 'service_years' | 'tribute_display' | 'photo_paths'>>

type PublishResult = { is_published: boolean; published_at: string | null; emailSent?: boolean; warning?: string }
// Persistent banner: a publish warning (public photos not fully removed) or a failure.
type Notice = { kind: 'warning' | 'error'; text: string }

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
  const [eventYears, setEventYears] = useState<Record<string, number>>({})
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [notice, setNotice] = useState<Notice | null>(null)
  // Set by a publish response; published_email_sent_at only arrives on the next load.
  const [emailSentIds, setEmailSentIds] = useState<Set<string>>(new Set())

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

    const { data: evs, error: evsErr } = await supabase.from('events').select('id, name, start_date')
    if (evsErr) console.error(`[admin/wall-of-honor] events: ${evsErr.code}: ${evsErr.message}`)
    const years: Record<string, number> = {}
    for (const x of evs ?? []) {
      const y = x.start_date ? new Date(x.start_date).getUTCFullYear() : NaN
      if (!Number.isNaN(y)) years[x.id] = y
    }
    setEventYears(years)

    const { data, error } = await supabase
      .from('wall_of_honor_entries')
      .select('*')
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

  const yearOf = (e: Entry): number | null => eventYears[e.event_id] ?? null
  const yearOptions = useMemo(
    () => [...new Set(Object.values(eventYears))].sort((a, b) => b - a),
    [eventYears],
  )

  // Pending across every year: the card at the top is the review queue.
  const pendingTotal = useMemo(() => (entries ?? []).filter(e => e.status === 'pending').length, [entries])

  // Status chips count within the chosen year.
  const inYear = useMemo(
    () => (entries ?? []).filter(e => yearFilter === 'all' || String(eventYears[e.event_id] ?? '') === yearFilter),
    [entries, eventYears, yearFilter],
  )
  const counts = useMemo(() => Object.fromEntries(
    [...STATUSES, 'all'].map(s => [s, s === 'all' ? inYear.length : inYear.filter(e => e.status === s).length]),
  ) as Record<StatusFilter, number>, [inYear])

  const shown = useMemo(() => inYear.filter(e => filter === 'all' || e.status === filter), [inYear, filter])
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

  // ── Publish / unpublish (server route: emails, photo copies, cache purge) ──
  const publishEntry = async (e: Entry, publish: boolean) => {
    setWorking(true)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/wall-of-honor/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: e.id, publish }),
      })
      const body = await res.json().catch(() => null) as (Partial<PublishResult> & { error?: string }) | null
      if (!res.ok || !body) {
        const text = body?.error ?? `${publish ? 'Publish' : 'Unpublish'} failed (${res.status})`
        setNotice({ kind: 'error', text })
        toast.error(text, { duration: 10000 })
        return
      }
      setEntries(prev => (prev ?? []).map(x => x.id === e.id
        ? { ...x, is_published: !!body.is_published, published_at: body.published_at ?? null }
        : x))
      if (body.emailSent) setEmailSentIds(prev => new Set(prev).add(e.id))
      if (body.warning) {
        setNotice({ kind: 'warning', text: body.warning })
        toast.error(body.warning, { duration: 10000 })
      } else {
        toast.success(publish ? 'Published' : 'Unpublished')
      }
    } catch (err) {
      console.error('[admin/wall-of-honor] publish', err)
      const text = `${publish ? 'Publish' : 'Unpublish'} failed. Check your connection and try again.`
      setNotice({ kind: 'error', text })
      toast.error(text)
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
        <a href="/api/admin/wall-of-honor/print" className="rounded-lg px-4 py-2 text-xs font-semibold" style={btnStyle}>
          Download print export
        </a>
        <div className="rounded-xl px-5 py-3" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: '#999' }}>Pending</p>
          <p className="mt-1 text-xl font-bold" style={{ color: pendingTotal ? '#eab308' : '#fff' }}>{pendingTotal} pending</p>
        </div>
      </div>

      {notice && !current && <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />}

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
            <label className="ml-auto flex items-center gap-2 text-xs" style={{ color: '#999' }}>
              Year
              <select
                value={yearFilter}
                onChange={ev => setYearFilter(ev.target.value)}
                className="rounded-lg px-2 py-1 text-xs"
                style={inputStyle}
              >
                <option value="all">All</option>
                {yearOptions.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </label>
          </div>

          {shown.length === 0 ? (
            <p className="mt-6 text-sm" style={{ color: '#999' }}>No {filter === 'all' ? '' : `${filter} `}submissions.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl" style={{ border: '1px solid #2a2a2a' }}>
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: '#1a1a1a' }}>
                  <tr>
                    {['Honoree', 'Year', 'Branch', 'Submitted by', 'Submitted', 'Photos', 'Status', 'Published'].map(h => (
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
                        <td className="px-3 py-2 text-xs" style={{ color: '#ccc' }}>{yearOf(e) ?? '-'}</td>
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
            year={yearOf(current)}
            notice={notice}
            emailSent={(current.published_email_sent_at ?? null) !== null || emailSentIds.has(current.id)}
            onDismissNotice={() => setNotice(null)}
            onPublish={publish => publishEntry(current, publish)}
            onClose={() => setOpenId(null)}
            onDecide={status => decide(current, status)}
            onSave={(patch, what) => saveEntry(current.id, patch, what)}
          />
        </div>
      )}
    </div>
  )
}

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const warn = notice.kind === 'warning'
  return (
    <div
      role="alert"
      className="mt-4 flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm"
      style={warn
        ? { backgroundColor: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' }
        : { backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}
    >
      <span className="whitespace-pre-wrap break-words">{notice.text}</span>
      <button onClick={onDismiss} className="text-xs font-semibold underline">Dismiss</button>
    </div>
  )
}

function EntryDetail({ entry: e, duplicate, working, year, notice, emailSent, onDismissNotice, onPublish, onClose, onDecide, onSave }: {
  entry: Entry
  duplicate: boolean
  working: boolean
  year: number | null
  notice: Notice | null
  emailSent: boolean
  onDismissNotice: () => void
  onPublish: (publish: boolean) => void
  onClose: () => void
  onDecide: (status: 'approved' | 'rejected') => void
  onSave: (patch: EntryPatch, what: string) => Promise<boolean>
}) {
  const supabase = createClient()
  // The strip follows the row: after a photo save the DB row replaces local
  // state, so this is the one source of truth.
  const paths = e.photo_paths
  const pathsKey = paths.join('|')
  const [urls, setUrls] = useState<(string | null)[] | null>(paths.length ? null : [])
  const [dims, setDims] = useState<Record<number, { w: number; h: number }>>({})
  const [notes, setNotes] = useState(e.admin_notes ?? '')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<DisplayForm>(toForm(e))

  // Private bucket, admin read policy. An hour is plenty for a review sitting.
  useEffect(() => {
    setDims({})
    if (paths.length === 0) { setUrls([]); return }
    let live = true
    supabase.storage.from(WOH_SUBMISSIONS_BUCKET).createSignedUrls(paths, 3600).then(({ data, error }) => {
      if (!live) return
      if (error) console.error(`[admin/wall-of-honor] signed urls: ${error.message}`)
      setUrls(paths.map(p => data?.find(d => d.path === p)?.signedUrl ?? null))
    })
    return () => { live = false }
  }, [pathsKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const publishCheck = canPublish(e)

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
            {e.imported_at && <span className="rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882' }}>Imported</span>}
            <span>Submitted {formatEastern(e.submitted_at)} ET</span>
            {year !== null && <span>{year}</span>}
            {duplicate && <span style={{ color: '#fca5a5' }}>possible duplicate</span>}
          </p>
        </div>
        <button autoFocus onClick={onClose} className="text-xl leading-none" style={{ color: '#999' }} aria-label="Close">&times;</button>
      </div>

      {notice && <div className="-mt-2 mb-4"><NoticeBanner notice={notice} onDismiss={onDismissNotice} /></div>}

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

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {e.is_published ? (
          <button disabled={working}
            onClick={() => { if (window.confirm(`Unpublish ${e.honoree_name}? The tribute and its public photos come off the Wall of Honor.`)) onPublish(false) }}
            className="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
            Unpublish
          </button>
        ) : (
          <button disabled={working || !publishCheck.ok} onClick={() => onPublish(true)}
            className="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
            style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
            Publish
          </button>
        )}
        {!e.is_published && !publishCheck.ok && <span className="text-xs" style={{ color: '#eab308' }}>{publishCheck.reason}</span>}
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

      <WallPhotos entry={e} working={working} onSave={onSave} />

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
        {row('Published at', e.published_at ? formatEastern(e.published_at) : null)}
        {row('Published email', emailSent ? 'Sent' : e.imported_at ? 'Not sent (imported)' : 'Not sent')}
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

type FolderFile = { path: string; url: string | null; missing: boolean }

// Which photos go on the wall, and in what order. Files come from the entry's
// own folder (imported extras live there too), so the DB checks (own folder,
// max 3) hold by construction. Saving writes photo_paths; the DB row that
// comes back replaces local state.
function WallPhotos({ entry: e, working, onSave }: {
  entry: Entry
  working: boolean
  onSave: (patch: EntryPatch, what: string) => Promise<boolean>
}) {
  const supabase = createClient()
  const [files, setFiles] = useState<FolderFile[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>(e.photo_paths)
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({})
  const storedKey = e.photo_paths.join('|')
  const locked = e.is_published

  // Re-sync the ticks to the stored order whenever the row's photo_paths change.
  useEffect(() => { setSelected(e.photo_paths) }, [storedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true
    ;(async () => {
      const bucket = supabase.storage.from(WOH_SUBMISSIONS_BUCKET)
      const { data: listed, error } = await bucket.list(e.id, { limit: 100 })
      if (!live) return
      if (error || !listed) {
        console.error(`[admin/wall-of-honor] list photos: ${error?.message}`)
        setLoadError('Could not list the photos in this entry\'s folder. Reload to try again.')
        return
      }
      const inFolder = listed.filter(f => f.id && f.name.startsWith('photo-')).map(f => `${e.id}/${f.name}`).sort()
      // A stored path missing from the folder still shows, so saving never drops it unseen.
      const missing = e.photo_paths.filter(p => !inFolder.includes(p))
      const all = [...inFolder, ...missing]
      const { data: signed, error: signErr } = all.length
        ? await bucket.createSignedUrls(all, 3600)
        : { data: [], error: null }
      if (!live) return
      if (signErr) console.error(`[admin/wall-of-honor] signed urls: ${signErr.message}`)
      setFiles(all.map(p => ({
        path: p,
        url: signed?.find(d => d.path === p)?.signedUrl ?? null,
        missing: missing.includes(p),
      })))
    })()
    return () => { live = false }
  }, [e.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = selected.join('|') !== storedKey
  const atCap = selected.length >= WOH_PHOTO_MAX_COUNT

  const toggle = (p: string) =>
    setSelected(prev => prev.includes(p) ? prev.filter(x => x !== p) : prev.length >= WOH_PHOTO_MAX_COUNT ? prev : [...prev, p])
  const makeMain = (p: string) => setSelected(prev => [p, ...prev.filter(x => x !== p)])

  const save = async () => {
    if (await onSave({ photo_paths: selected }, 'Wall photos')) toast.success('Wall photos saved')
  }

  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#C4A882' }}>Wall photos</h3>
      {locked && <p className="mb-2 text-xs" style={{ color: '#eab308' }}>Unpublish first to change the wall photos.</p>}
      {loadError ? (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>{loadError}</p>
      ) : files === null ? (
        <p className="text-sm" style={{ color: '#999' }}>Loading...</p>
      ) : files.length === 0 ? (
        <p className="text-sm" style={{ color: '#555' }}>No photos in this entry's folder.</p>
      ) : (
        <>
          <p className="mb-2 text-xs" style={{ color: '#888' }}>
            Tick up to {WOH_PHOTO_MAX_COUNT}. The order ticked is the wall order; the first is the main photo.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {files.map(f => {
              const idx = selected.indexOf(f.path)
              const on = idx >= 0
              const d = dims[f.path]
              const q = d ? photoQuality(Math.min(d.w, d.h)) : null
              return (
                <div key={f.path} className="rounded-lg p-2" style={{ border: `1px solid ${on ? '#C4A882' : '#2a2a2a'}` }}>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={`${f.path.split('/').pop()} of ${e.honoree_name}`}
                        className="aspect-square w-full rounded object-cover"
                        onLoad={ev => {
                          const img = ev.currentTarget
                          setDims(prev => ({ ...prev, [f.path]: { w: img.naturalWidth, h: img.naturalHeight } }))
                        }}
                      />
                    </a>
                  ) : (
                    <p className="text-xs" style={{ color: '#fca5a5' }}>{f.missing ? 'Not found in folder' : 'Could not load'}: {f.path.split('/').pop()}</p>
                  )}
                  {d && q && (
                    <p className="mt-1 text-xs" style={{ color: '#999' }}>
                      {d.w} x {d.h} <span className="font-semibold" style={{ color: QUALITY_COLOR[q] }}>{q}</span>
                    </p>
                  )}
                  <label className="mt-1 flex items-center gap-2 text-xs" style={{ color: '#ccc' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={locked || working || (!on && atCap)}
                      onChange={() => toggle(f.path)}
                    />
                    {on ? (idx === 0 ? 'Main' : `Photo ${idx + 1}`) : 'Not on wall'}
                  </label>
                  {on && idx > 0 && !locked && (
                    <button type="button" disabled={working} onClick={() => makeMain(f.path)}
                      className="mt-1 text-xs font-semibold underline disabled:opacity-40" style={{ color: '#C4A882' }}>
                      Make main
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {!locked && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button disabled={working || !dirty} onClick={save}
                className="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40" style={btnStyle}>
                Save wall photos
              </button>
              {dirty && selected.length === 0 && (
                <span className="text-xs" style={{ color: '#eab308' }}>Publishing needs at least one.</span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
