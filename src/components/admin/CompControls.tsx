'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { FINAL_DUE_AT } from '@/lib/event-config'
import { formatCurrency } from '@/lib/utils'
import { compEmailKind, compInvoiceAmount, permitFeesFor, restoredDepositDueAt, type CompPricingApp } from '@/lib/comp'

export interface CompApp extends CompPricingApp {
  id: string
  status: string
  approved_at: string | null
  comped_by: string | null
  permits_comped_by?: string | null
  deposit_due_at?: string | null
  final_due_at?: string | null
  is_veteran: boolean
  veteran_doc_verified_at: string | null
}

export interface CompPatch {
  comped_at: string | null
  comped_by: string | null
  permits_comped_at: string | null
  permits_comped_by: string | null
  deposit_due_at: string | null
  final_due_at: string | null
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/**
 * Comp booth / Comp permits (migration 089). Each is set separately through
 * set_comp(), which changes the application and re-prices its invoice in one
 * transaction and refuses once anything is paid; its message is what the admin
 * sees. Booth comped + permits charged leaves the permit fees on the invoice
 * under the normal billing rules, so due dates are set here when missing.
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
  const booth = !!app.comped_at
  const permits = !!app.permits_comped_at
  const permitFees = permitFeesFor(app)
  const invoice = compInvoiceAmount(app)

  useEffect(() => {
    const by = app.comped_by ?? app.permits_comped_by
    if (!by) return
    let cancelled = false
    supabase.from('profiles').select('full_name, email').eq('id', by).maybeSingle().then(({ data }) => {
      if (!cancelled) setByName(data?.full_name || data?.email || null)
    })
    return () => { cancelled = true }
  }, [app.comped_by, app.permits_comped_by, supabase])

  const sendNotice = async () => {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: app.id, kind: 'comp_notice' }),
    })
    if (res.ok) toast.success('Comp notice sent')
    else toast.error('Comp notice was not sent - send it again from here')
  }

  const apply = async (nextBooth: boolean, nextPermits: boolean) => {
    const turningOn = (nextBooth && !booth) || (nextPermits && !permits)
    if (turningOn && unverified && !ack) { setAck(true); return }
    setWorking(true)
    const { data: amount, error } = await supabase.rpc('set_comp', { p_application_id: app.id, p_booth: nextBooth, p_permits: nextPermits })
    if (error) {
      toast.error(error.code === 'PGRST202' ? 'The comp split needs migration 089 applied in Supabase.' : error.message)
      setWorking(false)
      return
    }
    const owed = Number(amount ?? 0)
    const { data: { user } } = await supabase.auth.getUser()
    const now = new Date().toISOString()

    // $0: set_comp cleared the due dates. A balance on an approved application
    // needs them (the drawer's approve rule); keep any that are already set.
    let deposit_due_at: string | null = owed === 0 ? null : app.deposit_due_at ?? null
    let final_due_at: string | null = owed === 0 ? null : app.final_due_at ?? null
    if (owed > 0 && app.status === 'approved' && app.approved_at && (!deposit_due_at || !final_due_at)) {
      deposit_due_at = deposit_due_at ?? restoredDepositDueAt(app.approved_at, new Date())
      final_due_at = final_due_at ?? FINAL_DUE_AT
      const res = await guardedWrite(
        supabase.from('applications').update({ deposit_due_at, final_due_at }).eq('id', app.id).select('id'),
        'Comp saved, but the due dates were not set',
        `admin/applications comp dates app=${app.id}`,
      )
      if (!res.ok) { toast.error(res.error); deposit_due_at = app.deposit_due_at ?? null; final_due_at = app.final_due_at ?? null }
    }

    onPatch({
      comped_at: nextBooth ? (app.comped_at ?? now) : null,
      comped_by: nextBooth ? (app.comped_by ?? user?.id ?? null) : null,
      permits_comped_at: nextPermits ? (app.permits_comped_at ?? now) : null,
      permits_comped_by: nextPermits ? (app.permits_comped_by ?? user?.id ?? null) : null,
      deposit_due_at,
      final_due_at,
    })
    toast.success(`Saved - invoice ${formatCurrency(owed)}`)
    if (nextBooth && !booth && compEmailKind(app) === 'comp_notice') await sendNotice()
    setAck(false)
    setWorking(false)
  }

  const row = (label: string, on: boolean, detail: string, toggleLabel: string, onToggle: () => void) => (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold" style={{ color: on ? '#4ade80' : '#fff' }}>{label}</p>
        <p className="text-xs" style={{ color: '#888' }}>{detail}</p>
      </div>
      <button type="button" onClick={onToggle} disabled={working}
        className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
        style={on
          ? { backgroundColor: '#1a1a1a', color: '#999', border: '1px solid #2a2a2a' }
          : { backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
        {working ? 'Saving…' : unverified && ack && !on ? `${toggleLabel} without verified document` : toggleLabel}
      </button>
    </div>
  )

  const anyComp = booth || permits
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#0a0a0a', border: `1px solid ${anyComp ? 'rgba(74,222,128,0.35)' : '#2a2a2a'}` }}>
      {unverified && ack && (
        <p className="text-sm" style={{ color: '#eab308' }}>
          This application claims the veteran discount and its document is not marked verified. Verify it above, or comp anyway.
        </p>
      )}
      {row(
        booth ? 'Booth comped' : 'Booth charged',
        booth,
        booth ? `Booth fees waived${byName ? ` by ${byName}` : ''} on ${fmtDate(app.comped_at!)}` : 'Comp booth waives the booth fees; permit fees are still charged unless permits are comped too.',
        booth ? 'Remove booth comp' : 'Comp booth',
        () => apply(!booth, permits),
      )}
      {permitFees > 0 && row(
        permits ? 'Permits comped' : 'Permits charged',
        permits,
        permits ? `Artist permit fees (${formatCurrency(permitFees)}) waived on ${fmtDate(app.permits_comped_at!)}` : `Artist permit fees: ${formatCurrency(permitFees)}`,
        permits ? 'Charge permits' : 'Comp permits',
        () => apply(booth, !permits),
      )}
      {anyComp && (
        <div className="flex items-center justify-between pt-2 text-xs" style={{ borderTop: '1px solid #1e1e1e' }}>
          <span style={{ color: '#999' }}>
            Invoice {formatCurrency(invoice)}
            {invoice === 0 ? ' · no due dates · excluded from the payment sweep' : ' · normal due dates and reminders · never expired or cancelled'}
          </span>
          {booth && app.status === 'approved' && (
            <button type="button" onClick={sendNotice} disabled={working}
              className="rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
              style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>
              Send comp notice
            </button>
          )}
        </div>
      )}
    </div>
  )
}
