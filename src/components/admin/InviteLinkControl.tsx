'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import type { LinkKind } from '@/lib/invite-link'

/**
 * Portal account for a sponsorship or an in-person application: "Invite &
 * link", resend, unlink. The rules live in /api/admin/invite-link.
 */
export default function InviteLinkControl({
  kind, id, linked, defaultEmail, onChange, allowUnlink = true,
}: {
  kind: LinkKind
  id: string
  linked: boolean
  defaultEmail: string | null
  onChange: (userId: string | null) => void
  /** False for applications: an online applicant's own account must not be cut off here. */
  allowUnlink?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [working, setWorking] = useState(false)

  const call = async (body: Record<string, unknown>) => {
    setWorking(true)
    try {
      const res = await fetch('/api/admin/invite-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, ...body }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? 'That did not work'); return null }
      return j as { action?: string; userId?: string; emailSent?: boolean; unlinked?: boolean }
    } catch {
      toast.error('That did not work')
      return null
    } finally {
      setWorking(false)
    }
  }

  const submit = async () => {
    const r = await call({ email: email.trim() })
    if (!r?.userId) return
    onChange(r.userId)
    setOpen(false)
    const done = r.action === 'invite_new' ? `Account created and linked; invitation sent to ${email.trim()}`
      : r.action === 'resend_invite' ? `Linked; a new set-password link was sent to ${email.trim()}`
      : `Linked to the existing account; ${email.trim()} was told it is in their portal`
    if (r.emailSent === false) toast(`${done.split(';')[0]}, but the email did not send. Press it again to resend.`, { icon: '⚠️' })
    else toast.success(done)
  }

  const unlink = async () => {
    if (!window.confirm('Unlink this account? They will no longer see this in their portal.')) return
    const r = await call({ unlink: true })
    if (r?.unlinked) { onChange(null); toast.success('Unlinked') }
  }

  const btn = 'rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50'

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span style={{ color: '#666' }}>Portal:</span>
        {linked ? (
          <>
            <span className="font-semibold" style={{ color: '#4ade80' }}>Linked ✓</span>
            <button type="button" onClick={() => setOpen(o => !o)} disabled={working} className={btn} style={{ color: '#999', border: '1px solid #2a2a2a' }}>
              Resend
            </button>
            {allowUnlink && (
              <button type="button" onClick={unlink} disabled={working} className={btn} style={{ color: '#666', border: '1px solid #2a2a2a' }}>
                Unlink
              </button>
            )}
          </>
        ) : (
          <>
            <span style={{ color: '#999' }}>not linked</span>
            <button type="button" onClick={() => setOpen(o => !o)} disabled={working} className={btn} style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}>
              Invite &amp; link
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-xl p-3" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}>
          <p className="mb-2 text-[11px] leading-relaxed" style={{ color: '#888' }}>
            If an account with this email exists, it is linked now and they get a short
            &quot;it&apos;s in your portal&quot; email. If not, an account is created, linked, and they get
            a branded invitation to set a password. Pressing it again resends.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="their email"
              className="min-w-[220px] flex-1 rounded-lg px-3 py-2 text-sm text-white outline-none"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
            />
            <button type="button" onClick={submit} disabled={working || !email.trim()} className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#8B7355' }}>
              {working ? 'Sending…' : linked ? 'Resend' : 'Invite & link'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-xs font-medium" style={{ color: '#666', border: '1px solid #2a2a2a' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
