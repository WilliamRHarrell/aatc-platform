import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paymentUpdate, nextPaymentMinimumCents, depositCents, depositRuleLabel } from './invoice-payment'

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

describe('food truck deposit rule (092)', () => {
  const flat = (amount: number) => ({ amount, deposit_rule: 'food_truck_flat' })
  it('flat: $100, or the whole total when it is $100 or less', () => {
    expect(depositCents(flat(25000))).toBe(10000)
    expect(depositCents(flat(20000))).toBe(10000)
    expect(depositCents(flat(10000))).toBe(10000)
    expect(depositCents(flat(5000))).toBe(5000)
  })
  it('percent_25 and rows read without the column keep 25% (the Square imports)', () => {
    expect(depositCents({ amount: 25000, deposit_rule: 'percent_25' })).toBe(6250)
    expect(depositCents({ amount: 25000 })).toBe(6250)
  })
  it('the portal minimum follows the rule until the deposit is recorded', () => {
    expect(nextPaymentMinimumCents({ ...flat(25000), deposit_paid_at: null, sponsorship_id: null })).toBe(10000)
    expect(nextPaymentMinimumCents({ ...flat(25000), deposit_paid_at: T1, sponsorship_id: null })).toBe(100)
  })
  it('a manual payment of $100 records the deposit on a flat invoice, not on a 25% one', () => {
    const base = { amount_paid: 0, deposit_paid_at: null, final_paid_at: null }
    const f = paymentUpdate({ ...base, ...flat(25000) }, 10000, T1, 'cash', null)
    expect(f.ok && f.update.deposit_paid_at).toBe(T1)
    const p = paymentUpdate({ ...base, amount: 50000, deposit_rule: 'percent_25' }, 10000, T1, 'cash', null)
    expect(p.ok && p.update.deposit_paid_at).toBeUndefined()
  })
  it('labels the rule for the checkout message', () => {
    expect(depositRuleLabel(flat(25000))).toBe('the $100 deposit')
    expect(depositRuleLabel(flat(5000))).toBe('the full amount')
    expect(depositRuleLabel({ amount: 25000 })).toBe('25% of $250')
  })
})

describe('one deposit rule everywhere (092)', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  it('checkout, the webhook and the pay page read deposit_rule and never compute 25% themselves', () => {
    for (const f of ['src/app/api/create-checkout/route.ts', 'src/app/api/webhooks/stripe/route.ts', 'src/app/portal/pay/page.tsx', 'src/app/admin/invoices/page.tsx']) {
      expect(read(f), f).toContain('deposit_rule')
      expect(read(f), f).not.toMatch(/minDepositCents\(/)
    }
  })
  it('both places that create a food-truck invoice give it the flat rule', () => {
    expect(read('src/app/api/admin/food-trucks/decision/route.ts')).toContain("deposit_rule: 'food_truck_flat'")
    expect(read('src/app/admin/food-trucks/page.tsx')).toContain("deposit_rule: 'food_truck_flat'")
  })
})
