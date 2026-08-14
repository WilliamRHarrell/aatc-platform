'use client'

/**
 * Recent self-edits to directory-facing profile fields.
 *
 * Portal profile editing publishes immediately with no approval queue — the
 * right call, because a queue makes an exhibitor wait on staff to fix their own
 * Instagram handle. This feed is the counterweight: nothing is blocked, but
 * nothing changes unseen either.
 *
 * `business_name` is the one worth watching. It is not only the directory
 * listing — it is how staff find an exhibitor in /admin/applications, on an
 * invoice, and on a booth assignment. An exhibitor renaming themselves is
 * legitimate and expected; it is also the change most likely to make someone
 * say "that booth isn't in the system".
 *
 * Owner edits are shown by default. Staff edits are recorded too (the trigger
 * logs both) but hidden behind the toggle, because an admin editing from
 * /admin/applications is already a deliberate action they took themselves.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

interface ProfileEdit {
  id: string
  application_id: string
  business_name: string | null
  field: string
  old_value: string | null
  new_value: string | null
  by_owner: boolean
  edited_at: string
}

const FIELD_LABELS: Record<string, string> = {
  business_name: 'Business name',
  website: 'Website',
  instagram: 'Instagram',
  facebook: 'Facebook',
  phone: 'Phone',
  logo_url: 'Logo',
}

function relative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Logo URLs are long and unreadable in a feed; show that it changed, not what to. */
function displayValue(field: string, value: string | null): string {
  if (value === null || value === '') return '—'
  if (field === 'logo_url') return 'image'
  return value.length > 40 ? `${value.slice(0, 40)}…` : value
}

export default function RecentProfileEdits() {
  const supabase = createClient()
  const [edits, setEdits] = useState<ProfileEdit[]>([])
  const [loading, setLoading] = useState(true)
  const [showStaff, setShowStaff] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const load = async () => {
      let q = supabase
        .from('profile_edits')
        .select('id, application_id, business_name, field, old_value, new_value, by_owner, edited_at')
        .order('edited_at', { ascending: false })
        .limit(25)

      if (!showStaff) q = q.eq('by_owner', true)

      const { data, error } = await q

      if (error) {
        // 42P01 = migration 048 not applied. Say so rather than rendering an
        // empty feed that looks like "nobody has edited anything".
        console.error(`[admin] profile_edits query failed (${error.code}): ${error.message}`)
        setUnavailable(true)
        setLoading(false)
        return
      }

      setEdits((data as ProfileEdit[]) ?? [])
      setLoading(false)
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStaff])

  if (unavailable) {
    return (
      <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
          Recent Profile Edits
        </p>
        <p className="mt-3 text-sm" style={{ color: '#777' }}>
          Edit history is unavailable — migration 048 has not been applied.
          Self-edits are still working; they are just not being recorded yet.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
          Recent Profile Edits
        </p>
        <button
          onClick={() => { setLoading(true); setShowStaff(v => !v) }}
          className="rounded-lg px-2.5 py-1 text-[11px] font-medium"
          style={{ border: '1px solid #2a2a2a', color: '#999' }}
        >
          {showStaff ? 'Exhibitor edits only' : 'Include staff edits'}
        </button>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm" style={{ color: '#555' }}>Loading…</p>
      ) : edits.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: '#555' }}>
          {showStaff ? 'No profile edits yet.' : 'No exhibitor self-edits yet.'}
        </p>
      ) : (
        <div className="space-y-2.5">
          {edits.map(e => (
            <div key={e.id} className="flex items-start gap-3 text-sm">
              <span className="w-14 shrink-0 pt-0.5 text-[11px]" style={{ color: '#555' }}>
                {relative(e.edited_at)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    href={`/admin/applications?id=${e.application_id}`}
                    className="font-medium text-white hover:underline"
                  >
                    {e.business_name ?? 'Unknown'}
                  </Link>
                  <span className="text-[11px]" style={{ color: '#8B7355' }}>
                    {FIELD_LABELS[e.field] ?? e.field}
                  </span>
                  {!e.by_owner && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                      style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}
                    >
                      staff
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px]" style={{ color: '#777' }}>
                  <span style={{ textDecoration: 'line-through', color: '#555' }}>
                    {displayValue(e.field, e.old_value)}
                  </span>
                  {' → '}
                  <span style={{ color: '#bbb' }}>{displayValue(e.field, e.new_value)}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
