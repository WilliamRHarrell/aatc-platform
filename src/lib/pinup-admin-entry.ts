/**
 * A pinup entry added BY HAND from /admin/pinup (migration 076 adds the admin
 * INSERT policy). The registration function is service-role only and holds
 * the capacity lock; a by-hand entry bypasses that on purpose, so the admin
 * chooses confirmed or waitlist explicitly. The admin attests age and the
 * likeness release on the entrant's behalf; the TIMESTAMP is stamped by the
 * database (076 trigger), never by this browser, and marketing consent is
 * never assumed.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (local.length !== 10) return null
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
}

export type AdminPinupStatus = 'confirmed' | 'waitlist'

export interface AdminPinupRow {
  full_name: string
  stage_name: string | null
  email: string
  phone: string
  status: AdminPinupStatus
  age_confirmed: true
  likeness_release: true
  marketing_opt_in: false
}

export type AdminPinupValidation =
  | { ok: true; row: AdminPinupRow }
  | { ok: false; fieldErrors: Record<string, string> }

export function validateAdminPinupEntry(input: Record<string, unknown>): AdminPinupValidation {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const fullName = str(input.fullName)
  const email = str(input.email).toLowerCase()
  const phone = normalisePhone(str(input.phone))
  const status = str(input.status)
  const fieldErrors: Record<string, string> = {}
  if (!fullName) fieldErrors.fullName = 'Full name is required.'
  if (!EMAIL.test(email)) fieldErrors.email = 'Enter a valid email address.'
  if (!phone) fieldErrors.phone = 'Enter a 10 digit US phone number.'
  if (status !== 'confirmed' && status !== 'waitlist') fieldErrors.status = 'Choose confirmed or waitlist.'
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return {
    ok: true,
    row: {
      full_name: fullName,
      stage_name: str(input.stageName) || null,
      email,
      phone: phone!,
      status: status as AdminPinupStatus,
      age_confirmed: true,
      likeness_release: true,
      marketing_opt_in: false,
    },
  }
}
