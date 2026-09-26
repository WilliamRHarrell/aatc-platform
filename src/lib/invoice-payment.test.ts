import { describe, expect, it } from 'vitest'
import { paymentUpdate, nextPaymentMinimumCents } from './invoice-payment'

const T1 = '2026-09-26T10:00:00.000Z'
const T2 = '2026-09-27T10:00:00.000Z'

describe('paymentUpdate', () => {
  it('first payment at the 25% boundary sets deposit_paid_at, not final', () => {
    const r = paymentUpdate({ amount: 100000, amount_paid: 0, deposit_paid_at: null, final_paid_at: null }, 25000, T1, 'square', null)
    expect(r.ok && r.update).toEqual({ amount_paid: 25000, payment_method: 'square', payment_reference: null, deposit_paid_at: T1 })
  })

  it('one cent under the 25% boundary does not set deposit_paid_at', () => {
    const r = paymentUpdate({ amount: 100000, amount_paid: 0, deposit_paid_at: null, final_paid_at: null }, 24999, T1, 'cash', null)
    expect(r.ok && 'deposit_paid_at' in r.update).toBe(false)
  })

  it('a second payment leaves an existing deposit_paid_at alone (the overwrite bug)', () => {
    const r = paymentUpdate({ amount: 100000, amount_paid: 25000, deposit_paid_at: T1, final_paid_at: null }, 10000, T2, 'cash', null)
    expect(r.ok && r.update).toEqual({ amount_paid: 35000, payment_method: 'cash', payment_reference: null })
  })

  it('the paying-off payment sets final_paid_at, status and paid_at once', () => {
    const r = paymentUpdate({ amount: 100000, amount_paid: 25000, deposit_paid_at: T1, final_paid_at: null }, 75000, T2, 'check', 'chq 101')
    expect(r.ok && r.update).toEqual({ amount_paid: 100000, payment_method: 'check', payment_reference: 'chq 101', final_paid_at: T2, status: 'paid', paid_at: T2 })
    expect(r.ok && r.fullyPaid).toBe(true)
  })

  it('refuses more than the balance, and zero or fractional cents', () => {
    const inv = { amount: 100000, amount_paid: 90000, deposit_paid_at: T1, final_paid_at: null }
    expect(paymentUpdate(inv, 10001, T2, 'cash', null).ok).toBe(false)
    expect(paymentUpdate(inv, 10000, T2, 'cash', null).ok).toBe(true)
    expect(paymentUpdate(inv, 0, T2, 'cash', null).ok).toBe(false)
    expect(paymentUpdate(inv, 1.5, T2, 'cash', null).ok).toBe(false)
  })
})

describe('nextPaymentMinimumCents', () => {
  it('booth invoice: 25% until the deposit is recorded, then $1', () => {
    expect(nextPaymentMinimumCents({ amount: 100000, deposit_paid_at: null, sponsorship_id: null })).toBe(25000)
    expect(nextPaymentMinimumCents({ amount: 100000, deposit_paid_at: T1, sponsorship_id: null })).toBe(100)
  })
  it('sponsor invoice: never a 25% minimum', () => {
    expect(nextPaymentMinimumCents({ amount: 750000, deposit_paid_at: null, sponsorship_id: 's' })).toBe(100)
  })
})
