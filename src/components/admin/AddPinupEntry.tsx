'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { validateAdminPinupEntry } from '@/lib/pinup-admin-entry'

/**
 * Add a pinup entry by hand (migration 076: "admins insert pinup entries").
 * Bypasses the registration function on purpose: no capacity lock, no
 * receipt email; the admin picks confirmed or waitlist with the current count
 * in view and attests age and the likeness release on the entrant's behalf.
 */
export default function AddPinupEntry({ taken, capacity, eventId, onAdded }: {
  taken: number
  capacity: number | null
  eventId: string | null
  onAdded: (row: { id: string; full_name: string; stage_name: string | null; email: string; phone: string; address: string | null; age_confirmed: boolean; status: string; created_at: string }) => void
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ fullName: '', stageName: '', email: '', phone: '', status: 'confirmed' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async () => {
    if (!eventId) { toast.error('No active event'); return }
    const v = validateAdminPinupEntry(f)
    if (!v.ok) { setErrors(v.fieldErrors); return }
    setErrors({})
    setBusy(true)
    const res = await guardedWrite(
      supabase.from('pinup_entries').insert({ event_id: eventId, ...v.row }).select('id, full_name, stage_name, email, phone, address, age_confirmed, status, created_at'),
      'Entry not added',
      'admin/pinup add entry',
    )
    setBusy(false)
    if (!res.ok) { toast.error(res.error); return }
    onAdded(res.data[0] as Parameters<typeof onAdded>[0])
    toast.success(`${v.row.full_name} added as ${v.row.status}`)
    setF({ fullName: '', stageName: '', email: '', phone: '', status: 'confirmed' })
    setOpen(false)
  }

  const field = (key: keyof typeof f, label: string, type = 'text') => (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>{label}</label>
      <input type={type} value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })}
        className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={{ backgroundColor: '#0a0a0a', border: `1px solid ${errors[key] ? '#f87171' : '#2a2a2a'}` }} />
      {errors[key] && <p className="mt-1 text-xs" style={{ color: '#f87171' }}>{errors[key]}</p>}
    </div>
  )

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold"
        style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>
        Add entry by hand
      </button>
    )
  }

  const full = capacity != null && taken >= capacity
  return (
    <div className="mt-4 rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>Add entry by hand</p>
      <p className="text-xs" style={{ color: '#999' }}>
        {capacity == null ? 'Capacity unknown (apply 074).' : `${taken} of ${capacity} places taken${full ? ' - the cap is reached; waitlist is the honest status.' : '.'}`}
        {' '}No email is sent. You are attesting the entrant is 18+ and has agreed to the likeness release.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('fullName', 'Full name')}
        {field('stageName', 'Stage name (optional)')}
        {field('email', 'Email', 'email')}
        {field('phone', 'Phone', 'tel')}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Status</label>
          <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
            <option value="confirmed">Confirmed</option>
            <option value="waitlist">Waitlist</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: '#8B7355', color: '#fff' }}>{busy ? 'Saving…' : 'Add entry'}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm" style={{ backgroundColor: '#0a0a0a', color: '#999', border: '1px solid #2a2a2a' }}>Cancel</button>
      </div>
    </div>
  )
}
