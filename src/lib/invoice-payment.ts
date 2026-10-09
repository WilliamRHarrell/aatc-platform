import { minDepositCents } from '@/lib/pricing'
import { formatCurrency } from '@/lib/utils'
import { FOOD_TRUCK_DEPOSIT_CENTS } from '@/lib/food-truck-pricing'

/**
 * THE deposit rule (092), in one place. Read by /portal/pay, /api/create-checkout,
 * the Stripe webhook and /admin/invoices (paymentUpdate).
 *
 * invoices.deposit_rule:
 *   'percent_25'      - 25% of the total (minDepositCents). Every booth and
 *                       sponsor invoice, and every food-truck invoice created
 *                       before 092 (the 3 Square imports keep their terms).
 *   'food_truck_flat' - FOOD_TRUCK_DEPOSIT_CENTS, or the whole total when it is
 *                       less (Ryan, 2026-10-07). Food-truck invoices created by
 *                       approval or admin Add from 092 on.
 * A row read without the column (deposit_rule undefined) is treated as 25%.
 */
export interface DepositFacts {
  amount: number
  deposit_rule?: string | null
}

export function depositCents(inv: DepositFacts): number {
  if (inv.deposit_rule === 'food_truck_flat') return Math.min(FOOD_TRUCK_DEPOSIT_CENTS, inv.amount)
  return minDepositCents(inv.amount)
}

/** How the first payment's minimum is explained, e.g. "25% of $250" or "the $100 deposit". */
export function depositRuleLabel(inv: DepositFacts): string {
  return inv.deposit_rule === 'food_truck_flat'
    ? (depositCents(inv) < inv.amount ? `the ${formatCurrency(depositCents(inv))} deposit` : 'the full amount')
    : `25% of ${formatCurrency(inv.amount)}`
}

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
  deposit_rule?: string | null
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
  if (!inv.deposit_paid_at && newAmountPaid >= depositCents(inv)) update.deposit_paid_at = nowIso
  if (!inv.final_paid_at && fullyPaid) update.final_paid_at = nowIso
  if (fullyPaid) {
    update.status = 'paid'
    update.paid_at = nowIso
  }
  return { ok: true, newAmountPaid, fullyPaid, update }
}

/**
 * The smallest amount the portal accepts for the NEXT payment, in cents.
 * Booth and food-truck invoices: the first payment must reach the deposit
 * (depositCents: 25%, or the food-truck flat deposit) until deposit_paid_at
 * is set; after that, $1.
 * Sponsor invoices: $1 always. Sponsors pay on negotiated terms with no
 * deposit requirement (2026-09-26); their balance is due on the invoice's
 * due_date. Read by /portal/pay (form validation) and /api/create-checkout
 * (the check that matters).
 */
export function nextPaymentMinimumCents(inv: DepositFacts & { deposit_paid_at: string | null; sponsorship_id: string | null }): number {
  if (inv.sponsorship_id) return 100
  return inv.deposit_paid_at ? 100 : depositCents(inv)
}

/**
 * A NEW invoice that already carries a payment (admin "Add A Booth" records
 * the deposit taken in person). The milestones follow the same rules as
 * paymentUpdate: deposit_paid_at once the deposit is reached, final_paid_at
 * and paid when the whole amount is. Before 2026-10-09 Add A Booth wrote
 * neither milestone, so a paid booth was left out of Assign Booth and the
 * public directory (both key on deposit_paid_at).
 */
export function newInvoicePayment(inv: DepositFacts, paidCents: number, nowIso: string) {
  const amount_paid = Math.max(0, Math.min(Math.round(paidCents), inv.amount))
  const fullyPaid = amount_paid >= inv.amount
  return {
    amount_paid,
    status: fullyPaid ? ('paid' as const) : ('pending' as const),
    paid_at: fullyPaid ? nowIso : null,
    deposit_paid_at: amount_paid > 0 && amount_paid >= depositCents(inv) ? nowIso : null,
    final_paid_at: fullyPaid ? nowIso : null,
  }
}
