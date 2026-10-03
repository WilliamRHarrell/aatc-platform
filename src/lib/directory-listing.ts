/**
 * Whether an application is in the public directory, and why. Mirrors the
 * database rule (applications_public view and booth_publicly_visible(),
 * migrations 032/075): approved, roster complete (needs_roster = false), and a
 * recorded deposit OR the admin override directory_override. The override
 * waives the payment condition only.
 */
export function directoryListing(
  app: { status: string; needs_roster: boolean; directory_override: boolean },
  depositPaid: boolean,
): { listed: boolean; reason: string } {
  if (app.status !== 'approved') return { listed: false, reason: 'Not listed: the application is not approved.' }
  if (app.needs_roster) return { listed: false, reason: 'Not listed: the artist roster is not complete.' }
  if (depositPaid) return { listed: true, reason: 'Listed: deposit paid.' }
  if (app.directory_override) return { listed: true, reason: 'Listed before deposit (override on).' }
  return { listed: false, reason: 'Not listed: no deposit recorded yet.' }
}
