'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { guardedWrite } from '@/lib/db-write'

interface Contest {
  id: string
  event_id: string
  name: string
  description: string | null
  scheduled_time: string | null
  order: number
}

interface FormState {
  name: string
  description: string
  scheduled_time: string
}

const EMPTY_FORM: FormState = { name: '', description: '', scheduled_time: '' }

function formatSchedule(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function ContestForm({
  form,
  working,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  form: FormState
  working: boolean
  onChange: (f: FormState) => void
  onSave: () => void
  onCancel: () => void
  saveLabel: string
}) {
  const input = `w-full rounded-lg px-3 py-2 text-sm outline-none`
  const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff' }

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(139,115,85,0.4)' }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
            Contest Name *
          </label>
          <input
            type="text"
            placeholder="e.g. Best Traditional"
            value={form.name}
            onChange={e => onChange({ ...form, name: e.target.value })}
            className={input}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
            Scheduled Time
          </label>
          <input
            type="datetime-local"
            value={form.scheduled_time}
            onChange={e => onChange({ ...form, scheduled_time: e.target.value })}
            className={input}
            style={{ ...inputStyle, colorScheme: 'dark' }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
            Description
          </label>
          <input
            type="text"
            placeholder="Optional notes"
            value={form.description}
            onChange={e => onChange({ ...form, description: e.target.value })}
            className={input}
            style={inputStyle}
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onSave}
          disabled={working || !form.name.trim()}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#8B7355' }}
        >
          {working ? 'Saving…' : saveLabel}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{ color: '#666', border: '1px solid #2a2a2a' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function AdminContestsPage() {
  const supabase = createClient()
  const [contests, setContests] = useState<Contest[]>([])
  const [loading, setLoading] = useState(true)
  const [eventId, setEventId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [working, setWorking] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .single()

      if (!event) { setLoading(false); return }
      setEventId(event.id)

      const { data } = await supabase
        .from('contests')
        .select('id, event_id, name, description, scheduled_time, order')
        .eq('event_id', event.id)
        .order('order', { ascending: true })

      setContests((data as unknown as Contest[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const startAdd = () => {
    setForm(EMPTY_FORM)
    setAdding(true)
    setEditingId(null)
  }

  const startEdit = (c: Contest) => {
    setForm({
      name: c.name,
      description: c.description ?? '',
      scheduled_time: c.scheduled_time
        ? new Date(c.scheduled_time).toISOString().slice(0, 16)
        : '',
    })
    setEditingId(c.id)
    setAdding(false)
  }

  const cancelForm = () => { setAdding(false); setEditingId(null) }

  const saveAdd = async () => {
    if (!form.name.trim() || !eventId) return
    setWorking(true)
    const nextOrder = contests.length > 0
      ? Math.max(...contests.map(c => c.order)) + 1
      : 0

    const { data, error } = await supabase
      .from('contests')
      .insert({
        event_id: eventId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        scheduled_time: form.scheduled_time || null,
        order: nextOrder,
      })
      .select('id, event_id, name, description, scheduled_time, order')
      .single()

    if (!error && data) {
      setContests(prev => [...prev, data as unknown as Contest])
      toast.success('Contest added')
      setAdding(false)
      setForm(EMPTY_FORM)
    } else {
      toast.error('Failed to add contest')
    }
    setWorking(false)
  }

  const saveEdit = async () => {
    if (!form.name.trim() || !editingId) return
    setWorking(true)
    const res = await guardedWrite(
      supabase
        .from('contests')
        .update({
          name: form.name.trim(),
          description: form.description.trim() || null,
          scheduled_time: form.scheduled_time || null,
        })
        .eq('id', editingId)
        .select('id'),
      'Contest not updated',
      `admin/contests saveEdit id=${editingId}`,
    )

    if (res.ok) {
      setContests(prev => prev.map(c =>
        c.id === editingId
          ? { ...c, name: form.name.trim(), description: form.description.trim() || null, scheduled_time: form.scheduled_time || null }
          : c
      ))
      toast.success('Contest updated')
      setEditingId(null)
    } else {
      toast.error(res.error)
    }
    setWorking(false)
  }

  const deleteContest = async (id: string) => {
    if (!window.confirm('Delete this contest?')) return
    setDeleting(id)
    // .select() is what makes a blocked delete visible. Without it a delete
    // filtered out by RLS returns error: null and zero rows, and the row would
    // vanish from this list while surviving in the database.
    const res = await guardedWrite(
      supabase.from('contests').delete().eq('id', id).select('id'),
      'Contest not deleted',
      `admin/contests delete id=${id}`,
    )
    if (res.ok) {
      setContests(prev => prev.filter(c => c.id !== id))
      toast.success('Contest deleted')
    } else {
      toast.error(res.error)
    }
    setDeleting(null)
  }

  const move = async (id: string, dir: 'up' | 'down') => {
    const idx = contests.findIndex(c => c.id === id)
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === contests.length - 1) return

    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    const a = contests[idx]
    const b = contests[swapIdx]

    const updated = contests.map(c => {
      if (c.id === a.id) return { ...c, order: b.order }
      if (c.id === b.id) return { ...c, order: a.order }
      return c
    }).sort((x, y) => x.order - y.order)

    setContests(updated)

    // Previously unchecked entirely. A reorder that RLS filters out left the
    // list showing the new order while the database kept the old one, and the
    // discrepancy only appeared on the next page load.
    const [ra, rb] = await Promise.all([
      guardedWrite(
        supabase.from('contests').update({ order: b.order }).eq('id', a.id).select('id'),
        'Order not saved', `admin/contests reorder id=${a.id}`),
      guardedWrite(
        supabase.from('contests').update({ order: a.order }).eq('id', b.id).select('id'),
        'Order not saved', `admin/contests reorder id=${b.id}`),
    ])
    if (!ra.ok || !rb.ok) {
      toast.error('Order not saved. Reloading.')
      setContests(contests)
    }
  }

  const scheduled = contests.filter(c => c.scheduled_time).length

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Contests</h1>
          <p className="mt-1 text-sm" style={{ color: '#999' }}>
            {contests.length} contest{contests.length !== 1 ? 's' : ''}
            {scheduled > 0 ? ` · ${scheduled} scheduled` : ''}
          </p>
        </div>
        {!adding && !editingId && (
          <button
            onClick={startAdd}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity"
            style={{ backgroundColor: '#8B7355' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Contest
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-6">
          <ContestForm
            form={form}
            working={working}
            onChange={setForm}
            onSave={saveAdd}
            onCancel={cancelForm}
            saveLabel="Add Contest"
          />
        </div>
      )}

      {/* Contest list */}
      {contests.length === 0 && !adding ? (
        <div
          className="rounded-2xl px-5 py-16 text-center"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <p className="mb-1 text-sm font-medium text-white">No contests yet</p>
          <p className="text-sm" style={{ color: '#555' }}>
            Click &ldquo;Add Contest&rdquo; to build your schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {contests.map((c, idx) => (
            <div key={c.id}>
              {editingId === c.id ? (
                <ContestForm
                  form={form}
                  working={working}
                  onChange={setForm}
                  onSave={saveEdit}
                  onCancel={cancelForm}
                  saveLabel="Save Changes"
                />
              ) : (
                <div
                  className="flex items-start gap-4 rounded-2xl p-4 sm:p-5"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                >
                  {/* Order badge + reorder buttons */}
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
                      style={{ backgroundColor: 'rgba(139,115,85,0.2)', color: '#8B7355' }}
                    >
                      {idx + 1}
                    </div>
                    <button
                      onClick={() => move(c.id, 'up')}
                      disabled={idx === 0}
                      className="flex h-6 w-6 items-center justify-center rounded transition-opacity disabled:opacity-20"
                      style={{ color: '#666' }}
                      title="Move up"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => move(c.id, 'down')}
                      disabled={idx === contests.length - 1}
                      className="flex h-6 w-6 items-center justify-center rounded transition-opacity disabled:opacity-20"
                      style={{ color: '#666' }}
                      title="Move down"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">
                      {c.name}
                      {/* The day is part of the identity here, not decoration.
                          Category names repeat across days by design - three
                          separate "Large Color" contests run on Friday,
                          Saturday and Sunday. Without the day this list shows
                          three identical rows and there is no way to tell which
                          one you are editing. Derived from scheduled_time
                          rather than a stored day column, so it cannot disagree
                          with the schedule. */}
                      {c.scheduled_time && (
                        <span className="ml-2 text-xs font-normal" style={{ color: '#C4A882' }}>
                          {new Date(c.scheduled_time).toLocaleDateString('en-US', {
                            weekday: 'long',
                            timeZone: 'America/New_York',
                          })}
                        </span>
                      )}
                    </p>
                    {c.description && (
                      <p className="mt-0.5 text-sm" style={{ color: '#999' }}>{c.description}</p>
                    )}
                    {c.scheduled_time && (
                      <p className="mt-1 text-xs font-medium" style={{ color: '#8B7355' }}>
                        <svg className="mr-1 inline" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {formatSchedule(c.scheduled_time)}
                      </p>
                    )}
                    {!c.scheduled_time && (
                      <p className="mt-1 text-xs" style={{ color: '#444' }}>Time TBD</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/contests/${c.id}`}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity"
                      style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
                    >
                      Entries →
                    </Link>
                    <button
                      onClick={() => startEdit(c)}
                      disabled={!!editingId || adding}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-40"
                      style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteContest(c.id)}
                      disabled={deleting === c.id}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-40"
                      style={{ backgroundColor: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}
                    >
                      {deleting === c.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
