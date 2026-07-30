'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { ADMIN_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, isAdminRole, type AdminRole } from '@/lib/roles'

interface Profile {
  id: string
  email: string
  full_name: string | null
  role: string
  created_at: string
}

const ALL_ROLES = [...ADMIN_ROLES, 'exhibitor', 'public'] as const

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  admin:               { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  content_editor:      { bg: 'rgba(196,168,130,0.15)', color: '#C4A882' },
  sponsorship_manager: { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
  exhibitor:           { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80' },
  public:              { bg: 'rgba(153,153,153,0.12)', color: '#999' },
}

export default function AdminUsersPage() {
  const supabase = createClient()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMeId(user?.id ?? null)
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .order('role')
        .order('email')
      setProfiles((data as unknown as Profile[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const setRole = async (p: Profile, role: string) => {
    if (role === p.role) return
    setWorking(p.id)
    const res = await fetch('/api/admin/set-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: p.id, role }),
    })
    const json = await res.json().catch(() => ({}))
    setWorking(null)
    if (!res.ok) { toast.error(json.error ?? 'Failed to set role'); return }
    setProfiles(prev => prev.map(x => (x.id === p.id ? { ...x, role } : x)))
    toast.success(`${p.email} is now ${ROLE_LABELS[role as AdminRole] ?? role}`)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return profiles
    return profiles.filter(p =>
      p.email.toLowerCase().includes(q) || (p.full_name ?? '').toLowerCase().includes(q)
    )
  }, [profiles, query])

  const adminCount = profiles.filter(p => p.role === 'admin').length

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Team &amp; Roles</h1>
      <p className="mt-1 text-sm" style={{ color: '#999' }}>
        Assigning roles previously required running SQL. Only full admins can change roles.
      </p>

      {/* The limitation, stated where it is acted on. */}
      <div
        className="mt-5 rounded-xl px-4 py-3 text-xs leading-relaxed"
        style={{ backgroundColor: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)', color: '#eab308' }}
      >
        <strong>These roles restrict the admin interface, not the database.</strong> A
        content editor or sponsorship manager who knows the API can still read data their
        sidebar hides — including artist photo ID uploads. Give these roles only to people
        you would otherwise trust as full admins.
      </div>

      {/* What each role can do */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {ADMIN_ROLES.map(r => (
          <div key={r} className="rounded-xl p-4" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={ROLE_STYLE[r]}
            >
              {ROLE_LABELS[r]}
            </span>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: '#999' }}>{ROLE_DESCRIPTIONS[r]}</p>
          </div>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by email or name…"
        className="mt-6 w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none"
        style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
      />

      <div className="mt-4 space-y-2">
        {filtered.map(p => {
          const isMe = p.id === meId
          const lastAdmin = p.role === 'admin' && adminCount <= 1
          return (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {p.full_name || p.email}
                  {isMe && <span className="ml-2 text-xs font-normal" style={{ color: '#666' }}>(you)</span>}
                </p>
                {p.full_name && <p className="truncate text-xs" style={{ color: '#666' }}>{p.email}</p>}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={ROLE_STYLE[p.role] ?? ROLE_STYLE.public}
                >
                  {isAdminRole(p.role) ? ROLE_LABELS[p.role] : p.role}
                </span>
                <select
                  value={p.role}
                  disabled={isMe || lastAdmin || working === p.id}
                  onChange={e => setRole(p, e.target.value)}
                  title={
                    isMe ? 'You cannot change your own role'
                      : lastAdmin ? 'Promote another full admin first'
                      : 'Change role'
                  }
                  className="rounded-lg px-3 py-1.5 text-xs text-white outline-none disabled:opacity-40"
                  style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
                >
                  {ALL_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r as AdminRole] ?? r}</option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: '#555' }}>No matching people.</p>
        )}
      </div>
    </div>
  )
}
