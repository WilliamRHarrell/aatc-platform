import { describe, it, expect } from 'vitest'
import {
  validateWallOfHonorSubmission, entryPhotoPath, photoQuality, duplicateHonoreeKey,
  BRANCHES, RELATIONSHIPS, TRIBUTE_MAX, WOH_PHOTO_MAX_BYTES, WOH_IMAGE_ACCEPT,
  WOH_SUBMISSIONS_BUCKET, WOH_PUBLIC_BUCKET,
} from '@/lib/wall-of-honor-submission'

const PHOTO = { type: 'image/jpeg', size: 1000 }
const VALID = {
  honoreeName: '  John Smith ',
  branch: 'Army',
  tribute: ' He served with honor. ',
  yourName: ' Jane Smith ',
  relationship: 'Spouse',
  email: 'jane@example.com',
  consent: true,
  files: [PHOTO],
}

function errors(body: Record<string, unknown>): Record<string, string> {
  const v = validateWallOfHonorSubmission(body)
  expect(v.ok).toBe(false)
  return v.ok ? {} : v.fieldErrors
}

describe('validateWallOfHonorSubmission', () => {
  it('accepts a full valid body, trims, and nulls empty optionals', () => {
    const v = validateWallOfHonorSubmission(VALID)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.values).toEqual({
      honoree_name: 'John Smith',
      honoree_rank: null,
      branch: 'Army',
      unit: null,
      service_years: null,
      tribute: 'He served with honor.',
      submitter_name: 'Jane Smith',
      submitter_relationship: 'Spouse',
      submitter_email: 'jane@example.com',
      submitter_phone: null,
      consent_social: false,
      photos: [{ ext: 'jpg', contentType: 'image/jpeg' }],
    })
  })

  it('carries the optional fields and the social consent when given', () => {
    const v = validateWallOfHonorSubmission({
      ...VALID, rank: ' Sgt ', unit: ' 82nd Airborne ', serviceYears: ' 1966-1969 ', phone: ' 555-0100 ', consentSocial: true,
    })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.values.honoree_rank).toBe('Sgt')
    expect(v.values.unit).toBe('82nd Airborne')
    expect(v.values.service_years).toBe('1966-1969')
    expect(v.values.submitter_phone).toBe('555-0100')
    expect(v.values.consent_social).toBe(true)
  })

  it('requires the name, branch, tribute, your name, relationship and email', () => {
    const e = errors({ consent: true, files: [PHOTO] })
    expect(Object.keys(e).sort()).toEqual(['branch', 'email', 'honoreeName', 'relationship', 'tribute', 'yourName'])
  })

  it('branch Other requires branchOther (max 60); an unknown branch is refused', () => {
    expect(errors({ ...VALID, branch: 'Other', branchOther: '  ' }).branchOther).toBeTruthy()
    const ok = validateWallOfHonorSubmission({ ...VALID, branch: 'Other', branchOther: ' Merchant Marine ' })
    expect(ok.ok && ok.values.branch).toBe('Merchant Marine')
    const long = validateWallOfHonorSubmission({ ...VALID, branch: 'Other', branchOther: 'x'.repeat(80) })
    expect(long.ok && long.values.branch).toBe('x'.repeat(60))
    expect(errors({ ...VALID, branch: 'Pirates' }).branch).toBeTruthy()
    expect(BRANCHES).toEqual(['Army', 'Marine Corps', 'Navy', 'Air Force', 'Space Force', 'Coast Guard'])
  })

  it('relationship Other requires relationshipOther; an unknown relationship is refused', () => {
    expect(errors({ ...VALID, relationship: 'Other', relationshipOther: '' }).relationshipOther).toBeTruthy()
    const ok = validateWallOfHonorSubmission({ ...VALID, relationship: 'Other', relationshipOther: ' Neighbor ' })
    expect(ok.ok && ok.values.submitter_relationship).toBe('Neighbor')
    expect(errors({ ...VALID, relationship: 'Stranger' }).relationship).toBeTruthy()
    expect(RELATIONSHIPS).toEqual(['Parent', 'Spouse', 'Child', 'Sibling', 'Other family', 'Friend', 'Fellow service member'])
  })

  it('refuses a bad email shape', () => {
    expect(errors({ ...VALID, email: 'not-an-email' }).email).toBeTruthy()
  })

  it('consent must be exactly true', () => {
    expect(errors({ ...VALID, consent: undefined }).consent).toBeTruthy()
    expect(errors({ ...VALID, consent: 'true' }).consent).toBeTruthy()
    expect(errors({ ...VALID, consent: false }).consent).toBeTruthy()
  })

  it('tribute: exactly 1500 characters passes, 1501 is an error and is never sliced', () => {
    expect(TRIBUTE_MAX).toBe(1500)
    const at = validateWallOfHonorSubmission({ ...VALID, tribute: 'a'.repeat(1500) })
    expect(at.ok && at.values.tribute.length).toBe(1500)
    const over = 'é'.repeat(1501)
    expect(over.length).toBe(1501)
    expect(errors({ ...VALID, tribute: over }).tribute).toBeTruthy()
    expect(errors({ ...VALID, tribute: 'a'.repeat(1501) }).tribute).toBeTruthy()
  })

  it('photos: at least one, at most three', () => {
    expect(errors({ ...VALID, files: [] }).photos).toMatch(/at least/i)
    expect(errors({ ...VALID, files: undefined }).photos).toBeTruthy()
    expect(errors({ ...VALID, files: Array(4).fill(PHOTO) }).photos).toMatch(/up to 3/i)
    const three = validateWallOfHonorSubmission({
      ...VALID, files: [PHOTO, { type: 'image/png', size: 5 }, { type: 'image/webp', size: 5 }],
    })
    expect(three.ok && three.values.photos.map(p => p.ext)).toEqual(['jpg', 'png', 'webp'])
  })

  it('photos: type and size checks', () => {
    expect(errors({ ...VALID, files: [{ type: 'image/heic', size: 1000 }] }).photos).toMatch(/JPG, PNG or WebP/)
    expect(errors({ ...VALID, files: [{ type: 'image/jpeg', size: WOH_PHOTO_MAX_BYTES + 1 }] }).photos).toMatch(/10 MB/)
    expect(errors({ ...VALID, files: [{ type: 'image/jpeg', size: 0 }] }).photos).toBeTruthy()
    const edge = validateWallOfHonorSubmission({ ...VALID, files: [{ type: 'image/jpeg', size: WOH_PHOTO_MAX_BYTES }] })
    expect(edge.ok).toBe(true)
  })
})

describe('helpers and constants', () => {
  it('entryPhotoPath keeps the index prefix inside the entry folder', () => {
    expect(entryPhotoPath('abc', 0, 'jpg', 'r1')).toBe('abc/photo-0-r1.jpg')
  })
  it('photoQuality thresholds', () => {
    expect(photoQuality(1200)).toBe('good')
    expect(photoQuality(1199)).toBe('usable')
    expect(photoQuality(700)).toBe('usable')
    expect(photoQuality(699)).toBe('low')
  })
  it('duplicateHonoreeKey ignores case and spacing', () => {
    expect(duplicateHonoreeKey('  John  SMITH ', 'army')).toBe(duplicateHonoreeKey('John Smith', 'Army'))
    expect(duplicateHonoreeKey('John Smith', 'Army')).toBe('john smith|army')
  })
  it('bucket names and accept list', () => {
    expect(WOH_SUBMISSIONS_BUCKET).toBe('wall-of-honor-submissions')
    expect(WOH_PUBLIC_BUCKET).toBe('wall-of-honor')
    expect(WOH_IMAGE_ACCEPT).toBe('image/jpeg,image/png,image/webp')
    expect(WOH_PHOTO_MAX_BYTES).toBe(10485760)
  })
})
