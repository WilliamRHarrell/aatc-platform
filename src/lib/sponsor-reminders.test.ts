import { describe, expect, it } from 'vitest'
import { reminderStage } from './sponsor-reminders'
import { formatDateOnly, daysBetween, todayEastern } from './date-only'

const inv = (over: Partial<Parameters<typeof reminderStage>[0]> = {}) => ({
  due_date: '2027-01-31', amount: 750000, amount_paid: 75000, status: 'pending',
  due_reminder_30_sent_at: null, due_reminder_7_sent_at: null, ...over,
})

describe('reminderStage', () => {
  it('31 days out: nothing; 30 days out: the 30-day reminder (boundary)', () => {
    expect(reminderStage(inv(), '2026-12-31')).toBeNull()
    expect(reminderStage(inv(), '2027-01-01')).toBe(30)
  })
  it('8 days out: still 30 if unsent (catch-up); 7 days out: the 7-day one (boundary)', () => {
    expect(reminderStage(inv(), '2027-01-23')).toBe(30)
    expect(reminderStage(inv(), '2027-01-24')).toBe(7)
  })
  it('each stage is sent once', () => {
    expect(reminderStage(inv({ due_reminder_30_sent_at: 'x' }), '2027-01-10')).toBeNull()
    expect(reminderStage(inv({ due_reminder_7_sent_at: 'x' }), '2027-01-28')).toBeNull()
  })
  it('the due date itself still gets the 7-day reminder if unsent; the day after gets nothing', () => {
    expect(reminderStage(inv(), '2027-01-31')).toBe(7)
    expect(reminderStage(inv(), '2027-02-01')).toBeNull()
  })
  it('no due date, paid, cancelled, or no balance: never', () => {
    expect(reminderStage(inv({ due_date: null }), '2027-01-28')).toBeNull()
    expect(reminderStage(inv({ status: 'paid' }), '2027-01-28')).toBeNull()
    expect(reminderStage(inv({ status: 'cancelled' }), '2027-01-28')).toBeNull()
    expect(reminderStage(inv({ amount_paid: 750000 }), '2027-01-28')).toBeNull()
  })
})

describe('date-only', () => {
  it('formats a DATE as the same calendar day in any zone (the one-day-early bug)', () => {
    expect(formatDateOnly('2027-01-01')).toBe('Jan 1, 2027')
    expect(formatDateOnly('2027-01-31')).toBe('Jan 31, 2027')
  })
  it('passes through anything that is not YYYY-MM-DD', () => {
    expect(formatDateOnly('TBD')).toBe('TBD')
  })
  it('counts whole days across a year boundary', () => {
    expect(daysBetween('2026-12-31', '2027-01-31')).toBe(31)
  })
  it('today in Eastern: 03:00 UTC on Jan 1 is still Dec 31 in New York', () => {
    expect(todayEastern(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12-31')
  })
})
