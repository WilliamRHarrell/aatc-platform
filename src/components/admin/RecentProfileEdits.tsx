'use client'

/**
 * Recent self-edits to directory-facing profile fields.
 *
 * Portal profile editing publishes immediately with no approval queue - the
 * right call, because a queue makes an exhibitor wait on staff to fix their own
 * Instagram handle. This feed is the counterweight: nothing is blocked, but
 * nothing changes unseen either.
 *
 * `business_name` is the one worth watching. It is not only the directory
 * listing - it is how staff find an exhibitor in /admin/applications, on an
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

/**
 * The change this feed exists to catch.
 *
 * A rename is the only edit here with consequences outside the directory: the
 * invoice, the booth assignment and the admin search all still carry the old
 * name, so for a while three systems disagree about who this exhibitor is. A
 * phone-number edit has no such blast radius.
 *
 * Once applications open this feed is dozens of rows a day, and a flat
 * chronological list buries renames among routine edits. So renames are the
 * DEFAULT view, always visually distinct, and always counted - a rename cannot
 * scroll off, because the filter and the badge both key on it.
 */
const RENAME_FIELD = 'business_name'

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
  if (value === null || value === '') return ' - '
  if (field === 'logo_url') return 'image'
  return value.length > 40 ? `${value.slice(0, 40)}…` : value
}

export default function RecentProfileEdits() {
  const supabase = createClient()
  const [edits, setEdits] = useState<ProfileEdit[]>([])
  const [loading, setLoading] = useState(true)
  const [showStaff, setShowStaff] = useState(false)
  // Default to renames. On a busy day this feed is dozens of rows and a
  // chronological mix buries the one change that matters - see the comment on
  // RENAME_FIELD below.
  const [renamesOnly, setRenamesOnly] = useState(true)
  const [renameCount, setRenameCount] = useState(0)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const load = async () => {
      let q = supabase
        .from('profile_edits')
        .select('id, application_id, business_name, field, old_value, new_value, by_owner, edited_at')
        .order('edited_at', { ascending: false })
        .limit(25)

      if (!showStaff) q = q.eq('by_owner', true)
      if (renamesOnly) q = q.eq('field', RENAME_FIELD)

      // Rename count is fetched independently of the filter so the badge is
      // right whichever view is showing - otherwise "All fields" would report
      // the number of renames currently on screen, not the number there are.
      let countQ = supabase
        .from('profile_edits')
        .select('id', { count: 'exact', head: true })
        .eq('field', RENAME_FIELD)
      if (!showStaff) countQ = countQ.eq('by_owner', true)

      const [{ data, error }, { count }] = await Promise.all([q, countQ])

      if (error) {
        // 42P01 = migration 048 not applied. Say so rather than rendering an
        // empty feed that looks like "nobody has edited anything".
        console.error(`[admin] profile_edits query failed (${error.code}): ${error.message}`)
        setUnavailable(true)
        setLoading(false)
        return
      }

      setEdits((data as ProfileEdit[]) ?? [])
      setRenameCount(count ?? 0)
      setLoading(false)
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStaff, renamesOnly])

  if (unavailable) {
    return (
      <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>
          Recent Profile Edits
        </p>
        <p className="mt-3 text-sm" style={{ color: '#777' }}>
          Edit history is unavailable - migration 048 has not been applied.
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
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => { setLoading(true); setRenamesOnly(true) }}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
            style={renamesOnly
              ? { backgroundColor: 'rgba(250,204,21,0.15)', color: '#facc15', border: '1px solid rgba(250,204,21,0.4)' }
              : { border: '1px solid #2a2a2a', color: '#999' }}
          >
            Renames{renameCount > 0 ? ` (${renameCount})` : ''}
          </button>
          <button
            onClick={() => { setLoading(true); setRenamesOnly(false) }}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
            style={!renamesOnly
              ? { backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.4)' }
              : { border: '1px solid #2a2a2a', color: '#999' }}
          >
            All fields
          </button>
          <button
            onClick={() => { setLoading(true); setShowStaff(v => !v) }}
            className="rounded-lg px-2.5 py-1 text-[11px] font-medium"
            style={{ border: '1px solid #2a2a2a', color: '#999' }}
          >
            {showStaff ? 'Exhibitor only' : '+ staff'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm" style={{ color: '#555' }}>Loading…</p>
      ) : edits.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: '#555' }}>
          {renamesOnly
            ? 'No business-name changes yet.'
            : showStaff ? 'No profile edits yet.' : 'No exhibitor self-edits yet.'}
        </p>
      ) : (
        <div className="space-y-2.5">
          {edits.map(e => (
            <div
              key={e.id}
              className="flex items-start gap-3 rounded-lg text-sm"
              style={e.field === RENAME_FIELD
                ? { backgroundColor: 'rgba(250,204,21,0.06)', borderLeft: '2px solid #facc15', padding: '6px 8px 6px 10px' }
                : { padding: '0 8px 0 12px' }}
            >
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
                  {e.field === RENAME_FIELD ? (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                      style={{ backgroundColor: 'rgba(250,204,21,0.18)', color: '#facc15' }}
                    >
                      renamed
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: '#8B7355' }}>
                      {FIELD_LABELS[e.field] ?? e.field}
                    </span>
                  )}
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

      {renamesOnly && edits.length > 0 && (
        <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed" style={{ borderColor: '#2a2a2a', color: '#666' }}>
          A rename changes the directory immediately, but the invoice, the booth
          assignment and admin search still carry the old name. If this exhibitor
          has a booth, check it is still findable under the new one.
        </p>
      )}
    </div>
  )
}
