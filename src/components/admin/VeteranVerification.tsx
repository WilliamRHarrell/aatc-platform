'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'

export interface VerificationState {
  veteran_doc_verified_at: string | null
  veteran_doc_verified_by: string | null
}

/**
 * "Document verified" for the veteran discount. The two columns are the ONE
 * home of the fact (migration 071): verified means verified_at is set. Only
 * admins can write them (the clamp restores OLD for owners), and replacing the
 * document clears them in the database, so a stale tick cannot survive a swap.
 */
export default function VeteranVerification({
  applicationId, value, onChange,
}: {
  applicationId: string
  value: VerificationState
  onChange: (next: VerificationState) => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [verifierName, setVerifierName] = useState<string | null>(null)

  const verified = !!value.veteran_doc_verified_at

  // The verifier's name is looked up, never stored twice. Nothing to look up
  // while unverified, and the name is only rendered while verified.
  useEffect(() => {
    const by = value.veteran_doc_verified_by
    if (!by) return
    let cancelled = false
    supabase.from('profiles').select('full_name, email').eq('id', by).maybeSingle().then(({ data }) => {
      if (!cancelled) setVerifierName(data?.full_name || data?.email || null)
    })
    return () => { cancelled = true }
  }, [value.veteran_doc_verified_by, supabase])

  const toggle = async (checked: boolean) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not signed in'); setSaving(false); return }
    const next: VerificationState = checked
      ? { veteran_doc_verified_at: new Date().toISOString(), veteran_doc_verified_by: user.id }
      : { veteran_doc_verified_at: null, veteran_doc_verified_by: null }
    const res = await guardedWrite(
      supabase.from('applications').update(next).eq('id', applicationId).select('id'),
      checked ? 'Could not mark the document verified' : 'Could not clear the verification',
      `admin/applications veteran verification app=${applicationId}`,
    )
    setSaving(false)
    if (!res.ok) { toast.error(res.error); return }
    onChange(next)
  }

  return (
    <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: '#0a0a0a', border: `1px solid ${verified ? 'rgba(74,222,128,0.35)' : '#2a2a2a'}` }}>
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={verified}
          disabled={saving}
          onChange={e => toggle(e.target.checked)}
          className="h-4 w-4 cursor-pointer rounded"
          style={{ accentColor: '#4ade80' }}
        />
        <span className="text-sm font-semibold text-white">Document verified</span>
        {saving && <span className="text-xs" style={{ color: '#555' }}>Saving…</span>}
      </label>
      {verified ? (
        <p className="mt-1 pl-7 text-xs" style={{ color: '#4ade80' }}>
          Verified{verifierName ? ` by ${verifierName}` : ''} on{' '}
          {new Date(value.veteran_doc_verified_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      ) : (
        <p className="mt-1 pl-7 text-xs" style={{ color: '#eab308' }}>
          Not verified. View the document below, then tick this.
        </p>
      )}
    </div>
  )
}
