import { describe, it, expect } from 'vitest'
import {
  TRUCK_BALANCE_DUE_DATE, truckReminderStage, truckBalancePastDue, truckPaymentState, type TruckInvoiceForReminder,
} from '@/lib/food-truck-reminders'
import { FINAL_DUE_AT } from '@/lib/event-config'

const DUE = '2027-01-01'
const inv = (over: Partial<TruckInvoiceForReminder> = {}): TruckInvoiceForReminder => ({
  amount: 25000, amount_paid: 10000, status: 'pending',
  due_reminder_30_sent_at: null, due_reminder_14_sent_at: null, due_reminder_7_sent_at: null, due_reminder_1_sent_at: null,
  ...over,
})

describe('the due date', () => {
  it('is FINAL_DUE_AT as an Eastern calendar date', () => {
    expect(FINAL_DUE_AT).toBe('2027-01-01T05:00:00Z')
    expect(TRUCK_BALANCE_DUE_DATE).toBe(DUE)
  })
})

describe('truckReminderStage', () => {
  it('30, 14, 7 and 1 days before, each in its own window', () => {
    expect(truckReminderStage(inv(), '2026-12-01', DUE)).toBeNull() // 31 days
    expect(truckReminderStage(inv(), '2026-12-02', DUE)).toBe(30)
    expect(truckReminderStage(inv(), '2026-12-17', DUE)).toBe(30) // 15 days
    expect(truckReminderStage(inv(), '2026-12-18', DUE)).toBe(14)
    expect(truckReminderStage(inv(), '2026-12-25', DUE)).toBe(7)
    expect(truckReminderStage(inv(), '2026-12-31', DUE)).toBe(1)
    expect(truckReminderStage(inv(), '2027-01-01', DUE)).toBe(1) // the due date catches up the 1-day
    expect(truckReminderStage(inv(), '2027-01-02', DUE)).toBeNull() // nothing after it
  })
  it('each stage once; a missed stage is skipped, not sent late', () => {
    expect(truckReminderStage(inv({ due_reminder_14_sent_at: 'x' }), '2026-12-20', DUE)).toBeNull()
    // 30 never sent, but the 14-day window is open: only the 14 goes
    expect(truckReminderStage(inv(), '2026-12-20', DUE)).toBe(14)
  })
  it('nothing for a paid, cancelled or zero-balance invoice', () => {
    expect(truckReminderStage(inv({ status: 'paid' }), '2026-12-25', DUE)).toBeNull()
    expect(truckReminderStage(inv({ status: 'cancelled' }), '2026-12-25', DUE)).toBeNull()
    expect(truckReminderStage(inv({ amount_paid: 25000 }), '2026-12-25', DUE)).toBeNull()
  })
})

describe('after the due date', () => {
  it('past due from the day after (January 2)', () => {
    expect(truckBalancePastDue('2027-01-01', DUE)).toBe(false)
    expect(truckBalancePastDue('2027-01-02', DUE)).toBe(true)
  })
  it('payment state', () => {
    const base = { amount: 25000, amount_paid: 0, status: 'pending', deposit_paid_at: null }
    expect(truckPaymentState(null)).toBe('none')
    expect(truckPaymentState(base)).toBe('nothing_paid')
    expect(truckPaymentState({ ...base, amount_paid: 10000, deposit_paid_at: 'x' })).toBe('deposit_only')
    expect(truckPaymentState({ ...base, amount_paid: 25000, status: 'paid' })).toBe('paid')
    expect(truckPaymentState({ ...base, status: 'cancelled' })).toBe('cancelled')
  })
})
