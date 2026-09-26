'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Other applications by the same account or the same email, so a duplicate
 * that got past the pre-check (a second event, a rejected-then-reapplied
 * pair, or two accounts with one email) is visible where the decision is made.
 */
export default function DuplicateWarning({ applicationId, userId, email }: { applicationId: string; userId: string | null; email: string }) {
  const supabase = createClient()
  const [others, setOthers] = useState<Array<{ id: string; business_name: string; status: string; created_at: string }>>([])

  useEffect(() => {
    let cancelled = false
    const filter = userId ? `user_id.eq.${userId},email.ilike.${email.replace(/[,()]/g, '')}` : `email.ilike.${email.replace(/[,()]/g, '')}`
    supabase.from('applications').select('id, business_name, status, created_at').or(filter).neq('id', applicationId).order('created_at')
      .then(({ data }) => { if (!cancelled) setOthers(data ?? []) })
    return () => { cancelled = true }
  }, [applicationId, userId, email, supabase])

  if (others.length === 0) return null
  return (
    <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.4)', color: '#eab308' }}>
      <p className="font-semibold">Also applied from this account or email:</p>
      <ul className="mt-1 space-y-0.5">
        {others.map(o => (
          <li key={o.id}>{o.business_name} · {o.status} · {new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</li>
        ))}
      </ul>
    </div>
  )
}
