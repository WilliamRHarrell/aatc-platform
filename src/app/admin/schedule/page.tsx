'use client'

/**
 * /admin/schedule — CRUD for the 2027 programme.
 *
 * Closes the deliberate gap from migration 044: schedule_items shipped seeded
 * by SQL with an is_admin() policy and no UI, so changing the schedule meant
 * editing supabase/seeds/schedule_2027.sql and re-running it. That is the same
 * problem as a config file needing a redeploy, and the schedule moves in the
 * weeks before a show.
 *
 * SEMINARS ARE NOT HERE. They are `panels` rows, edited in /admin/panels, and
 * merged into the public schedule at render. panels owns registration,
 * capacity and payment; duplicating a seminar here would create two copies of
 * the same item that drift. The banner below says so, because "why can't I find
 * the Bookkeeping seminar" is the obvious first question.
 *
 * Every write is wrapped in guardedWrite(). The policy on schedule_items is
 * is_admin(), so a content_editor's write is filtered to zero rows and returns
 * error: null — success-looking and completely inert.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import toast from 'react-hot-toast'

interface ScheduleItem {
  id: string
  event_id: string
  day_date: string
  start_time: string
  sort_order: number
  title: string
  location: string
  note: string
  kind: string
  presented_by_sponsorship_id: string | null
  presented_by_fallback: string | null
  is_published: boolean
}

interface SponsorOption {
  id: string
  sponsor_name: string
  tier: string
}

interface FormState {
  day_date: string
  start_time: string
  sort_order: string
  title: string
  location: string
  note: string
  kind: string
  presented_by_sponsorship_id: string
  presented_by_fallback: string
  is_published: boolean
}

const EMPTY_FORM: FormState = {
  day_date: '2027-04-16',
  start_time: '12:00',
  sort_order: '0',
  title: '',
  location: '',
  note: '',
  kind: 'programme',
  presented_by_sponsorship_id: '',
  presented_by_fallback: '',
  is_published: true,
}

// Mirrors the CHECK constraint in migration 044. Adding a value here without
// altering the constraint produces a 23514 on save, not a silent drop.
const KINDS = [
  { value: 'programme', label: 'Programme' },
  { value: 'contest', label: 'Contest' },
  { value: 'ceremony', label: 'Ceremony' },
  { value: 'tribute', label: 'Tribute' },
  { value: 'seminar', label: 'Seminar' },
]

const LOCATIONS = ['Main Stage', 'Ballroom', 'Front Room', 'Contest Booth', 'Seminar Room']

/** 'YYYY-MM-DD' → 'Friday, April 16'. Built from parts: `new Date(iso)` parses
 *  as UTC midnight and renders as the previous day west of Greenwich. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

/** 'HH:MM:SS' → '1:00 PM' */
function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function AdminSchedulePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [eventId, setEventId] = useState<string | null>(null)
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [sponsors, setSponsors] = useState<SponsorOption[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduleItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [working, setWorking] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    const { data: event } = await supabase.from('events').select('id').eq('is_active', true).single()
    if (!event) { toast.error('No active event'); setLoading(false); return }
    setEventId(event.id)

    const [{ data: rows, error: rowsErr }, { data: sponsorRows }] = await Promise.all([
      supabase
        .from('schedule_items')
        .select('*')
        .eq('event_id', event.id)
        .order('day_date').order('start_time').order('sort_order'),
      // Only CONFIRMED sponsorships are offered. Linking an unconfirmed one
      // would resolve to the fallback anyway — schedule_items_public joins on
      // status='confirmed' — so offering it would just look broken.
      supabase
        .from('sponsorships')
        .select('id, sponsor_name, tier')
        .eq('event_id', event.id)
        .eq('status', 'confirmed')
        .order('sponsor_name'),
    ])

    if (rowsErr) toast.error(`Could not load the schedule: ${rowsErr.message}`)
    setItems((rows as ScheduleItem[] | null) ?? [])
    setSponsors((sponsorRows as SponsorOption[] | null) ?? [])
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(item: ScheduleItem) {
    setEditing(item)
    setForm({
      day_date: item.day_date,
      start_time: item.start_time.slice(0, 5),
      sort_order: String(item.sort_order),
      title: item.title,
      location: item.location ?? '',
      note: item.note ?? '',
      kind: item.kind,
      presented_by_sponsorship_id: item.presented_by_sponsorship_id ?? '',
      presented_by_fallback: item.presented_by_fallback ?? '',
      is_published: item.is_published,
    })
    setModalOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!eventId) return
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setWorking(true)

    const payload = {
      event_id: eventId,
      day_date: form.day_date,
      start_time: form.start_time,
      sort_order: parseInt(form.sort_order, 10) || 0,
      title: form.title.trim(),
      location: form.location.trim(),
      note: form.note.trim(),
      kind: form.kind,
      presented_by_sponsorship_id: form.presented_by_sponsorship_id || null,
      presented_by_fallback: form.presented_by_fallback.trim() || null,
      is_published: form.is_published,
    }

    const res = editing
      ? await guardedWrite(
          supabase.from('schedule_items').update(payload).eq('id', editing.id).select('*'),
          'Could not save the schedule item',
          'admin/schedule update',
        )
      : await guardedWrite(
          supabase.from('schedule_items').insert(payload).select('*'),
          'Could not add the schedule item',
          'admin/schedule insert',
        )

    if (res.ok) {
      toast.success(editing ? 'Schedule item updated' : 'Schedule item added')
      setModalOpen(false)
      await load()
    } else {
      toast.error(res.error!)
    }
    setWorking(false)
  }

  async function remove(item: ScheduleItem) {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    setDeleting(item.id)
    const res = await guardedWrite(
      supabase.from('schedule_items').delete().eq('id', item.id).select('id'),
      'Could not delete the schedule item',
      'admin/schedule delete',
    )
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success('Schedule item deleted')
    } else {
      toast.error(res.error!)
    }
    setDeleting(null)
  }

  async function togglePublished(item: ScheduleItem) {
    const res = await guardedWrite(
      supabase.from('schedule_items')
        .update({ is_published: !item.is_published })
        .eq('id', item.id)
        .select('id, is_published'),
      'Could not change visibility',
      'admin/schedule publish toggle',
    )
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_published: !i.is_published } : i))
    } else {
      toast.error(res.error!)
    }
  }

  const days = [...new Set(items.map(i => i.day_date))].sort()

  const sponsorName = (id: string | null) =>
    id ? sponsors.find(s => s.id === id)?.sponsor_name ?? '(unconfirmed or removed sponsor)' : null

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
             style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Schedule</h1>
          <p className="mt-1 text-sm" style={{ color: '#999' }}>
            {items.length} item{items.length !== 1 ? 's' : ''} across {days.length} day{days.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={openAdd}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: '#8B7355' }}>
          Add item
        </button>
      </div>

      {/* Seminars live elsewhere — say so before someone adds a duplicate. */}
      <div className="mb-6 rounded-xl px-4 py-3 text-sm"
           style={{ backgroundColor: 'rgba(139,115,85,0.1)', border: '1px solid #2a2a2a', color: '#bbb' }}>
        <strong className="text-white">Seminars are not on this page.</strong>{' '}
        They are managed in{' '}
        <Link href="/admin/panels" className="underline" style={{ color: '#C4A882' }}>Panels</Link>{' '}
        — that is where registration, capacity and pricing live — and they are merged into the public
        schedule automatically. Adding one here would create a second copy that drifts.
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: '#666' }}>
          No schedule items yet. Add one, or run <code>supabase/seeds/schedule_2027.sql</code>.
        </p>
      ) : (
        <div className="space-y-8">
          {days.map(day => (
            <div key={day}>
              <h2 className="mb-3 rounded-xl px-4 py-2.5 text-sm font-bold uppercase tracking-wider"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#C4A882' }}>
                {dayLabel(day)}
              </h2>

              <div className="rounded-2xl p-1" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                {items.filter(i => i.day_date === day).map((item, idx, arr) => (
                  <div key={item.id}
                       className="flex items-start gap-4 px-4 py-3"
                       style={{ borderBottom: idx < arr.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                    <span className="w-20 shrink-0 pt-0.5 text-right text-xs font-medium"
                          style={{ color: '#C4A882' }}>
                      {formatTime(item.start_time)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium text-white">{item.title}</span>
                        {item.location && (
                          <span className="text-[10px]" style={{ color: '#666' }}>{item.location}</span>
                        )}
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                              style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882' }}>
                          {item.kind}
                        </span>
                        {!item.is_published && (
                          <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                            Hidden
                          </span>
                        )}
                      </div>

                      {item.note && (
                        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: '#777' }}>{item.note}</p>
                      )}

                      {(item.presented_by_sponsorship_id || item.presented_by_fallback) && (
                        <p className="mt-1 text-[11px] italic" style={{ color: '#8B7355' }}>
                          Presented by {sponsorName(item.presented_by_sponsorship_id) ?? item.presented_by_fallback}
                          {!item.presented_by_sponsorship_id && (
                            <span style={{ color: '#a16207' }}> · unlinked text — no sponsorship record</span>
                          )}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => togglePublished(item)}
                              className="rounded-lg px-2.5 py-1 text-xs font-medium"
                              style={{ border: '1px solid #2a2a2a', color: '#999' }}>
                        {item.is_published ? 'Hide' : 'Show'}
                      </button>
                      <button onClick={() => openEdit(item)}
                              className="rounded-lg px-2.5 py-1 text-xs font-medium"
                              style={{ border: '1px solid #2a2a2a', color: '#C4A882' }}>
                        Edit
                      </button>
                      <button onClick={() => remove(item)} disabled={deleting === item.id}
                              className="rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                              style={{ border: '1px solid #2a2a2a', color: '#ef4444' }}>
                        {deleting === item.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <form onSubmit={save}
                className="my-8 w-full max-w-lg rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <h2 className="font-display mb-5 text-xl font-bold text-white">
              {editing ? 'Edit schedule item' : 'Add schedule item'}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Day">
                  <input type="date" required value={form.day_date}
                         onChange={e => setForm({ ...form, day_date: e.target.value })}
                         className={inputCls} style={inputStyle} />
                </Field>
                <Field label="Start time">
                  <input type="time" required value={form.start_time}
                         onChange={e => setForm({ ...form, start_time: e.target.value })}
                         className={inputCls} style={inputStyle} />
                </Field>
              </div>

              <Field label="Title">
                <input type="text" required value={form.title}
                       onChange={e => setForm({ ...form, title: e.target.value })}
                       className={inputCls} style={inputStyle} placeholder="Tattoo Contest Begins" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Location">
                  <input type="text" list="schedule-locations" value={form.location}
                         onChange={e => setForm({ ...form, location: e.target.value })}
                         className={inputCls} style={inputStyle} placeholder="Main Stage" />
                  <datalist id="schedule-locations">
                    {LOCATIONS.map(l => <option key={l} value={l} />)}
                  </datalist>
                </Field>
                <Field label="Kind">
                  <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}
                          className={inputCls} style={inputStyle}>
                    {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Note"
                     hint="Shown under the title. Use for a qualifier on the item — e.g. a demo that runs inside it.">
                <input type="text" value={form.note}
                       onChange={e => setForm({ ...form, note: e.target.value })}
                       className={inputCls} style={inputStyle} />
              </Field>

              <Field label="Order within the same time"
                     hint="Only matters when two items share a start time. Lower shows first.">
                <input type="number" value={form.sort_order}
                       onChange={e => setForm({ ...form, sort_order: e.target.value })}
                       className={inputCls} style={inputStyle} />
              </Field>

              {/* ── Presentation credit ── */}
              <div className="rounded-xl p-4" style={{ backgroundColor: '#0f0f0f', border: '1px solid #2a2a2a' }}>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: '#8B7355' }}>
                  Presentation credit
                </p>

                <Field label="Sponsor"
                       hint="Only CONFIRMED sponsorships appear. Linking one makes the credit a real record — reportable, and rendered with a link.">
                  <select value={form.presented_by_sponsorship_id}
                          onChange={e => setForm({ ...form, presented_by_sponsorship_id: e.target.value })}
                          className={inputCls} style={inputStyle}>
                    <option value="">— none —</option>
                    {sponsors.map(s => (
                      <option key={s.id} value={s.id}>{s.sponsor_name} ({s.tier})</option>
                    ))}
                  </select>
                </Field>

                <div className="mt-3">
                  <Field label="Fallback text"
                         hint="Used ONLY when no sponsor is linked above. For a credit that is sold but has no sponsorship record yet — it renders as plain text, unlinked.">
                    <input type="text" value={form.presented_by_fallback}
                           onChange={e => setForm({ ...form, presented_by_fallback: e.target.value })}
                           className={inputCls} style={inputStyle} placeholder="Whole Life Aftercare" />
                  </Field>
                </div>

                {form.presented_by_sponsorship_id && form.presented_by_fallback && (
                  <p className="mt-2 text-[11px]" style={{ color: '#a16207' }}>
                    Both are set. The linked sponsor wins; the fallback text will not render.
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm" style={{ color: '#ccc' }}>
                <input type="checkbox" checked={form.is_published}
                       onChange={e => setForm({ ...form, is_published: e.target.checked })} />
                Visible on the public schedule
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModalOpen(false)}
                      className="rounded-lg px-4 py-2 text-sm font-medium"
                      style={{ border: '1px solid #2a2a2a', color: '#999' }}>
                Cancel
              </button>
              <button type="submit" disabled={working}
                      className="rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: '#8B7355' }}>
                {working ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none'
const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' } as const

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium" style={{ color: '#ccc' }}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px]" style={{ color: '#666' }}>{hint}</p>}
    </div>
  )
}
