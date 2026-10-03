/**
 * Comp flow helpers - the pure half of "a comped booth owes $0".
 *
 * Comped is ONE fact: applications.comped_at is set (migration 072). Money
 * lives on the invoice. total_amount stays the list price. These helpers are
 * what the drawer, the sweep and Assign Booth call so the rules have one home.
 */
import { calculatePricing, type AddOn } from '@/lib/pricing'

const DAY_MS = 24 * 60 * 60 * 1000

export function isComped(app: { comped_at: string | null }): boolean {
  return !!app.comped_at
}

/**
 * The comp split (migration 089, Ryan 2026-10-02). comped_at is COMP BOOTH
 * (booth fees waived); permits_comped_at is COMP PERMITS (artist permit fees
 * waived). Each is set separately, through set_comp(), which re-prices the
 * invoice. These mirror its arithmetic for the drawer and the emails.
 */
export interface CompPricingApp {
  comped_at: string | null
  permits_comped_at?: string | null
  total_amount?: number
  exhibitor_type?: string
  artist_single_qty?: number
  artist_double_qty?: number
  vendor_single_qty?: number
  vendor_double_qty?: number
  corner_count?: number
  artist_count?: number
  is_veteran?: boolean
  add_ons?: unknown
}

/** Artist permit fees on this application (2 per single / 4 per double cap): calculatePricing's permit line. */
export function permitFeesFor(app: CompPricingApp): number {
  if (app.exhibitor_type !== 'artist' || !app.artist_count) return 0
  return calculatePricing({
    exhibitorType: 'artist',
    artistSingleQty: app.artist_single_qty ?? 0,
    artistDoubleQty: app.artist_double_qty ?? 0,
    vendorSingleQty: app.vendor_single_qty ?? 0,
    vendorDoubleQty: app.vendor_double_qty ?? 0,
    cornerCount: app.corner_count ?? 0,
    artistCount: app.artist_count ?? 0,
    isVeteran: !!app.is_veteran,
    addOns: Array.isArray(app.add_ons) ? (app.add_ons as AddOn[]) : [],
  }).permitFees
}

/** What set_comp() leaves on the invoice: booth part unless booth comped, plus permits unless permits comped. */
export function compInvoiceAmount(app: CompPricingApp): number {
  const permits = permitFeesFor(app)
  const booth = app.comped_at ? 0 : Math.max(0, (app.total_amount ?? 0) - permits)
  return booth + (app.permits_comped_at ? 0 : permits)
}

/** Any comp set. */
export function hasAnyComp(app: CompPricingApp): boolean {
  return !!app.comped_at || !!app.permits_comped_at
}

/** A comp that leaves nothing to pay: no due dates, the "no balance due" emails. */
export function owesNothing(app: CompPricingApp): boolean {
  return hasAnyComp(app) && compInvoiceAmount(app) === 0
}

export type ApprovePayload = {
  status: 'approved'
  approved_at: string
  deposit_due_at?: string
  final_due_at?: string
}

/** What Approve writes. A comped application gets no due dates, ever. */
export function approvePayload(app: CompPricingApp, now: Date, finalDueAt: string): ApprovePayload {
  const base: ApprovePayload = { status: 'approved', approved_at: now.toISOString() }
  // Only a comp that leaves $0 skips due dates. A booth comp that still owes
  // permits follows the normal billing rules (Ryan, 2026-10-03).
  if (owesNothing(app)) return base
  return { ...base, deposit_due_at: new Date(now.getTime() + 30 * DAY_MS).toISOString(), final_due_at: finalDueAt }
}

/** Send back to pending clears everything an approval set. The invoice is untouched. */
export const SEND_BACK_PAYLOAD = {
  status: 'pending',
  approved_at: null,
  deposit_due_at: null,
  final_due_at: null,
} as const

/** The lifecycle sweep's row predicate; the queries carry the same guard. */
export function sweepEligible(app: { status: string; comped_at: string | null }): boolean {
  return app.status === 'approved' && !isComped(app)
}

/**
 * Remove comp on an approved application restores a deposit deadline: the
 * later of approved_at + 30 days and now + 14 days, so a restored comp never
 * lands already overdue (Ryan, 2026-09-24).
 */
export function restoredDepositDueAt(approvedAt: string, now: Date): string {
  const fromApproval = new Date(approvedAt).getTime() + 30 * DAY_MS
  const floor = now.getTime() + 14 * DAY_MS
  return new Date(Math.max(fromApproval, floor)).toISOString()
}

export type ExclusionReason = 'no_invoice' | 'deposit_not_recorded'
type InvoiceJoin = Array<{ deposit_paid_at: string | null }> | { deposit_paid_at: string | null } | null

/** Assign Booth: who can be placed, and why each of the others cannot. A comped booth counts as secured (089). */
export function partitionAssignable<T extends { invoices: InvoiceJoin; comped_at?: string | null }>(apps: T[]): { assignable: T[]; excluded: Array<{ app: T; reason: ExclusionReason }> } {
  const assignable: T[] = []
  const excluded: Array<{ app: T; reason: ExclusionReason }> = []
  for (const app of apps) {
    if (app.comped_at) { assignable.push(app); continue }
    const list = app.invoices == null ? [] : Array.isArray(app.invoices) ? app.invoices : [app.invoices]
    if (list.length === 0) { excluded.push({ app, reason: 'no_invoice' }); continue }
    if (list.some(i => i.deposit_paid_at)) assignable.push(app)
    else excluded.push({ app, reason: 'deposit_not_recorded' })
  }
  return { assignable, excluded }
}

const REASON_TEXT: Record<ExclusionReason, [singular: string, plural: string]> = {
  deposit_not_recorded: ['has no deposit recorded', 'have no deposit recorded'],
  no_invoice: ['has no invoice', 'have no invoice'],
}

export function describeExclusions(excluded: Array<{ reason: ExclusionReason }>): string {
  const counts = new Map<ExclusionReason, number>()
  for (const e of excluded) counts.set(e.reason, (counts.get(e.reason) ?? 0) + 1)
  return (Object.keys(REASON_TEXT) as ExclusionReason[])
    .filter(r => counts.has(r))
    .map(r => {
      const n = counts.get(r)!
      return `${n} approved application${n === 1 ? '' : 's'} ${REASON_TEXT[r][n === 1 ? 0 : 1]}`
    })
    .join(' · ')
}

/** Comping an application that already received its approval email owes a comp notice. */
export function compEmailKind(app: { status: string; approved_at: string | null }): 'comp_notice' | null {
  return app.status === 'approved' && !!app.approved_at ? 'comp_notice' : null
}

/**
 * Discount Booth on an application whose invoice already exists (approve,
 * send back, discount, approve). The invoice amount is the discount's only
 * home. Refused once money has moved or the invoice is closed.
 */
export function discountedInvoiceUpdate(
  inv: { amount: number; amount_paid: number; status: string },
  totalAmount: number,
  discountCents: number,
): { amount: number } | { refused: string } {
  if ((inv.amount_paid ?? 0) > 0) return { refused: 'A payment has been recorded on this invoice. Adjust it in Invoices instead.' }
  if (inv.status !== 'pending' && inv.status !== 'overdue') return { refused: `This invoice is ${inv.status} and cannot be re-priced.` }
  return { amount: Math.max(0, totalAmount - discountCents) }
}

/** Above this share of the list price, Approve asks for a second click (Ryan, 2026-10-02). */
export const LARGE_DISCOUNT_SHARE = 0.5

/**
 * What Approve will invoice, for the summary shown before the click and the
 * large-discount confirmation. The invoice is never below $0; a discount at or
 * above the list price produces a $0 invoice, which is what Comp is for.
 */
export function discountSummary(listCents: number, discountCents: number): {
  invoiceCents: number
  discountCents: number
  /** Share of the list price taken off, 0..1 (1 when the list price is 0 and a discount is entered). */
  share: number
  needsConfirm: boolean
} {
  const d = Math.max(0, discountCents)
  const invoiceCents = Math.max(0, listCents - d)
  const share = listCents > 0 ? Math.min(1, d / listCents) : d > 0 ? 1 : 0
  return { invoiceCents, discountCents: d, share, needsConfirm: share > LARGE_DISCOUNT_SHARE }
}
