'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import { directoryListing } from '@/lib/directory-listing'

/**
 * "Show in directory before deposit" (applications.directory_override, 032).
 * Admin only twice over: /admin/applications is admin-only (roles.ts), and the
 * 079 staff clamp resets the column for any non-admin write.
 */
export default function DirectoryOverrideControl({
  app,
  onPatch,
}: {
  app: { id: string; status: string; needs_roster: boolean; directory_override: boolean; comped_at?: string | null }
  onPatch: (patch: { directory_override: boolean }) => void
}) {
  const supabase = createClient()
  const [depositPaid, setDepositPaid] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    supabase.from('invoices').select('deposit_paid_at').eq('application_id', app.id)
      .then(({ data }) => { if (live) setDepositPaid((data ?? []).some(i => !!i.deposit_paid_at)) })
    return () => { live = false }
  }, [app.id, supabase])

  const toggle = async (next: boolean) => {
    setSaving(true)
    const res = await guardedWrite(
      supabase.from('applications').update({ directory_override: next }).eq('id', app.id).select('id'),
      'Directory setting not saved',
      `admin/applications directory_override app=${app.id} -> ${next}`,
    )
    setSaving(false)
    if (!res.ok) { toast.error(res.error); return }
    onPatch({ directory_override: next })
    toast.success(next ? 'Shown in the directory before deposit' : 'Directory now waits for a deposit')
  }

  const listing = depositPaid === null ? null : directoryListing(app, depositPaid)

  return (
    <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id={`directory-override-${app.id}`}
          checked={app.directory_override}
          disabled={saving}
          onChange={e => toggle(e.target.checked)}
          className="h-4 w-4 cursor-pointer rounded"
          style={{ accentColor: '#8B7355' }}
        />
        <label htmlFor={`directory-override-${app.id}`} className="cursor-pointer text-sm font-semibold text-white">
          Show in directory before deposit
        </label>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: '#888' }}>
        Lists this exhibitor in the public directory regardless of payment, and opens Submit Graphics in their portal.
        Approval and a complete artist roster are still required.
      </p>
      {listing && (
        <p className="text-xs font-semibold" style={{ color: listing.listed ? '#4ade80' : '#999' }}>{listing.reason}</p>
      )}
    </div>
  )
}
