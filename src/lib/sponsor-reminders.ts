import { daysBetween } from '@/lib/date-only'

/**
 * Which due-date reminder a sponsor invoice is owed today, if any (081).
 *
 * Reminders only. A sponsorship is never expired or cancelled for being late,
 * and nothing is sent after the due date. Each stage is sent at most once
 * (its *_sent_at column), and a missed cron day catches up: the 30-day
 * reminder goes out any day from 30 down to 8 days before; the 7-day one any
 * day from 7 down to the due date. Once the 7-day window opens an unsent
 * 30-day reminder is skipped - two emails in a row would say the same thing.
 */
export type ReminderStage = 30 | 7

export interface SponsorInvoiceForReminder {
  due_date: string | null
  amount: number
  amount_paid: number | null
  status: string
  due_reminder_30_sent_at: string | null
  due_reminder_7_sent_at: string | null
}

export function reminderStage(inv: SponsorInvoiceForReminder, today: string): ReminderStage | null {
  if (!inv.due_date) return null
  if (inv.status === 'paid' || inv.status === 'cancelled') return null
  if (inv.amount - (inv.amount_paid ?? 0) <= 0) return null
  const days = daysBetween(today, inv.due_date)
  if (days < 0) return null
  if (days <= 7) return inv.due_reminder_7_sent_at ? null : 7
  if (days <= 30) return inv.due_reminder_30_sent_at ? null : 30
  return null
}
