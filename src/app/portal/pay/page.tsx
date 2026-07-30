'use client'

import { useEffect, useState, Suspense } from 'react'
import { FINAL_DUE_LABEL } from '@/lib/event-config'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { minDepositCents } from '@/lib/pricing'
import toast from 'react-hot-toast'

interface InvoiceData {
  id: string
  amount: number
  amount_paid: number
  status: string
  deposit_paid_at: string | null
  final_paid_at: string | null
  application_id: string | null
  sponsorship_id: string | null
}

function PayContent() {
  const search = useSearchParams()
  const supabase = createClient()
  const invoiceId = search.get('invoice')

  const [invoice, setInvoice] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [amountInput, setAmountInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!invoiceId) { setLoading(false); return }
    supabase
      .from('invoices')
      .select('id, amount, amount_paid, status, deposit_paid_at, final_paid_at, application_id, sponsorship_id')
      .eq('id', invoiceId)
      .single()
      .then(({ data }) => {
        if (data) {
          setInvoice(data)
          const balance = data.amount - (data.amount_paid ?? 0)
          setAmountInput((balance / 100).toFixed(2))
        }
        setLoading(false)
      })
  }, [invoiceId, supabase])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm" style={{ color: '#999' }}>Invoice not found.</p>
        <Link href="/portal" className="mt-4 inline-block text-sm font-semibold" style={{ color: '#8B7355' }}>← Back to portal</Link>
      </div>
    )
  }

  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-lg font-semibold text-white">This invoice is {invoice.status}.</p>
        <Link href="/portal" className="mt-4 inline-block text-sm font-semibold" style={{ color: '#8B7355' }}>← Back to portal</Link>
      </div>
    )
  }

  const balance = invoice.amount - invoice.amount_paid
  const isFirstPayment = !invoice.deposit_paid_at
  const minimumCents = isFirstPayment ? minDepositCents(invoice.amount) : 100
  const amountCents = Math.round(parseFloat(amountInput || '0') * 100)
  const valid = amountCents >= minimumCents && amountCents <= balance

  const handlePay = async () => {
    if (!valid) {
      toast.error(
        isFirstPayment
          ? `First payment must be at least ${formatCurrency(minimumCents)}`
          : `Payment must be between $0.01 and ${formatCurrency(balance)}`,
      )
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: invoice.id, amount: amountCents }),
    })
    const json = await res.json()
    if (json.url) {
      window.location.href = json.url
      return
    }
    toast.error(json.error ?? 'Failed to start checkout')
    setSubmitting(false)
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <div>
        <Link href="/portal" className="text-sm font-semibold" style={{ color: '#8B7355' }}>← Back to portal</Link>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <h1 className="font-display mb-4 text-2xl font-bold text-white">Make a payment</h1>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span style={{ color: '#999' }}>Total invoiced</span>
            <span className="text-white">{formatCurrency(invoice.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: '#999' }}>Already paid</span>
            <span className="text-white">{formatCurrency(invoice.amount_paid)}</span>
          </div>
          <div className="flex justify-between border-t pt-2" style={{ borderColor: '#2a2a2a' }}>
            <span className="font-semibold text-white">Balance due</span>
            <span className="font-semibold" style={{ color: '#C4A882' }}>{formatCurrency(balance)}</span>
          </div>
        </div>

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium text-white" htmlFor="amount">Amount to pay</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#999' }}>$</span>
            <input
              id="amount"
              type="number"
              min={(minimumCents / 100).toFixed(2)}
              max={(balance / 100).toFixed(2)}
              step="0.01"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              className="w-full rounded-lg pl-7 pr-4 py-3 text-sm text-white outline-none"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
            />
          </div>
          <p className="mt-1 text-xs" style={{ color: '#999' }}>
            {isFirstPayment
              ? `Minimum first payment: ${formatCurrency(minimumCents)} (25%). Remaining balance is due by ${FINAL_DUE_LABEL}.`
              : `Pay any amount up to ${formatCurrency(balance)}.`}
          </p>
        </div>

        <button
          type="button"
          onClick={handlePay}
          disabled={!valid || submitting}
          className="mt-6 w-full rounded-lg py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: '#8B7355' }}
        >
          {submitting ? 'Starting checkout…' : `Pay ${valid ? formatCurrency(amountCents) : ''}`}
        </button>
      </div>
    </div>
  )
}

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
        </div>
      }
    >
      <PayContent />
    </Suspense>
  )
}
