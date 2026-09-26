'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

/**
 * Whether the applicant's submission receipt went out (077 mark), with a
 * one-click send for an application that never got one. The route sends
 * once: the button disappears as soon as the mark is set.
 */
export default function ReceiptStatus({ applicationId, sentAt, onSent }: { applicationId: string; sentAt: string | null; onSent: (iso: string) => void }) {
  const [busy, setBusy] = useState(false)
  if (sentAt) {
    return <p className="text-xs" style={{ color: '#4ade80' }}>Receipt sent {new Date(sentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
  }
  const send = async () => {
    setBusy(true)
    const res = await fetch('/api/application-submitted', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId }) })
    const json = (await res.json().catch(() => ({}))) as { sent?: boolean; alreadySent?: boolean; error?: string }
    setBusy(false)
    if (!res.ok) { toast.error(json.error ?? `Receipt not sent (${res.status})`); return }
    if (json.sent) { toast.success('Receipt and internal notice sent'); onSent(new Date().toISOString()) }
    else toast('Already sent', { icon: 'ℹ️' })
  }
  return (
    <div className="flex items-center gap-2">
      <p className="text-xs" style={{ color: '#eab308' }}>Receipt NOT sent</p>
      <button type="button" onClick={send} disabled={busy} className="rounded px-2 py-0.5 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>
        {busy ? 'Sending…' : 'Send receipt'}
      </button>
    </div>
  )
}
