'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { requestRevalidate } from '@/lib/revalidate'
import { parseCapacity, LOWER_CAPACITY_NOTE } from '@/lib/pinup-capacity'

// Event settings: the facts about the active event that the admin may change
// without a deploy. Today that is the pinup contest capacity (migration 074,
// the number's one home). Name, dates and venue are shown for orientation and
// are not editable here - they are cutover facts in event-config.ts.

interface EventRow {
  id: string
  name: string
  start_date: string
  end_date: string
  venue: string
  city: string
  state: string
  pinup_capacity: number | null
}

export default function AdminEventsPage() {
  const supabase = createClient()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [capacity, setCapacity] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, start_date, end_date, venue, city, state, pinup_capacity')
      .eq('is_active', true)
      .maybeSingle()
    if (error) {
      console.error(`[admin/events] ${error.code}: ${error.message}`)
      setFailed(error.code === '42703'
        ? 'events.pinup_capacity does not exist yet - migration 074 has not been applied.'
        : `Could not load the active event (${error.code}).`)
      return
    }
    if (!data) { setFailed('No active event.'); return }
    const row = data as EventRow
    setEvent(row)
    setCapacity(row.pinup_capacity == null ? '' : String(row.pinup_capacity))
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!event) return
    const parsed = parseCapacity(capacity)
    if (!parsed.ok) { toast.error(parsed.error); return }
    setBusy(true)
    const res = await guardedWrite(
      supabase.from('events').update({ pinup_capacity: parsed.value }).eq('id', event.id).select('id'),
      'Capacity not saved',
      `admin/events pinup_capacity event=${event.id}`,
    )
    setBusy(false)
    if (!res.ok) { toast.error(res.error); return }
    setEvent({ ...event, pinup_capacity: parsed.value })
    const purged = await requestRevalidate({ paths: ['/events/pinup-contest'], tags: ['pinup'] })
    toast.success(purged ? `Capacity is ${parsed.value} · live now` : `Capacity is ${parsed.value} · live within ~60s`)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-white">Event Settings</h1>
      <p className="mt-1 text-sm" style={{ color: '#999' }}>Operational numbers for the active event. No deploy needed.</p>

      {failed && (
        <div className="mt-6 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', color: '#f87171' }}>{failed}</div>
      )}

      {event && (
        <>
          <section className="mt-6 rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>Active event</p>
            <p className="mt-2 text-lg font-semibold text-white">{event.name}</p>
            <p className="text-sm" style={{ color: '#999' }}>
              {event.start_date} to {event.end_date} · {event.venue}, {event.city}, {event.state}
            </p>
          </section>

          <section className="mt-4 rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>Miss AATC Pinup Contest</p>
            <label htmlFor="pinup-capacity" className="block text-sm font-medium text-white">Places (capacity)</label>
            <div className="flex items-center gap-3">
              <input
                id="pinup-capacity"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={capacity}
                onChange={e => setCapacity(e.target.value)}
                className="w-32 rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
              />
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: '#8B7355', color: '#fff' }}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p className="text-xs" style={{ color: '#999' }}>
              Entries past this number go to the waitlist. {LOWER_CAPACITY_NOTE}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
