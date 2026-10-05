import { describe, it, expect } from 'vitest'
import { truckInvoiceRepriceable } from '@/lib/food-truck-invoice'

describe('food truck invoice re-price guard', () => {
  it('re-prices a plain pending, unpaid invoice', () => {
    expect(truckInvoiceRepriceable({ status: 'pending', amount_paid: 0, payment_reference: null })).toBe(true)
  })
  it('never an imported Square invoice, even unpaid (California Taco)', () => {
    expect(truckInvoiceRepriceable({ status: 'pending', amount_paid: 0, payment_reference: 'Square #13727 · unpaid at import' })).toBe(false)
  })
  it('never once a payment is recorded, or when not pending', () => {
    expect(truckInvoiceRepriceable({ status: 'pending', amount_paid: 6250, payment_reference: null })).toBe(false)
    expect(truckInvoiceRepriceable({ status: 'paid', amount_paid: 0, payment_reference: null })).toBe(false)
  })
})
