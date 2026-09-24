import { describe, it, expect } from 'vitest'
import {
  isComped, approvePayload, SEND_BACK_PAYLOAD, sweepEligible, partitionAssignable, describeExclusions,
  compEmailKind, restoredDepositDueAt, discountedInvoiceUpdate,
} from '@/lib/comp'

const NOW = new Date('2026-09-24T12:00:00Z')
const FINAL = '2027-01-01T05:00:00+00:00'

describe('isComped', () => {
  it('is the one fact: comped_at set', () => {
    expect(isComped({ comped_at: '2026-09-24T00:00:00Z' })).toBe(true)
    expect(isComped({ comped_at: null })).toBe(false)
  })
})

describe('approvePayload', () => {
  it('prices an ordinary approval: approved_at now, deposit in 30 days, fixed final date', () => {
    const p = approvePayload({ comped_at: null }, NOW, FINAL)
    expect(p).toEqual({
      status: 'approved',
      approved_at: NOW.toISOString(),
      deposit_due_at: new Date('2026-10-24T12:00:00Z').toISOString(),
      final_due_at: FINAL,
    })
  })
  it('a comped approval sets NO due dates', () => {
    const p = approvePayload({ comped_at: '2026-09-24T00:00:00Z' }, NOW, FINAL)
    expect(p).toEqual({ status: 'approved', approved_at: NOW.toISOString() })
    expect('deposit_due_at' in p).toBe(false)
    expect('final_due_at' in p).toBe(false)
  })
})

describe('the four sequences, as the payloads each step writes', () => {
  const comped = { comped_at: '2026-09-24T00:00:00Z' }
  it('comp before approve: the approval carries no dates', () => {
    expect(approvePayload(comped, NOW, FINAL)).not.toHaveProperty('deposit_due_at')
  })
  it('comp after approve: the comp RPC nulls the dates (see verify_072); a later re-approval keeps them null', () => {
    expect(approvePayload(comped, NOW, FINAL)).not.toHaveProperty('deposit_due_at')
  })
  it('approve, send back, comp, approve: send back clears everything the first approval set', () => {
    const first = approvePayload({ comped_at: null }, NOW, FINAL)
    expect(first).toHaveProperty('deposit_due_at')
    expect(SEND_BACK_PAYLOAD).toEqual({ status: 'pending', approved_at: null, deposit_due_at: null, final_due_at: null })
    const second = approvePayload(comped, new Date('2026-09-25T12:00:00Z'), FINAL)
    expect(second).toEqual({ status: 'approved', approved_at: '2026-09-25T12:00:00.000Z' })
  })
  it('remove comp after approve: dates are restored from approved_at, never in the past', () => {
    expect(restoredDepositDueAt('2026-09-24T12:00:00Z', NOW)).toBe(new Date('2026-10-24T12:00:00Z').toISOString())
  })
})

describe('restoredDepositDueAt', () => {
  it('uses approved_at + 30 days when that is still at least 14 days out', () => {
    expect(restoredDepositDueAt('2026-09-20T00:00:00Z', NOW)).toBe('2026-10-20T00:00:00.000Z')
  })
  it('an approval older than 30 days gets now + 14 days instead of an already-overdue date', () => {
    expect(restoredDepositDueAt('2026-07-01T00:00:00Z', NOW)).toBe('2026-10-08T12:00:00.000Z')
  })
  it('the boundary: exactly 14 days out stays on approved_at + 30 days', () => {
    // approved_at + 30 d == now + 14 d
    expect(restoredDepositDueAt('2026-08-25T12:00:00Z', NOW)).toBe('2026-10-08T12:00:00.000Z')
  })
})

describe('sweepEligible', () => {
  it('approved and not comped', () => {
    expect(sweepEligible({ status: 'approved', comped_at: null })).toBe(true)
  })
  it('comped applications are never swept, whatever their milestones say', () => {
    expect(sweepEligible({ status: 'approved', comped_at: '2026-09-24T00:00:00Z' })).toBe(false)
  })
  it('only approved applications are swept', () => {
    expect(sweepEligible({ status: 'pending', comped_at: null })).toBe(false)
  })
})

describe('partitionAssignable', () => {
  const paid = { id: 'a', invoices: [{ deposit_paid_at: '2026-09-01T00:00:00Z' }] }
  const unpaid = { id: 'b', invoices: [{ deposit_paid_at: null }] }
  const none = { id: 'c', invoices: [] as Array<{ deposit_paid_at: string | null }> }
  const single = { id: 'd', invoices: { deposit_paid_at: '2026-09-02T00:00:00Z' } }
  it('splits by deposit recorded and names the reason', () => {
    const r = partitionAssignable([paid, unpaid, none, single])
    expect(r.assignable.map(a => a.id)).toEqual(['a', 'd'])
    expect(r.excluded).toEqual([{ app: unpaid, reason: 'deposit_not_recorded' }, { app: none, reason: 'no_invoice' }])
  })
  it('a null join is no invoice', () => {
    const r = partitionAssignable([{ id: 'e', invoices: null }])
    expect(r.excluded[0].reason).toBe('no_invoice')
  })
})

describe('describeExclusions', () => {
  it('reads as a sentence, singular and plural', () => {
    expect(describeExclusions([{ reason: 'deposit_not_recorded' }])).toBe('1 approved application has no deposit recorded')
    expect(describeExclusions([{ reason: 'deposit_not_recorded' }, { reason: 'deposit_not_recorded' }, { reason: 'no_invoice' }]))
      .toBe('2 approved applications have no deposit recorded · 1 approved application has no invoice')
  })
  it('is empty when nothing is excluded', () => {
    expect(describeExclusions([])).toBe('')
  })
})

describe('compEmailKind', () => {
  it('an already-approved application gets the comp notice', () => {
    expect(compEmailKind({ status: 'approved', approved_at: '2026-09-24T00:00:00Z' })).toBe('comp_notice')
  })
  it('a pending application gets nothing extra (the comped approval covers it)', () => {
    expect(compEmailKind({ status: 'pending', approved_at: null })).toBe(null)
  })
})

describe('discountedInvoiceUpdate', () => {
  const unpaid = { amount: 60000, amount_paid: 0, status: 'pending' }
  it('approve, send back, discount, approve: the existing unpaid invoice is re-priced', () => {
    expect(discountedInvoiceUpdate(unpaid, 60000, 15000)).toEqual({ amount: 45000 })
  })
  it('never below zero', () => {
    expect(discountedInvoiceUpdate(unpaid, 60000, 90000)).toEqual({ amount: 0 })
  })
  it('refused once any payment exists', () => {
    expect(discountedInvoiceUpdate({ amount: 60000, amount_paid: 100, status: 'pending' }, 60000, 15000))
      .toEqual({ refused: 'A payment has been recorded on this invoice. Adjust it in Invoices instead.' })
  })
  it('refused on a paid or cancelled invoice', () => {
    expect(discountedInvoiceUpdate({ amount: 0, amount_paid: 0, status: 'paid' }, 60000, 15000)).toHaveProperty('refused')
    expect(discountedInvoiceUpdate({ amount: 60000, amount_paid: 0, status: 'cancelled' }, 60000, 15000)).toHaveProperty('refused')
  })
})
