'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
  waitlisted: number
  artists: number
  vendors: number
  revenue: number
}

interface RecentApp {
  id: string
  business_name: string
  exhibitor_type: 'artist' | 'vendor'
  booth_size: string
  total_amount: number
  status: string
  created_at: string
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: '#1a1a1a', border: `1px solid ${accent ? 'rgba(139,115,85,0.4)' : '#2a2a2a'}` }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs" style={{ color: '#999' }}>{sub}</p>}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    pending:    { bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
    approved:   { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
    rejected:   { bg: 'rgba(248,113,113,0.15)',color: '#f87171' },
    waitlisted: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
  }
  const s = map[status] ?? { bg: 'rgba(255,255,255,0.1)', color: '#999' }
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {status}
    </span>
  )
}

export default function AdminPage() {
  const supabase = createClient()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<RecentApp[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const [{ data: apps }, { data: approvedApps }] = await Promise.all([
        supabase.from('applications').select('id, exhibitor_type, status, total_amount'),
        supabase.from('applications').select('total_amount').eq('status', 'approved'),
      ])

      if (apps) {
        setStats({
          total:      apps.length,
          pending:    apps.filter(a => a.status === 'pending').length,
          approved:   apps.filter(a => a.status === 'approved').length,
          rejected:   apps.filter(a => a.status === 'rejected').length,
          waitlisted: apps.filter(a => a.status === 'waitlisted').length,
          artists:    apps.filter(a => a.exhibitor_type === 'artist').length,
          vendors:    apps.filter(a => a.exhibitor_type === 'vendor').length,
          revenue:    (approvedApps ?? []).reduce((sum, a) => sum + a.total_amount, 0),
        })
      }

      const { data: recentData } = await supabase
        .from('applications')
        .select('id, business_name, exhibitor_type, booth_size, total_amount, status, created_at')
        .order('created_at', { ascending: false })
        .limit(8)

      setRecent((recentData as RecentApp[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm" style={{ color: '#999' }}>AATC 2027 — overview</p>
      </div>

      {/* Stats grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Applications" value={stats?.total ?? 0} accent />
        <StatCard label="Pending Review"     value={stats?.pending ?? 0}  sub="awaiting decision" />
        <StatCard label="Approved"           value={stats?.approved ?? 0} sub={`${stats?.rejected ?? 0} rejected`} />
        <StatCard label="Revenue (invoiced)" value={formatCurrency(stats?.revenue ?? 0)} sub="approved applications" />
      </div>

      {/* Type + status breakdown */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>By Type</p>
          <div className="space-y-3">
            {[
              { label: 'Artists', value: stats?.artists ?? 0 },
              { label: 'Vendors', value: stats?.vendors ?? 0 },
            ].map(row => (
              <div key={row.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-white">{row.label}</span>
                  <span style={{ color: '#999' }}>{row.value}</span>
                </div>
                <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: '#2a2a2a' }}>
                  <div
                    className="h-1.5 rounded-full"
                    style={{ width: `${stats?.total ? (row.value / stats.total) * 100 : 0}%`, backgroundColor: '#8B7355' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>By Status</p>
          <div className="space-y-2">
            {[
              { label: 'Pending',    value: stats?.pending ?? 0,    color: '#eab308' },
              { label: 'Approved',   value: stats?.approved ?? 0,   color: '#4ade80' },
              { label: 'Rejected',   value: stats?.rejected ?? 0,   color: '#f87171' },
              { label: 'Waitlisted', value: stats?.waitlisted ?? 0, color: '#60a5fa' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                  <span style={{ color: '#999' }}>{row.label}</span>
                </div>
                <span className="font-semibold text-white">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent applications */}
      <div className="rounded-2xl" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #2a2a2a' }}>
          <p className="font-semibold text-white">Recent Applications</p>
          <Link
            href="/admin/applications"
            className="text-xs transition-colors"
            style={{ color: '#8B7355' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#8B7355')}
          >
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm" style={{ color: '#555' }}>
            No applications yet
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#2a2a2a' }}>
            {recent.map(app => (
              <Link
                key={app.id}
                href="/admin/applications"
                className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{app.business_name}</p>
                  <p className="text-xs capitalize" style={{ color: '#999' }}>
                    {app.exhibitor_type} · {app.booth_size} booth
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden text-sm font-medium sm:block" style={{ color: '#C4A882' }}>
                    {formatCurrency(app.total_amount)}
                  </span>
                  <StatusBadge status={app.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
