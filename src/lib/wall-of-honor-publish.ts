/**
 * Wall of Honor publishing (migration 105) - the pure rules the admin publish
 * action and the public wall share.
 */

/**
 * An entry goes on the wall only once approved, with a branch filled in
 * (migration 106: imported rows land with branch '' and cannot publish until
 * it is set) and at least one photo. Reasons are root-cause-first.
 */
export function canPublish(e: { status: string; branch: string; photo_paths: string[] }): { ok: true } | { ok: false; reason: string } {
  if (e.status === 'rejected') return { ok: false, reason: 'Rejected tributes cannot be published' }
  if (e.status !== 'approved') return { ok: false, reason: 'Approve the tribute first' }
  if (e.branch.trim() === '') return { ok: false, reason: 'Fill in the branch first.' }
  if (e.photo_paths.length < 1) return { ok: false, reason: 'Add at least one photo' }
  return { ok: true }
}

/**
 * The "now on the Wall" email goes once, to the family who submitted online.
 * Imported WordPress tributes never get it, and neither does an entry whose
 * email already went or that has no address.
 */
export function shouldSendPublishEmail(e: {
  imported_at: string | null
  published_email_sent_at: string | null
  submitter_email: string
}): boolean {
  return e.imported_at === null && e.published_email_sent_at === null && e.submitter_email !== ''
}
