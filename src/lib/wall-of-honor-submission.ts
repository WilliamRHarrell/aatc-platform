/**
 * Wall of Honor online submissions (migration 104) - the pure rules the
 * submission route enforces. Families send a tribute and up to three photos.
 *
 * Files never pass through the route (Vercel caps a request body at about
 * 4.5 MB). The form posts a manifest of the files it will send; the route
 * checks it here and answers with one signed upload URL per file, into the
 * entry's folder in the PRIVATE wall-of-honor-submissions bucket. Approved
 * photos are later copied to the public wall-of-honor bucket.
 */

/** Guard and Reserve members are listed under their branch. "Other" asks for text. */
export const BRANCHES = ['Army', 'Marine Corps', 'Navy', 'Air Force', 'Space Force', 'Coast Guard'] as const
export const BRANCH_OTHER = 'Other'

export const RELATIONSHIPS = ['Parent', 'Spouse', 'Child', 'Sibling', 'Other family', 'Friend', 'Fellow service member'] as const
export const RELATIONSHIP_OTHER = 'Other'
const OTHER_MAX = 60

/** A family's words are never shortened for them: over the cap is an error. */
export const TRIBUTE_MAX = 1500

export const WOH_PHOTO_MIN_COUNT = 1
export const WOH_PHOTO_MAX_COUNT = 3
/** Exactly the private bucket's limit (104). */
export const WOH_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const WOH_IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const WOH_IMAGE_ACCEPT = Object.keys(WOH_IMAGE_TYPES).join(',')

export const WOH_SUBMISSIONS_BUCKET = 'wall-of-honor-submissions'
export const WOH_PUBLIC_BUCKET = 'wall-of-honor'

export interface WallOfHonorValues {
  honoree_name: string
  honoree_rank: string | null
  branch: string
  unit: string | null
  service_years: string | null
  tribute: string
  submitter_name: string
  submitter_relationship: string
  submitter_email: string
  submitter_phone: string | null
  consent_social: boolean
  photos: { ext: string; contentType: string }[]
}

export type WallOfHonorValidation =
  | { ok: true; values: WallOfHonorValues }
  | { ok: false; fieldErrors: Record<string, string> }

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** A pick-list value, or "Other" with its typed text. Returns '' and records the error when invalid. */
function pick(
  raw: unknown, otherRaw: unknown, list: readonly string[], other: string,
  key: string, otherKey: string, missing: string, otherMissing: string, fieldErrors: Record<string, string>,
): string {
  const choice = str(raw)
  if (list.includes(choice)) return choice
  if (choice === other) {
    const typed = str(otherRaw, OTHER_MAX)
    if (!typed) fieldErrors[otherKey] = otherMissing
    return typed
  }
  fieldErrors[key] = missing
  return ''
}

export function validateWallOfHonorSubmission(body: Record<string, unknown>): WallOfHonorValidation {
  const fieldErrors: Record<string, string> = {}

  const honoree_name = str(body.honoreeName)
  if (!honoree_name) fieldErrors.honoreeName = "Please tell us the honoree's name."

  const branch = pick(body.branch, body.branchOther, BRANCHES, BRANCH_OTHER, 'branch', 'branchOther',
    'Please choose a branch of service.', 'Please tell us the branch of service.', fieldErrors)

  // Not str(): the cap would silently slice, which would alter the family's words.
  const tribute = typeof body.tribute === 'string' ? body.tribute.trim() : ''
  if (!tribute) fieldErrors.tribute = 'Please share a tribute.'
  else if (tribute.length > TRIBUTE_MAX) fieldErrors.tribute = `Please keep the tribute to ${TRIBUTE_MAX.toLocaleString('en-US')} characters or fewer (it is ${tribute.length.toLocaleString('en-US')}).`

  const submitter_name = str(body.yourName)
  if (!submitter_name) fieldErrors.yourName = 'Your name is required.'

  const submitter_relationship = pick(body.relationship, body.relationshipOther, RELATIONSHIPS, RELATIONSHIP_OTHER,
    'relationship', 'relationshipOther', 'Please choose your relationship to the honoree.', 'Please tell us your relationship to the honoree.', fieldErrors)

  const submitter_email = str(body.email, 254)
  if (!submitter_email) fieldErrors.email = 'Email is required.'
  else if (!EMAIL.test(submitter_email)) fieldErrors.email = 'That email address does not look right.'

  if (body.consent !== true) fieldErrors.consent = 'Please confirm you have the right to share this tribute and these photos.'

  const manifest = Array.isArray(body.files) ? body.files : []
  const photos: WallOfHonorValues['photos'] = []
  if (manifest.length < WOH_PHOTO_MIN_COUNT) fieldErrors.photos = 'Please attach at least one photo.'
  else if (manifest.length > WOH_PHOTO_MAX_COUNT) fieldErrors.photos = `Please attach up to ${WOH_PHOTO_MAX_COUNT} photos.`
  else {
    for (const f of manifest as { type?: unknown; size?: unknown }[]) {
      const type = String(f?.type)
      const size = Number(f?.size)
      const ext = WOH_IMAGE_TYPES[type]
      if (!ext) { fieldErrors.photos = 'Each photo must be a JPG, PNG or WebP image.'; continue }
      if (!(size > 0) || size > WOH_PHOTO_MAX_BYTES) { fieldErrors.photos = `Each photo must be ${WOH_PHOTO_MAX_BYTES / 1024 / 1024} MB or smaller.`; continue }
      photos.push({ ext, contentType: type })
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return {
    ok: true,
    values: {
      honoree_name,
      honoree_rank: str(body.rank, 100) || null,
      branch,
      unit: str(body.unit) || null,
      service_years: str(body.serviceYears, 100) || null,
      tribute,
      submitter_name,
      submitter_relationship,
      submitter_email,
      submitter_phone: str(body.phone, 40) || null,
      consent_social: body.consentSocial === true,
      photos,
    },
  }
}

/**
 * Where an entry's photo goes: inside the entry's own folder. The index prefix
 * keeps "first photo is main" stable however the uploads race (/files sorts by name).
 */
export function entryPhotoPath(entryId: string, index: number, ext: string, rand: string): string {
  return `${entryId}/photo-${index}-${rand}.${ext}`
}

/** Shortest-side thresholds shared with scripts/import-wall-of-honor.mjs. */
export function photoQuality(minSidePx: number): 'good' | 'usable' | 'low' {
  if (minSidePx >= 1200) return 'good'
  if (minSidePx >= 700) return 'usable'
  return 'low'
}

/** For the admin "possible duplicate" marker: same name and branch, ignoring case and spacing. */
export function duplicateHonoreeKey(name: string, branch: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${norm(name)}|${norm(branch)}`
}
