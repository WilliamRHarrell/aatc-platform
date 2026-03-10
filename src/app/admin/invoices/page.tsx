'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Invoice {
  id: string
  application_id: string | null
  sponsorship_id: string | null
  amount: number
  amount_paid: number
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  due_date: string | null
  paid_at: string | null
  created_at: string
  application: {
    business_name: string
    contact_name: string
    email: string
    exhibitor_type: 'artist' | 'vendor'
    booth_size: string
  } | null
  sponsorship: {
    sponsor_name: string
    tier: string
    amount: number
  } | null
}

type StatusFilter = 'all' | 'pending' | 'paid' | 'overdue' | 'cancelled'

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:   { bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
  paid:      { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
  overdue:   { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  cancelled: { bg: 'rgba(153,153,153,0.15)', color: '#999' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.cancelled
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {status}
    </span>
  )
}

export default function AdminInvoicesPage() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [working, setWorking] = useState<string | null>(null)

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState<Invoice | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')

  const load = async () => {
    const { data } = await supabase
      .from('invoices')
      .select(`
        id, application_id, sponsorship_id, amount, amount_paid, status, due_date, paid_at, created_at,
        application:applications (
          business_name, contact_name, email, exhibitor_type, booth_size
        ),
        sponsorship:sponsorships (
          sponsor_name, tier, amount
        )
      `)
      .order('created_at', { ascending: false })

    setInvoices((data as unknown as Invoice[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (filter !== 'all' && inv.status !== filter) return false
      if (search) {
        const q = search.toLowerCase()
        const app = inv.application
        const spon = inv.sponsorship
        const nameMatch = app
          ? (app.business_name.toLowerCase().includes(q) || app.email.toLowerCase().includes(q) || app.contact_name.toLowerCase().includes(q))
          : spon
            ? spon.sponsor_name.toLowerCase().includes(q)
            : false
        if (!nameMatch) return false
      }
      return true
    })
  }, [invoices, filter, search])

  const counts = useMemo(() => ({
    all:       invoices.length,
    pending:   invoices.filter(i => i.status === 'pending').length,
    paid:      invoices.filter(i => i.status === 'paid').length,
    overdue:   invoices.filter(i => i.status === 'overdue').length,
    cancelled: invoices.filter(i => i.status === 'cancelled').length,
  }), [invoices])

  const totalRevenue = useMemo(
    () => invoices.filter(i => i.status !== 'cancelled').reduce((s, i) => s + (i.amount_paid ?? 0), 0),
    [invoices]
  )
  const totalOutstanding = useMemo(
    () => invoices.filter(i => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + (i.amount - (i.amount_paid ?? 0)), 0),
    [invoices]
  )

  const openPaymentModal = (inv: Invoice) => {
    setPaymentModal(inv)
    setPaymentAmount('')
  }

  const recordPayment = async () => {
    if (!paymentModal) return
    const dollars = parseFloat(paymentAmount)
    if (isNaN(dollars) || dollars <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }

    const cents = Math.round(dollars * 100)
    const balance = paymentModal.amount - (paymentModal.amount_paid ?? 0)

    if (cents > balance) {
      toast.error(`Payment cannot exceed the balance of ${formatCurrency(balance)}`)
      return
    }

    setWorking(paymentModal.id)
    const newAmountPaid = (paymentModal.amount_paid ?? 0) + cents
    const fullyPaid = newAmountPaid >= paymentModal.amount

    const updateData: Record<string, unknown> = {
      amount_paid: newAmountPaid,
    }
    if (fullyPaid) {
      updateData.status = 'paid'
      updateData.paid_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', paymentModal.id)

    if (error) {
      toast.error('Failed to record payment')
    } else {
      const invName = paymentModal.application?.business_name ?? paymentModal.sponsorship?.sponsor_name ?? 'Invoice'
      toast.success(
        fullyPaid
          ? `${invName} paid in full!`
          : `${formatCurrency(cents)} payment recorded for ${invName}`
      )
      setInvoices(prev =>
        prev.map(i =>
          i.id === paymentModal.id
            ? {
                ...i,
                amount_paid: newAmountPaid,
                ...(fullyPaid ? { status: 'paid' as const, paid_at: new Date().toISOString() } : {}),
              }
            : i
        )
      )
      setPaymentModal(null)
    }
    setWorking(null)
  }

  const markOverdue = async (inv: Invoice) => {
    setWorking(inv.id)
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'overdue' })
      .eq('id', inv.id)

    if (error) {
      toast.error('Failed to update status')
    } else {
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'overdue' } : i))
    }
    setWorking(null)
  }

  const markCancelled = async (inv: Invoice) => {
    setWorking(inv.id)
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'cancelled' })
      .eq('id', inv.id)

    if (error) {
      toast.error('Failed to update status')
    } else {
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'cancelled' } : i))
    }
    setWorking(null)
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Invoices</h1>
        <p className="mt-1 text-sm" style={{ color: '#999' }}>Track payments from exhibitors and sponsors</p>
      </div>

      {/* Revenue summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(139,115,85,0.4)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Revenue Collected</p>
          <p className="mt-2 font-display text-3xl font-bold" style={{ color: '#4ade80' }}>{formatCurrency(totalRevenue)}</p>
          <p className="mt-1 text-xs" style={{ color: '#555' }}>{counts.paid} paid in full</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Outstanding</p>
          <p className="mt-2 font-display text-3xl font-bold" style={{ color: '#eab308' }}>{formatCurrency(totalOutstanding)}</p>
          <p className="mt-1 text-xs" style={{ color: '#555' }}>{counts.pending + counts.overdue} invoice{(counts.pending + counts.overdue) !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B7355' }}>Total Invoiced</p>
          <p className="mt-2 font-display text-3xl font-bold text-white">{formatCurrency(invoices.reduce((s, i) => s + (i.status !== 'cancelled' ? i.amount : 0), 0))}</p>
          <p className="mt-1 text-xs" style={{ color: '#555' }}>{invoices.length} total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg px-3 text-sm outline-none sm:w-64"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff' }}
        />
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'paid', 'overdue', 'cancelled'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors"
              style={{
                backgroundColor: filter === f ? 'rgba(139,115,85,0.2)' : 'transparent',
                color: filter === f ? '#C4A882' : '#666',
                border: `1px solid ${filter === f ? 'rgba(139,115,85,0.4)' : '#2a2a2a'}`,
              }}
            >
              {f === 'all' ? `All (${counts.all})` : `${f} (${counts[f]})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm" style={{ color: '#555' }}>
            {invoices.length === 0 ? 'No invoices yet — approve an application or send a sponsorship invoice to get started.' : 'No invoices match your filters.'}
          </div>
        ) : (
          <>
            {/* Desktop header */}
            <div
              className="hidden grid-cols-[1fr_120px_160px_140px_180px] items-center gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider sm:grid"
              style={{ borderBottom: '1px solid #2a2a2a', color: '#555' }}
            >
              <span>Applicant</span>
              <span>Type</span>
              <span>Amount / Balance</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            <div className="divide-y" style={{ borderColor: '#2a2a2a' }}>
              {filtered.map(inv => {
                const app = inv.application
                const spon = inv.sponsorship
                const isWorking = working === inv.id
                const amountPaid = inv.amount_paid ?? 0
                const balance = inv.amount - amountPaid
                const hasPartialPayment = amountPaid > 0 && amountPaid < inv.amount
                const displayName = app?.business_name ?? spon?.sponsor_name ?? '—'
                const displaySub = app
                  ? `${app.contact_name} · ${app.email}`
                  : spon
                    ? `${spon.tier.replace(/_/g, ' ')} sponsorship`
                    : ''
                return (
                  <div
                    key={inv.id}
                    className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_120px_160px_140px_180px] sm:items-center"
                  >
                    {/* Applicant / Sponsor */}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{displayName}</p>
                      <p className="truncate text-xs" style={{ color: '#666' }}>
                        {displaySub}
                      </p>
                      <p className="mt-1 text-xs sm:hidden" style={{ color: '#999' }}>
                        {spon ? 'Sponsorship' : `${app?.exhibitor_type} · ${app?.booth_size}`} · {formatCurrency(inv.amount)}
                      </p>
                    </div>

                    {/* Type (desktop) */}
                    <div className="hidden sm:block">
                      {spon ? (
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{ backgroundColor: 'rgba(255,215,0,0.15)', color: '#ffd700' }}
                        >
                          Sponsor
                        </span>
                      ) : (
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
                          style={{
                            backgroundColor: app?.exhibitor_type === 'artist' ? 'rgba(139,115,85,0.2)' : 'rgba(96,165,250,0.15)',
                            color: app?.exhibitor_type === 'artist' ? '#C4A882' : '#60a5fa',
                          }}
                        >
                          {app?.exhibitor_type ?? '—'}
                        </span>
                      )}
                    </div>

                    {/* Amount / Balance (desktop) */}
                    <div className="hidden sm:block">
                      <p className="font-medium" style={{ color: '#C4A882' }}>
                        {formatCurrency(inv.amount)}
                      </p>
                      {inv.status !== 'cancelled' && inv.status !== 'paid' && (
                        <p className="text-xs" style={{ color: amountPaid > 0 ? '#4ade80' : '#555' }}>
                          {amountPaid > 0
                            ? `${formatCurrency(amountPaid)} paid · ${formatCurrency(balance)} due`
                            : `${formatCurrency(balance)} due`
                          }
                        </p>
                      )}
                      {inv.status === 'paid' && amountPaid > 0 && (
                        <p className="text-xs" style={{ color: '#4ade80' }}>
                          {formatCurrency(amountPaid)} paid
                        </p>
                      )}
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={inv.status} />
                        {hasPartialPayment && inv.status !== 'paid' && (
                          <span
                            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}
                          >
                            deposit paid
                          </span>
                        )}
                      </div>
                      {inv.paid_at && (
                        <span className="hidden text-xs lg:block" style={{ color: '#555' }}>
                          {new Date(inv.paid_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {(inv.status === 'pending' || inv.status === 'overdue') && (
                        <button
                          onClick={() => openPaymentModal(inv)}
                          disabled={isWorking}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
                          style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
                        >
                          {isWorking ? '...' : 'Record Payment'}
                        </button>
                      )}
                      {inv.status === 'pending' && (
                        <button
                          onClick={() => markOverdue(inv)}
                          disabled={isWorking}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
                          style={{ backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
                        >
                          Overdue
                        </button>
                      )}
                      {(inv.status === 'pending' || inv.status === 'overdue') && (
                        <button
                          onClick={() => markCancelled(inv)}
                          disabled={isWorking}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
                          style={{ backgroundColor: 'transparent', color: '#555', border: '1px solid #2a2a2a' }}
                        >
                          Cancel
                        </button>
                      )}
                      {inv.status === 'paid' && (
                        <span className="text-xs" style={{ color: '#4ade80' }}>Paid in full</span>
                      )}
                      {inv.status === 'cancelled' && (
                        <span className="text-xs" style={{ color: '#555' }}>Cancelled</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Payment Modal */}
      {paymentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setPaymentModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-display text-xl font-bold text-white">Record Payment</h2>
            <p className="mt-1 text-sm" style={{ color: '#999' }}>
              {paymentModal.application?.business_name ?? paymentModal.sponsorship?.sponsor_name}
            </p>

            <div className="mt-5 rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#999' }}>Invoice total</span>
                <span className="font-medium text-white">{formatCurrency(paymentModal.amount)}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span style={{ color: '#999' }}>Previously paid</span>
                <span className="font-medium" style={{ color: '#4ade80' }}>
                  {formatCurrency(paymentModal.amount_paid ?? 0)}
                </span>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2 text-sm" style={{ borderColor: '#2a2a2a' }}>
                <span className="font-semibold" style={{ color: '#C4A882' }}>Balance due</span>
                <span className="font-bold" style={{ color: '#C4A882' }}>
                  {formatCurrency(paymentModal.amount - (paymentModal.amount_paid ?? 0))}
                </span>
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-medium text-white">Payment amount</label>
              <p className="mb-2 text-xs" style={{ color: '#999' }}>
                Minimum deposit: $250
              </p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-white">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  placeholder="250.00"
                  className="w-full rounded-lg py-3 pl-8 pr-4 text-sm text-white outline-none transition-colors"
                  style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                  autoFocus
                />
              </div>
              {/* Quick-fill buttons */}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setPaymentAmount('250')}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
                >
                  $250 Deposit
                </button>
                <button
                  onClick={() => setPaymentAmount(((paymentModal.amount - (paymentModal.amount_paid ?? 0)) / 100).toFixed(2))}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
                >
                  Pay Full Balance
                </button>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setPaymentModal(null)}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors"
                style={{ backgroundColor: 'transparent', color: '#999', border: '1px solid #2a2a2a' }}
              >
                Cancel
              </button>
              <button
                onClick={recordPayment}
                disabled={working === paymentModal.id}
                className="flex-1 rounded-lg py-2.5 text-sm font-bold transition-opacity disabled:opacity-50"
                style={{ backgroundColor: '#8B7355', color: '#fff' }}
              >
                {working === paymentModal.id ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
