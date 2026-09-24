'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { FINAL_DUE_AT } from '@/lib/event-config'
import { compEmailKind, isComped, restoredDepositDueAt } from '@/lib/comp'

export interface CompApp {
  id: string
  status: string
  approved_at: string | null
  comped_at: string | null
  comped_by: string | null
  is_veteran: boolean
  veteran_doc_verified_at: string | null
}

export interface CompPatch {
  comped_at: string | null
  comped_by: string | null
  deposit_due_at: string | null
  final_due_at: string | null
}

/**
 * Comp / Remove comp. Both go through the 072 RPCs so the application and its
 * invoice change in one transaction; the RPC's own message is what the admin
 * sees when it refuses (payments exist, multiple invoices). Comping an
 * application that already received its approval email sends the comp notice.
 */
export default function CompControls({
  app, unverified, onPatch,
}: {
  app: CompApp
  unverified: boolean
  onPatch: (patch: CompPatch) => void
}) {
  const supabase = createClient()
  const [working, setWorking] = useState(false)
  const [ack, setAck] = useState(false)
  const [byName, setByName] = useState<string | null>(null)
  const comped = isComped(app)

  useEffect(() => {
    const by = app.comped_by
    if (!by) return
    let cancelled = false
    supabase.from('profiles').select('full_name, email').eq('id', by).maybeSingle().then(({ data }) => {
      if (!cancelled) setByName(data?.full_name || data?.email || null)
    })
    return () => { cancelled = true }
  }, [app.comped_by, supabase])

  const sendNotice = async () => {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: app.id, kind: 'comp_notice' }),
    })
    if (res.ok) toast.success('Comp notice sent')
    else toast.error('Comp notice was not sent - send it again from here')
  }

  const comp = async () => {
    if (unverified && !ack) { setAck(true); return }
    setWorking(true)
    const { error } = await supabase.rpc('comp_application', { p_application_id: app.id })
    if (error) { toast.error(error.message); setWorking(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    onPatch({ comped_at: new Date().toISOString(), comped_by: user?.id ?? null, deposit_due_at: null, final_due_at: null })
    toast.success('Booth comped - balance $0')
    if (compEmailKind(app) === 'comp_notice') await sendNotice()
    setAck(false)
    setWorking(false)
  }

  const uncomp = async () => {
    setWorking(true)
    const { error } = await supabase.rpc('uncomp_application', { p_application_id: app.id })
    if (error) { toast.error(error.message); setWorking(false); return }
    let deposit_due_at: string | null = null
    let final_due_at: string | null = null
    if (app.status === 'approved' && app.approved_at) {
      // The deadline rule lives in the drawer's approve path; restoring it
      // here keeps a removed comp from landing already overdue.
      deposit_due_at = restoredDepositDueAt(app.approved_at, new Date())
      final_due_at = FINAL_DUE_AT
      const res = await guardedWrite(
        supabase.from('applications').update({ deposit_due_at, final_due_at }).eq('id', app.id).select('id'),
        'Comp removed, but the due dates were not restored',
        `admin/applications uncomp dates app=${app.id}`,
      )
      if (!res.ok) { toast.error(res.error); deposit_due_at = null; final_due_at = null }
    }
    onPatch({ comped_at: null, comped_by: null, deposit_due_at, final_due_at })
    toast.success('Comp removed - invoice restored to the list price')
    setWorking(false)
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#0a0a0a', border: `1px solid ${comped ? 'rgba(74,222,128,0.35)' : '#2a2a2a'}` }}>
      {comped ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>
                Comped{byName ? ` by ${byName}` : ''} on{' '}
                {new Date(app.comped_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-xs" style={{ color: '#999' }}>Balance $0 · no deposit or final due date · excluded from the payment sweep</p>
            </div>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold tracking-widest" style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>COMP</span>
          </div>
          <div className="flex gap-2">
            {app.status === 'approved' && (
              <button type="button" onClick={sendNotice} disabled={working}
                className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>
                Send comp notice
              </button>
            )}
            <button type="button" onClick={uncomp} disabled={working}
              className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: '#1a1a1a', color: '#999', border: '1px solid #2a2a2a' }}>
              {working ? 'Saving…' : 'Remove comp'}
            </button>
          </div>
        </>
      ) : (
        <>
          {unverified && ack && (
            <p className="text-sm" style={{ color: '#eab308' }}>
              This application claims the veteran discount and its document is not marked verified.
              Verify it above, or comp anyway.
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Comp booth</p>
              <p className="text-xs" style={{ color: '#555' }}>Waives the full amount: invoice settled at $0, no due dates, holds through approve and send back.</p>
            </div>
            <button type="button" onClick={comp} disabled={working}
              className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
              {working ? 'Saving…' : unverified && ack ? 'Comp without verified document' : 'Comp booth'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
