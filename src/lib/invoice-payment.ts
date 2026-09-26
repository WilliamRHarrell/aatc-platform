import { minDepositCents } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'

/**
 * A manual payment recorded in /admin/invoices, as a column update.
 *
 * The milestone columns fire AT MOST ONCE. They must be read from the
 * database row, never from a list loaded earlier: /admin/invoices once
 * selected neither column, so every payment saw them as empty and a second
 * payment overwrote the first one's deposit_paid_at / final_paid_at. The
 * caller passes a row it has just re-read, and writes conditionally on
 * amount_paid being unchanged, so a stale screen or a concurrent Stripe
 * payment cannot overwrite it either.
 *
 * Keys are only present when they change: an absent deposit_paid_at means
 * "leave it", not "clear it".
 */
export interface InvoicePaymentState {
  amount: number
  amount_paid: number | null
  deposit_paid_at: string | null
  final_paid_at: string | null
}

export type PaymentUpdate =
  | { ok: true; newAmountPaid: number; fullyPaid: boolean; update: Record<string, unknown> }
  | { ok: false; error: string }

export function paymentUpdate(
  inv: InvoicePaymentState,
  cents: number,
  nowIso: string,
  method: string,
  reference: string | null,
): PaymentUpdate {
  if (!Number.isInteger(cents) || cents <= 0) return { ok: false, error: 'Enter a valid payment amount' }
  const paid = inv.amount_paid ?? 0
  const balance = inv.amount - paid
  if (cents > balance) return { ok: false, error: `Payment cannot exceed the balance of ${formatCurrency(balance)}` }

  const newAmountPaid = paid + cents
  const fullyPaid = newAmountPaid >= inv.amount
  const update: Record<string, unknown> = {
    amount_paid: newAmountPaid,
    payment_method: method,
    payment_reference: reference,
  }
  if (!inv.deposit_paid_at && newAmountPaid >= minDepositCents(inv.amount)) update.deposit_paid_at = nowIso
  if (!inv.final_paid_at && fullyPaid) update.final_paid_at = nowIso
  if (fullyPaid) {
    update.status = 'paid'
    update.paid_at = nowIso
  }
  return { ok: true, newAmountPaid, fullyPaid, update }
}
