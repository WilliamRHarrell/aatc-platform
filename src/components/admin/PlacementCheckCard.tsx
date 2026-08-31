'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Finding } from '@/lib/placement-check'

/**
 * The placement check, on the dashboard.
 *
 * THIS IS THE PRIMARY SURFACE, not the email. It is read as a side effect of
 * working - the person who can fix a placement problem already comes here - so
 * its readership does not depend on anyone remembering to look. That is the only
 * property on offer that the hold rule does not undermine.
 *
 * IT MUST DISTINGUISH FOUR STATES. A card that renders nothing means all of:
 *
 *   no findings     the check ran, found nothing. Healthy.
 *   never run       no run has ever been recorded.
 *   errored         the check ran and failed.
 *   stale           it ran, found nothing, and then silently stopped running.
 *
 * Three of those mean the check is not working, and a naive card shows the same
 * blank space for every one. So `ran_at` is displayed WHATEVER the outcome -
 * that timestamp is the difference between "all clear" and "nothing has looked
 * in six weeks", which is the hold rule turned on the check itself.
 */

interface Run {
  ran_at: string
  status: 'ok' | 'error'
  error_message: string | null
  findings: Finding[]
}

// A daily job that has not run in two days has stopped. Deliberately generous:
// one missed run is a blip, two is a pattern, and a threshold that cries wolf
// gets ignored like any other.
const STALE_AFTER_MS = 48 * 60 * 60 * 1000

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3600000)
  if (hours < 1) return 'less than an hour ago'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function PlacementCheckCard() {
  const supabase = createClient()
  const [run, setRun] = useState<Run | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('placement_check_runs')
        .select('ran_at, status, error_message, findings')
        .order('ran_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setRun((data as unknown as Run) ?? null)
      setLoading(false)
    })()
  }, [])

  if (loading) return null

  const stale = run !== null && Date.now() - new Date(run.ran_at).getTime() > STALE_AFTER_MS
  const findings = run?.findings ?? []
  const actionable = findings.filter(f => f.actionable)
  const informational = findings.filter(f => !f.actionable)

  // Each state names itself. None of them is silence.
  let heading: string
  let tone: string
  if (run === null) {
    heading = 'Never run'
    tone = '#eab308'
  } else if (run.status === 'error') {
    heading = 'Check errored'
    tone = '#f87171'
  } else if (stale) {
    heading = 'Check has stopped running'
    tone = '#eab308'
  } else if (actionable.length === 0) {
    heading = 'No placement findings'
    tone = '#4ade80'
  } else {
    heading = `${actionable.length} placement finding${actionable.length === 1 ? '' : 's'}`
    tone = '#f87171'
  }

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
        Sponsor Placements
      </p>

      <div className="flex items-center gap-2">
        <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tone }} />
        <span className="text-sm font-semibold text-white">{heading}</span>
      </div>

      {/* Shown in EVERY state, including the healthy one. Without it, "no
          findings" and "nothing has looked since August" are the same card. */}
      <p className="mt-1 text-xs" style={{ color: stale ? '#eab308' : '#666' }}>
        {run === null
          ? 'No run has ever been recorded. It runs with the 09:00 sweep.'
          : `Last checked ${timeAgo(run.ran_at)} (${new Date(run.ran_at).toLocaleString()})`}
      </p>

      {run?.status === 'error' && run.error_message && (
        <p className="mt-3 rounded-lg p-3 text-xs" style={{ backgroundColor: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
          {run.error_message}
        </p>
      )}

      {actionable.length > 0 && (
        <ul className="mt-3 space-y-2">
          {actionable.map(f => (
            <li key={f.key} className="text-xs leading-relaxed" style={{ color: '#ddd' }}>
              <span style={{ color: '#f87171' }}>&bull;</span> {f.message}
            </li>
          ))}
        </ul>
      )}

      {/* Separated deliberately. A granted placement the tier does not promise
          may well be intentional and nothing records that it was, so it is a
          list to explain rather than a list to correct - and mixing it into the
          count above would inflate a number people are meant to drive to zero. */}
      {informational.length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: '#2a2a2a' }}>
          <p className="mb-2 text-[11px] uppercase tracking-wider" style={{ color: '#666' }}>
            To explain, not to fix
          </p>
          <ul className="space-y-2">
            {informational.map(f => (
              <li key={f.key} className="text-xs leading-relaxed" style={{ color: '#999' }}>
                <span style={{ color: '#666' }}>&bull;</span> {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
