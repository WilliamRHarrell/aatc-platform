/**
 * Who may submit AATC graphics from /portal/graphics: an exhibitor whose
 * application is APPROVED and whose booth is SECURED - deposit recorded,
 * comped, or directory-overridden. That is the public directory's own rule
 * (032), so a graphic never says "see me at AATC" for a booth that could
 * still expire. Before 2026-09-25 the page checked only "signed in" and the
 * first write failed with an RLS error instead of an explanation.
 */
export type GraphicsEligibility = 'eligible' | 'no-application' | 'not-approved' | 'no-deposit'

export function graphicsEligibility(
  apps: Array<{ id: string; status: string; comped_at: string | null; directory_override: boolean }>,
  invoices: Array<{ application_id: string | null; deposit_paid_at: string | null }>,
): GraphicsEligibility {
  if (apps.length === 0) return 'no-application'
  const approved = apps.filter(a => a.status === 'approved')
  if (approved.length === 0) return 'not-approved'
  const secured = approved.some(a =>
    !!a.comped_at || a.directory_override || invoices.some(i => i.application_id === a.id && !!i.deposit_paid_at))
  return secured ? 'eligible' : 'no-deposit'
}

export const ELIGIBILITY_COPY: Record<Exclude<GraphicsEligibility, 'eligible'>, string> = {
  'no-application': 'Submit Graphics is for exhibitors with a booth. Apply for a booth first, then come back here once it is confirmed.',
  'not-approved': 'Your booth application is still being reviewed. Submit Graphics opens once it is approved and your deposit is recorded.',
  'no-deposit': 'Your booth is approved. Submit Graphics opens once your deposit is recorded (or your booth is comped), so a graphic never promises a booth that is not yet secured.',
}
