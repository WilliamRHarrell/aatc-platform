'use client'

import { useEffect, useState } from 'react'

interface Health {
  approved: number
  rosterComplete: number
  depositPaid: number
  overridden: number
  visible: number
  expected: number
  healthy: boolean
  error: string | null
}

const STEPS: { key: keyof Health; label: string; hint: string }[] = [
  { key: 'approved', label: 'Approved', hint: 'Applications marked approved' },
  { key: 'rosterComplete', label: 'Roster done', hint: 'Artist roster submitted' },
  { key: 'depositPaid', label: 'Deposit paid', hint: '25% of the invoice recorded' },
  { key: 'visible', label: 'Live in directory', hint: 'Measured as an anonymous visitor' },
]

/**
 * Directory funnel, admin dashboard.
 *
 * The four counts sit side by side so a drop between any two stages is obvious
 * at a glance. The last one is measured with a real anonymous read - the RLS
 * recursion went unseen for twelve weeks because "0 listed" and "12 approved"
 * were never shown next to each other.
 */
export default function DirectoryHealth() {
  const [data, setData] = useState<Health | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/admin/directory-health')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  if (failed) return null

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: '#8B7355' }}>
          Public Directory Funnel
        </h2>
        {data && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={
              data.healthy
                ? { backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80' }
                : { backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171' }
            }
          >
            {data.healthy ? 'Healthy' : 'Mismatch'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STEPS.map(step => {
          const value = data ? (data[step.key] as number) : null
          const isLast = step.key === 'visible'
          const bad = data && isLast && !data.healthy
          return (
            <div key={step.key}>
              <p
                className="font-display text-3xl font-bold"
                style={{ color: bad ? '#f87171' : isLast ? '#C4A882' : '#fff' }}
              >
                {value ?? ' - '}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-white">{step.label}</p>
              <p className="mt-0.5 text-[11px] leading-tight" style={{ color: '#666' }}>{step.hint}</p>
            </div>
          )
        })}
      </div>

      {data && data.overridden > 0 && (
        <p className="mt-4 text-xs" style={{ color: '#999' }}>
          {data.overridden} listed by admin override (no recorded deposit).
        </p>
      )}

      {data && !data.healthy && (
        <div
          className="mt-4 rounded-xl px-4 py-3 text-xs leading-relaxed"
          style={{ backgroundColor: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}
        >
          <strong>{data.visible} visible publicly, {data.expected} expected.</strong>{' '}
          {data.error
            ? `The public read failed: ${data.error}`
            : 'Exhibitors who should be listed are not reaching the public directory. Check the RLS policies on applications.'}
        </div>
      )}
    </div>
  )
}
