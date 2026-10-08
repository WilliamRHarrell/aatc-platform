/**
 * Food truck application decisions (091; /api/admin/food-trucks/decision).
 * Pure rules; the route does the I/O.
 *
 * pending, waitlisted and not selected trucks can be moved to any other of
 * approved / waitlisted / not_selected. An approved truck has an invoice and
 * (usually) an account, so it is not moved back by these: it can only be
 * Released (092, Ryan 2026-10-08), which unpublishes it, cancels its unpaid
 * invoice and frees its slot. 'released' is final. No email either way.
 */
export const DECISIONS = ['approved', 'waitlisted', 'not_selected'] as const
export type Decision = (typeof DECISIONS)[number]

export const TRUCK_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Selected',
  waitlisted: 'Waitlist',
  not_selected: 'Not selected',
  released: 'Released',
}

export const isDecision = (v: unknown): v is Decision => typeof v === 'string' && (DECISIONS as readonly string[]).includes(v)

export function decisionRefusal(from: string, to: Decision): string | null {
  if (from === to) return `This truck is already ${TRUCK_STATUS_LABELS[to].toLowerCase()}.`
  if (from === 'approved') return 'This truck is already selected and invoiced. It cannot be moved back from here.'
  if (!['pending', 'waitlisted', 'not_selected'].includes(from)) return `A ${TRUCK_STATUS_LABELS[from]?.toLowerCase() ?? from} truck cannot be changed here.`
  return null
}

export function releaseRefusal(from: string): string | null {
  if (from === 'released') return 'This truck is already released.'
  if (from !== 'approved') return 'Only a selected truck can be released.'
  return null
}

/** Which content-editor keys ('foodTruckApply') hold a decision's email. */
export const DECISION_EMAIL_KEYS: Record<Decision, { subject: string; body: string }> = {
  approved: { subject: 'email_selected_subject', body: 'email_selected_body' },
  waitlisted: { subject: 'email_waitlisted_subject', body: 'email_waitlisted_body' },
  not_selected: { subject: 'email_not_selected_subject', body: 'email_not_selected_body' },
}

/** "6 of 8 selected" / "8 of 8 selected (full)". */
export function capLabel(approved: number, cap: number): string {
  return `${approved} of ${cap} selected${approved >= cap ? ' (full)' : ''}`
}

/** Approval is refused at the cap (decision 5); the trigger is the real stop. */
export function capReached(approved: number, cap: number): boolean {
  return approved >= cap
}
