'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { activeHold, defaultHoldUntilInput, holdUntilLabel, toLocalInput, type HoldFields } from '@/lib/booth-holds'

/**
 * Set, change or release a booth hold (migration 087). Writes only through
 * hold_booth() / release_booth_hold(), which check admin, sellable, not
 * assigned, a name, and an end in the future. A hold linked to an application
 * lets that application (and only it) take the booth in Assign Booth.
 */
export interface HoldBooth extends HoldFields {
  id: string
  booth_number: string
}

export interface HoldLinkOption {
  /** 'app:<uuid>' or 'sp:<uuid>' */
  value: string
  label: string
}

export default function BoothHoldDialog({
  booth,
  linkOptions,
  onClose,
  onSaved,
}: {
  booth: HoldBooth
  linkOptions: HoldLinkOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const held = activeHold(booth)
  const [heldFor, setHeldFor] = useState(held ? booth.held_for ?? '' : '')
  const [until, setUntil] = useState(held && booth.held_until ? toLocalInput(booth.held_until) : defaultHoldUntilInput())
  const [link, setLink] = useState(
    held && booth.held_for_application_id ? `app:${booth.held_for_application_id}`
      : held && booth.held_for_sponsorship_id ? `sp:${booth.held_for_sponsorship_id}`
      : ''
  )
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!heldFor.trim()) { toast.error('Who is the booth held for?'); return }
    if (!until) { toast.error('A hold needs an end date'); return }
    setSaving(true)
    const { error } = await supabase.rpc('hold_booth', {
      p_booth_id: booth.id,
      p_held_for: heldFor.trim(),
      // datetime-local is the admin's local time; toISOString() makes it absolute.
      p_held_until: new Date(until).toISOString(),
      p_application_id: link.startsWith('app:') ? link.slice(4) : null,
      p_sponsorship_id: link.startsWith('sp:') ? link.slice(3) : null,
    })
    setSaving(false)
    if (error) {
      toast.error(error.code === 'PGRST202' ? 'Booth holds need migration 087 applied in Supabase.' : `Not saved: ${error.message}`)
      return
    }
    toast.success(`Booth #${booth.booth_number} held for ${heldFor.trim()}`)
    onSaved()
  }

  const release = async () => {
    setSaving(true)
    const { error } = await supabase.rpc('release_booth_hold', { p_booth_id: booth.id })
    setSaving(false)
    if (error) { toast.error(`Not released: ${error.message}`); return }
    toast.success(`Hold on booth #${booth.booth_number} released`)
    onSaved()
  }

  const field = 'w-full rounded-lg px-3 py-2 text-sm text-white'
  const fieldStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hold-title"
        className="w-full max-w-md rounded-2xl p-6"
        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 id="hold-title" className="text-lg font-bold text-white">
          {held ? `Booth #${booth.booth_number} is held` : `Hold booth #${booth.booth_number}`}
        </h2>
        {held && booth.held_until && (
          <p className="mt-1 text-xs" style={{ color: '#f5c542' }}>
            Held for {booth.held_for} until {holdUntilLabel(booth.held_until)} ET
          </p>
        )}

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold" style={{ color: '#999' }}>Held for (name)</span>
            <input className={field} style={fieldStyle} value={heldFor} onChange={e => setHeldFor(e.target.value)} placeholder="Who the booth is held for" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold" style={{ color: '#999' }}>Link (optional)</span>
            <select className={field} style={fieldStyle} value={link} onChange={e => setLink(e.target.value)}>
              <option value="">No link: nobody can be assigned it until the hold is released or ends</option>
              {linkOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="mt-1 block text-[11px]" style={{ color: '#666' }}>
              Linked to an application: only that exhibitor can be assigned this booth while the hold lasts.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold" style={{ color: '#999' }}>Held until (your local time)</span>
            <input type="datetime-local" className={field} style={fieldStyle} value={until} onChange={e => setUntil(e.target.value)} required />
            <span className="mt-1 block text-[11px]" style={{ color: '#666' }}>The hold ends on its own at this time.</span>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          {held ? (
            <button type="button" onClick={release} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}>
              Release hold
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ color: '#999', border: '1px solid #2a2a2a' }}>Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:opacity-50" style={{ backgroundColor: '#C4A882' }}>
              {held ? 'Update hold' : 'Hold booth'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
