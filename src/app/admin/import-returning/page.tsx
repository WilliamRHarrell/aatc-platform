'use client'

import { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'

const ARTIST_SIZES = [
  { kind: 'single' as const, label: 'Artist Single ($800 / 2026: $700)' },
  { kind: 'double' as const, label: 'Artist Double ($1200 / 2026: $1100)' },
]
const VENDOR_SIZES = [
  { kind: 'single' as const, label: 'Vendor Single ($500 / 2026: $400)' },
  { kind: 'double' as const, label: 'Vendor Double ($800 / 2026: $700)' },
]

export default function ImportReturningPage() {
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    phone: '',
    exhibitor_type: 'artist' as 'artist' | 'vendor',
    artist_single_qty: 1,
    artist_double_qty: 0,
    vendor_single_qty: 0,
    vendor_double_qty: 0,
    corner_count: 0,
    total_amount_dollars: '',
    artist_count: 1,
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [lastImported, setLastImported] = useState<{ email: string; applicationId: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const totalCents = Math.round(parseFloat(form.total_amount_dollars || '0') * 100)
    if (totalCents <= 0) { toast.error('Total paid must be > 0'); return }
    if (!form.email || !form.full_name) { toast.error('Email and full name required'); return }

    setSubmitting(true)
    const res = await fetch('/api/admin/import-returning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        total_amount_cents: totalCents,
      }),
    })
    const json = await res.json()
    setSubmitting(false)
    if (!res.ok) { toast.error(json.error ?? 'Import failed'); return }

    toast.success(`Imported ${form.email}`)
    setLastImported({ email: form.email, applicationId: json.applicationId })

    setForm({
      email: '', full_name: '', phone: '',
      exhibitor_type: form.exhibitor_type,
      artist_single_qty: form.exhibitor_type === 'artist' ? 1 : 0,
      artist_double_qty: 0,
      vendor_single_qty: form.exhibitor_type === 'vendor' ? 1 : 0,
      vendor_double_qty: 0,
      corner_count: 0,
      total_amount_dollars: '',
      artist_count: 1,
      notes: '',
    })
  }

  const sizes = form.exhibitor_type === 'artist' ? ARTIST_SIZES : VENDOR_SIZES

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link href="/admin" className="text-sm font-semibold" style={{ color: '#8B7355' }}>← Admin</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-white">Import returning customer</h1>
        <p className="mt-1 text-sm" style={{ color: '#999' }}>
          For 2026 returners who paid in full at 2026 pricing during the offline window. Creates a paid-in-full invoice and
          marks the applicant as needing to complete their artist roster from /portal.
        </p>
      </div>

      {lastImported && (
        <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}>
          Imported <span className="text-white">{lastImported.email}</span>. Application <span className="text-white">{lastImported.applicationId}</span>.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email *">
            <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Full name *">
            <input type="text" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Phone">
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Type *">
            <select value={form.exhibitor_type} onChange={e => {
              const t = e.target.value as 'artist' | 'vendor'
              setForm({
                ...form,
                exhibitor_type: t,
                artist_single_qty: t === 'artist' ? 1 : 0,
                artist_double_qty: 0,
                vendor_single_qty: t === 'vendor' ? 1 : 0,
                vendor_double_qty: 0,
              })
            }} className={inputCls} style={inputStyle}>
              <option value="artist">Artist</option>
              <option value="vendor">Vendor</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {sizes.map(s => {
            const fieldKey = (form.exhibitor_type === 'artist' ? 'artist_' : 'vendor_') + s.kind + '_qty' as
              | 'artist_single_qty' | 'artist_double_qty' | 'vendor_single_qty' | 'vendor_double_qty'
            return (
              <Field key={s.kind} label={s.label}>
                <input
                  type="number"
                  min={0}
                  value={form[fieldKey] as number}
                  onChange={e => setForm({ ...form, [fieldKey]: Math.max(0, parseInt(e.target.value) || 0) })}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Corner count">
            <input type="number" min={0} value={form.corner_count} onChange={e => setForm({ ...form, corner_count: Math.max(0, parseInt(e.target.value) || 0) })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Artist count (for permit)">
            <input type="number" min={1} value={form.artist_count} onChange={e => setForm({ ...form, artist_count: Math.max(1, parseInt(e.target.value) || 1) })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Total paid (USD) *">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#999' }}>$</span>
              <input type="number" step="0.01" min={0} required value={form.total_amount_dollars} onChange={e => setForm({ ...form, total_amount_dollars: e.target.value })} className="w-full rounded-lg pl-7 pr-4 py-3 text-sm text-white outline-none" style={inputStyle} />
            </div>
          </Field>
        </div>

        <Field label="Notes">
          <textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} style={inputStyle} />
        </Field>

        <button type="submit" disabled={submitting} className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#8B7355' }}>
          {submitting ? 'Creating account…' : 'Create returner'}
        </button>
      </form>
    </div>
  )
}

const inputCls = 'w-full rounded-lg px-4 py-3 text-sm text-white outline-none'
const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' } as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-white">{label}</label>
      {children}
    </div>
  )
}
