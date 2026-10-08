/**
 * Food truck balances and the January 1 deadline (092; Ryan, 2026-10-08).
 * Pure rules; /api/cron/lifecycle-sweep and /admin/food-trucks do the I/O.
 *
 * - Every SELECTED truck with a balance, imports included, is reminded 30,
 *   14, 7 and 1 days before the balance is due. Each stage is sent at most
 *   once (its invoices.due_reminder_*_sent_at column). A missed cron day
 *   catches up with the CURRENT stage only: two emails in a row would say the
 *   same thing. Nothing is sent after the due date.
 * - From the day after the due date, one internal email lists the selected
 *   trucks not paid in full, and admin shows them flagged "Not paid in full".
 * - Nothing is ever cancelled automatically; Release is a manual admin action.
 *
 * The due date is FINAL_DUE_AT (event-config), the same deadline booths have.
 */
import { FINAL_DUE_AT } from '@/lib/event-config'
import { daysBetween, todayEastern } from '@/lib/date-only'

/** FINAL_DUE_AT as an Eastern calendar date, e.g. "2027-01-01". Derived, never restated. */
export const TRUCK_BALANCE_DUE_DATE = todayEastern(new Date(FINAL_DUE_AT))

export const TRUCK_REMINDER_STAGES = [30, 14, 7, 1] as const
export type TruckReminderStage = (typeof TRUCK_REMINDER_STAGES)[number]

export const TRUCK_REMINDER_COLUMN: Record<TruckReminderStage, 'due_reminder_30_sent_at' | 'due_reminder_14_sent_at' | 'due_reminder_7_sent_at' | 'due_reminder_1_sent_at'> = {
  30: 'due_reminder_30_sent_at',
  14: 'due_reminder_14_sent_at',
  7: 'due_reminder_7_sent_at',
  1: 'due_reminder_1_sent_at',
}

export interface TruckInvoiceForReminder {
  amount: number
  amount_paid: number | null
  status: string
  due_reminder_30_sent_at: string | null
  due_reminder_14_sent_at: string | null
  due_reminder_7_sent_at: string | null
  due_reminder_1_sent_at: string | null
}

export const truckBalance = (inv: { amount: number; amount_paid: number | null }) => inv.amount - (inv.amount_paid ?? 0)

/**
 * The reminder owed today, if any. Each stage's window runs from its day down
 * to the next stage: 30 -> 15, 14 -> 8, 7 -> 2, 1 -> the due date itself.
 */
export function truckReminderStage(inv: TruckInvoiceForReminder, today: string, dueDate = TRUCK_BALANCE_DUE_DATE): TruckReminderStage | null {
  if (inv.status === 'paid' || inv.status === 'cancelled') return null
  if (truckBalance(inv) <= 0) return null
  const days = daysBetween(today, dueDate)
  if (days < 0) return null
  const stage = [...TRUCK_REMINDER_STAGES].reverse().find(s => days <= s)
  if (stage === undefined) return null
  return inv[TRUCK_REMINDER_COLUMN[stage]] ? null : stage
}

/** True from the day after the due date (Eastern): the January 2 list and the red flag. */
export function truckBalancePastDue(today: string, dueDate = TRUCK_BALANCE_DUE_DATE): boolean {
  return daysBetween(today, dueDate) < 0
}

export type TruckPaymentState = 'paid' | 'deposit_only' | 'nothing_paid' | 'cancelled' | 'none'

/** Where a selected truck's invoice stands. */
export function truckPaymentState(inv: { amount: number; amount_paid: number | null; status: string; deposit_paid_at: string | null } | null | undefined): TruckPaymentState {
  if (!inv) return 'none'
  if (inv.status === 'cancelled') return 'cancelled'
  if (inv.status === 'paid' || truckBalance(inv) <= 0) return 'paid'
  return inv.deposit_paid_at || (inv.amount_paid ?? 0) > 0 ? 'deposit_only' : 'nothing_paid'
}
