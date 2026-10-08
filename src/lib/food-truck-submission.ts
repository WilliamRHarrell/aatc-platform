/**
 * Public food truck application (/apply/food-truck, migration 091) - the pure
 * rules /api/food-truck-apply enforces. Spec and decisions:
 * docs/superpowers/plans/2026-10-07-food-truck-application.md.
 *
 * Files never pass through the route (Vercel caps a request body at about
 * 4.5 MB; five 10 MB photos cannot). The form posts a manifest of the files it
 * will send; the route checks it here and answers with one signed upload URL
 * per file, into the new truck's folder: logo and photos in the public
 * food-truck-logos bucket, the health permit and business license in the
 * PRIVATE food-truck-docs bucket (093).
 */
import { FOOD_TRUCK_DEPOSIT_CENTS, foodTruckPrice } from '@/lib/food-truck-pricing'
import { FINAL_DUE_LABEL } from '@/lib/event-config'

/** Ryan's pick-list (decision 7, 2026-10-07). "Other" asks for the type. */
export const FOOD_TYPES = [
  'BBQ',
  'Mexican / Tacos',
  'Burgers & American',
  'Southern / Soul',
  'Seafood',
  'Asian',
  'Desserts & Sweets',
  'Coffee & Drinks',
] as const
export const FOOD_TYPE_OTHER = 'Other'
const OTHER_MAX = 60

export const TRUCK_DAYS = ['friday', 'saturday', 'sunday'] as const
export type TruckDay = (typeof TRUCK_DAYS)[number]
export const TRUCK_DAY_LABELS: Record<TruckDay, string> = { friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' }

export const DESCRIPTION_MAX = 500

/** Decision 9: up to 5 photos, 10 MB each, JPG/PNG/WebP. The bucket allows 10 MB (091). */
export const PHOTO_MAX_COUNT = 5
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024
/** Logos keep the bucket's old 5 MB limit; the bucket itself now allows 10 MB. */
export const TRUCK_LOGO_MAX_BYTES = 5 * 1024 * 1024
/** Exactly the bucket's allowed_mime_types (017). */
export const TRUCK_IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const TRUCK_IMAGE_ACCEPT = Object.keys(TRUCK_IMAGE_TYPES).join(',')

/**
 * Health permit and business license (093; Ryan, 2026-10-08): PDF, JPG or
 * PNG, up to 10 MB, exactly the private bucket's limits. Optional to apply.
 */
export const TRUCK_DOC_KINDS = ['permit', 'license'] as const
export type TruckDocKind = (typeof TRUCK_DOC_KINDS)[number]
export const TRUCK_DOC_LABELS: Record<TruckDocKind, string> = { permit: 'Health permit', license: 'Business license' }
export const TRUCK_DOC_MAX_BYTES = 10 * 1024 * 1024
export const TRUCK_DOC_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
export const TRUCK_DOC_ACCEPT = Object.keys(TRUCK_DOC_TYPES).join(',')
export const TRUCK_LOGOS_BUCKET = 'food-truck-logos'
export const TRUCK_DOCS_BUCKET = 'food-truck-docs'

/**
 * The requirements shown on the form, which the acknowledgment covers (Ryan's
 * spec, 2026-10-07). Built here so the deposit and the due date come from
 * their one home rather than being restated.
 */
export const FOOD_TRUCK_REQUIREMENTS: readonly string[] = [
  'No power is provided. Trucks must bring their own (generator).',
  'A valid health permit and business license are required. Show them at setup or upload them ahead of time. They are not required to apply.',
  'Trucks are responsible for their own inspection fees.',
  'No exclusivity for a food type, but we aim for variety.',
  'The Crown Complex is a Pepsi facility: trucks may not sell Coke products (Pepsi products or non-soda drinks only), since attendees bring rodeo food and drinks inside.',
  `The ${dollarsWhole(FOOD_TRUCK_DEPOSIT_CENTS)} deposit holds your space but does not guarantee it. Full payment is due by ${FINAL_DUE_LABEL} to confirm your spot.`,
]

function dollarsWhole(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export type FileKind = 'logo' | 'photo' | TruckDocKind
export interface FileManifestEntry { kind: FileKind; type: string; size: number }
export interface PlannedFile { kind: FileKind; ext: string; contentType: string }

export interface FoodTruckSubmissionValues {
  business_name: string
  contact_name: string
  phone: string
  email: string
  cuisine_type: string
  days: TruckDay[]
  website: string | null
  instagram: string | null
  facebook: string | null
  description: string
  /** cents, from foodTruckPrice */
  price: number
  files: PlannedFile[]
}

export type FoodTruckValidation =
  | { ok: true; values: FoodTruckSubmissionValues }
  | { ok: false; fieldErrors: Record<string, string> }

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Checks one file against the bucket's types and the per-kind size. */
export function checkTruckFile(f: { type: string; size: number }, kind: FileKind): { ok: true; ext: string } | { ok: false; error: string } {
  if (kind === 'permit' || kind === 'license') {
    const docExt = TRUCK_DOC_TYPES[f.type]
    if (!docExt) return { ok: false, error: `${TRUCK_DOC_LABELS[kind]} must be a PDF, JPG or PNG.` }
    if (!(f.size > 0) || f.size > TRUCK_DOC_MAX_BYTES) return { ok: false, error: `${TRUCK_DOC_LABELS[kind]} must be ${TRUCK_DOC_MAX_BYTES / 1024 / 1024} MB or smaller.` }
    return { ok: true, ext: docExt }
  }
  const ext = TRUCK_IMAGE_TYPES[f.type]
  const what = kind === 'logo' ? 'Logo' : 'Each photo'
  if (!ext) return { ok: false, error: `${what} must be a JPG, PNG or WebP image.` }
  const max = kind === 'logo' ? TRUCK_LOGO_MAX_BYTES : PHOTO_MAX_BYTES
  if (!(f.size > 0) || f.size > max) return { ok: false, error: `${what} must be ${max / 1024 / 1024} MB or smaller.` }
  return { ok: true, ext }
}

export function validateFoodTruckSubmission(body: Record<string, unknown>): FoodTruckValidation {
  const fieldErrors: Record<string, string> = {}

  const business_name = str(body.businessName)
  const contact_name = str(body.contactName)
  const phone = str(body.phone, 40)
  const email = str(body.email, 254)
  if (!business_name) fieldErrors.businessName = 'Food truck name is required.'
  if (!contact_name) fieldErrors.contactName = 'Contact name is required.'
  if (!phone) fieldErrors.phone = 'Phone is required.'
  else if ((phone.match(/\d/g) ?? []).length < 10) fieldErrors.phone = 'Please enter a phone number with area code.'
  if (!email) fieldErrors.email = 'Email is required.'
  else if (!EMAIL.test(email)) fieldErrors.email = 'That email address does not look right.'

  const foodType = str(body.foodType)
  let cuisine_type = ''
  if ((FOOD_TYPES as readonly string[]).includes(foodType)) cuisine_type = foodType
  else if (foodType === FOOD_TYPE_OTHER) {
    cuisine_type = str(body.foodTypeOther, OTHER_MAX)
    if (!cuisine_type) fieldErrors.foodTypeOther = 'Please tell us your type of food.'
  } else fieldErrors.foodType = 'Please choose a type of food.'

  const daysRaw = Array.isArray(body.days) ? body.days : []
  const days = TRUCK_DAYS.filter(d => daysRaw.includes(d))
  if (daysRaw.some(d => !(TRUCK_DAYS as readonly unknown[]).includes(d))) fieldErrors.days = 'Please choose from Friday, Saturday and Sunday.'
  else if (days.length === 0) fieldErrors.days = 'Please choose at least one day.'

  if (body.acknowledged !== true) fieldErrors.acknowledged = 'Please confirm you have read and agree to the requirements.'

  const description = str(body.description, DESCRIPTION_MAX)

  const manifest = Array.isArray(body.files) ? body.files : []
  const files: PlannedFile[] = []
  const logos = manifest.filter((f): f is FileManifestEntry => !!f && typeof f === 'object' && (f as FileManifestEntry).kind === 'logo')
  const photos = manifest.filter((f): f is FileManifestEntry => !!f && typeof f === 'object' && (f as FileManifestEntry).kind === 'photo')
  const permits = manifest.filter((f): f is FileManifestEntry => !!f && typeof f === 'object' && (f as FileManifestEntry).kind === 'permit')
  const licenses = manifest.filter((f): f is FileManifestEntry => !!f && typeof f === 'object' && (f as FileManifestEntry).kind === 'license')
  if (logos.length + photos.length + permits.length + licenses.length !== manifest.length) fieldErrors.files = 'Could not read the attached files. Please try again.'
  if (logos.length > 1) fieldErrors.logo = 'Please attach one logo.'
  if (permits.length > 1) fieldErrors.permit = 'Please attach one health permit.'
  if (licenses.length > 1) fieldErrors.license = 'Please attach one business license.'
  if (photos.length > PHOTO_MAX_COUNT) fieldErrors.photos = `Please attach up to ${PHOTO_MAX_COUNT} photos.`
  // Order matters: the route's upload `index` follows it (logo, photos, permit, license).
  for (const [kind, list] of [['logo', logos], ['photo', photos], ['permit', permits], ['license', licenses]] as const) {
    for (const f of list) {
      const c = checkTruckFile({ type: String(f.type), size: Number(f.size) }, kind)
      if (!c.ok) { fieldErrors[kind === 'photo' ? 'photos' : kind] = c.error; continue }
      files.push({ kind, ext: c.ext, contentType: String(f.type) })
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return {
    ok: true,
    values: {
      business_name,
      contact_name,
      phone,
      email,
      cuisine_type,
      days,
      website: str(body.websiteUrl) || null,
      instagram: str(body.instagram) || null,
      facebook: str(body.facebook) || null,
      description,
      price: foodTruckPrice(days.length),
      files,
    },
  }
}

/**
 * Where an applicant's file goes: inside the truck's own folder, so the 090
 * owner policy covers it once the truck is linked to an account. Random
 * names (Ryan's decision 3: unlisted paths in the public bucket).
 */
export function applicantFilePath(truckId: string, f: PlannedFile, rand: string): string {
  if (f.kind === 'photo') return `${truckId}/photos/${rand}.${f.ext}`
  return `${truckId}/${f.kind}-${rand}.${f.ext}`
}

/** Documents go in the private bucket; pictures in the public one. */
export function bucketFor(kind: FileKind): string {
  return kind === 'permit' || kind === 'license' ? TRUCK_DOCS_BUCKET : TRUCK_LOGOS_BUCKET
}

export type TruckDocState = 'missing' | 'uploaded' | 'verified'
/** For the admin Docs column and the portal. */
export function truckDocState(path: string | null | undefined, verifiedAt: string | null | undefined): TruckDocState {
  if (!path) return 'missing'
  return verifiedAt ? 'verified' : 'uploaded'
}

/** "Friday, Saturday" from the stored day keys, in show order. */
export function describeDays(days: readonly string[]): string {
  return TRUCK_DAYS.filter(d => days.includes(d)).map(d => TRUCK_DAY_LABELS[d]).join(', ')
}
