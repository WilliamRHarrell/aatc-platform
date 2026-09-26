/**
 * One ACTIVE booth application per user per event (migration 079's partial
 * unique index is the guarantee; this is the friendly side of it).
 */
export const ACTIVE_STATUSES = ['pending', 'approved', 'waitlisted'] as const

export const DUPLICATE_MESSAGE =
  'You already have a booth application for this event. Open your portal to see its status, or contact us to change it.'

/** True when a 23505 from the insert is the one-active-application index. */
export function isDuplicateApplicationError(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.code === '23505' || /applications_one_active_per_user_event/.test(err.message ?? ''))
}
