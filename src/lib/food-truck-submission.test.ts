import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  validateFoodTruckSubmission, checkTruckFile, applicantFilePath, describeDays, bucketFor, truckDocState,
  FOOD_TYPES, FOOD_TRUCK_REQUIREMENTS, PHOTO_MAX_BYTES, TRUCK_LOGO_MAX_BYTES,
} from '@/lib/food-truck-submission'
import { FINAL_DUE_LABEL } from '@/lib/event-config'

const VALID = {
  businessName: '  Taco Truck ',
  contactName: 'Sam',
  phone: '(910) 555-0100',
  email: 'sam@example.com',
  foodType: 'Mexican / Tacos',
  days: ['sunday', 'friday'],
  acknowledged: true,
}

describe('validateFoodTruckSubmission', () => {
  it('accepts the required fields, trims, orders days and prices from the shared pricing', () => {
    const v = validateFoodTruckSubmission(VALID)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.values.business_name).toBe('Taco Truck')
    expect(v.values.days).toEqual(['friday', 'sunday'])
    expect(v.values.price).toBe(20000)
    expect(v.values.cuisine_type).toBe('Mexican / Tacos')
    expect(v.values.files).toEqual([])
  })

  it('requires every spec field and the acknowledgment', () => {
    const v = validateFoodTruckSubmission({})
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(Object.keys(v.fieldErrors).sort()).toEqual(['acknowledged', 'businessName', 'contactName', 'days', 'email', 'foodType', 'phone'])
    // a truthy string is not an acknowledgment
    const s = validateFoodTruckSubmission({ ...VALID, acknowledged: 'true' })
    expect(s.ok).toBe(false)
  })

  it('takes "Other" with its typed food type, and refuses an unlisted type', () => {
    const o = validateFoodTruckSubmission({ ...VALID, foodType: 'Other', foodTypeOther: ' Gyros ' })
    expect(o.ok && o.values.cuisine_type).toBe('Gyros')
    const blank = validateFoodTruckSubmission({ ...VALID, foodType: 'Other', foodTypeOther: '' })
    expect(!blank.ok && blank.fieldErrors.foodTypeOther).toBeTruthy()
    const bad = validateFoodTruckSubmission({ ...VALID, foodType: 'Pizza' })
    expect(!bad.ok && bad.fieldErrors.foodType).toBeTruthy()
    expect(FOOD_TYPES).toHaveLength(8)
  })

  it('refuses unknown days and a phone without an area code', () => {
    const d = validateFoodTruckSubmission({ ...VALID, days: ['thursday'] })
    expect(!d.ok && d.fieldErrors.days).toBeTruthy()
    const p = validateFoodTruckSubmission({ ...VALID, phone: '555-0100' })
    expect(!p.ok && p.fieldErrors.phone).toBeTruthy()
  })

  it('checks the file manifest: one logo, up to 5 photos, types and sizes', () => {
    const photo = { kind: 'photo', type: 'image/webp', size: 1000 }
    const ok = validateFoodTruckSubmission({ ...VALID, files: [{ kind: 'logo', type: 'image/png', size: 1000 }, photo, photo] })
    expect(ok.ok && ok.values.files.map(f => `${f.kind}.${f.ext}`)).toEqual(['logo.png', 'photo.webp', 'photo.webp'])
    const six = validateFoodTruckSubmission({ ...VALID, files: Array(6).fill(photo) })
    expect(!six.ok && six.fieldErrors.photos).toBeTruthy()
    const svg = validateFoodTruckSubmission({ ...VALID, files: [{ kind: 'logo', type: 'image/svg+xml', size: 10 }] })
    expect(!svg.ok && svg.fieldErrors.logo).toBeTruthy()
    const junk = validateFoodTruckSubmission({ ...VALID, files: [{ kind: 'pdf', type: 'application/pdf', size: 10 }] })
    expect(!junk.ok && junk.fieldErrors.files).toBeTruthy()
  })
})

describe('checkTruckFile', () => {
  it('logos up to 5 MB, photos up to 10 MB', () => {
    expect(checkTruckFile({ type: 'image/jpeg', size: TRUCK_LOGO_MAX_BYTES }, 'logo').ok).toBe(true)
    expect(checkTruckFile({ type: 'image/jpeg', size: TRUCK_LOGO_MAX_BYTES + 1 }, 'logo').ok).toBe(false)
    expect(checkTruckFile({ type: 'image/jpeg', size: PHOTO_MAX_BYTES }, 'photo').ok).toBe(true)
    expect(checkTruckFile({ type: 'image/jpeg', size: PHOTO_MAX_BYTES + 1 }, 'photo').ok).toBe(false)
    expect(checkTruckFile({ type: 'image/jpeg', size: 0 }, 'photo').ok).toBe(false)
  })
})

describe('paths and labels', () => {
  it('files go in the truck folder (the 090 owner policy keys on it)', () => {
    expect(applicantFilePath('T1', { kind: 'logo', ext: 'png', contentType: 'image/png' }, 'r')).toBe('T1/logo-r.png')
    expect(applicantFilePath('T1', { kind: 'photo', ext: 'jpg', contentType: 'image/jpeg' }, 'r')).toBe('T1/photos/r.jpg')
  })
  it('describes days in show order', () => {
    expect(describeDays(['sunday', 'friday'])).toBe('Friday, Sunday')
  })
  it('trucks CAN sell Coke; it just cannot go inside (Ryan, 2026-10-08)', () => {
    const drinks = FOOD_TRUCK_REQUIREMENTS.find(r => r.startsWith('Drinks:'))
    expect(drinks).toBe("Drinks: The Crown Complex is a Pepsi facility. You can sell any drinks, but Coke and other non-Pepsi drinks can't be taken inside the building; customers have to finish them outside. Please let your customers know when they order.")
    for (const r of FOOD_TRUCK_REQUIREMENTS) expect(r).not.toMatch(/may not sell|non-soda drinks only/i)
  })
  it('the deposit line reads the deposit constant and FINAL_DUE_LABEL', () => {
    const last = FOOD_TRUCK_REQUIREMENTS[FOOD_TRUCK_REQUIREMENTS.length - 1]
    expect(last).toContain('$100 deposit')
    expect(last).toContain(FINAL_DUE_LABEL)
  })
})

describe('permit and license (093)', () => {
  const VALID2 = { businessName: 'T', contactName: 'S', phone: '(910) 555-0100', email: 's@example.com', foodType: 'BBQ', days: ['friday'], acknowledged: true }
  it('PDF, JPG or PNG up to 10 MB; one of each', () => {
    const ok = validateFoodTruckSubmission({ ...VALID2, files: [
      { kind: 'license', type: 'image/png', size: 10 * 1024 * 1024 },
      { kind: 'permit', type: 'application/pdf', size: 1000 },
      { kind: 'logo', type: 'image/png', size: 1000 },
    ] })
    // logo, photos, permit, license: the order the route's upload index follows
    expect(ok.ok && ok.values.files.map(f => `${f.kind}.${f.ext}`)).toEqual(['logo.png', 'permit.pdf', 'license.png'])
    expect(checkTruckFile({ type: 'image/webp', size: 10 }, 'permit').ok).toBe(false)
    expect(checkTruckFile({ type: 'application/pdf', size: 10 * 1024 * 1024 + 1 }, 'license').ok).toBe(false)
    const two = validateFoodTruckSubmission({ ...VALID2, files: [{ kind: 'permit', type: 'application/pdf', size: 1 }, { kind: 'permit', type: 'application/pdf', size: 1 }] })
    expect(!two.ok && two.fieldErrors.permit).toBeTruthy()
  })
  it('documents go to the private bucket, in the truck folder', () => {
    expect(bucketFor('permit')).toBe('food-truck-docs')
    expect(bucketFor('license')).toBe('food-truck-docs')
    expect(bucketFor('photo')).toBe('food-truck-logos')
    expect(applicantFilePath('T1', { kind: 'permit', ext: 'pdf', contentType: 'application/pdf' }, 'r')).toBe('T1/permit-r.pdf')
  })
  it('the private bucket limits in 093 match the app', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/093_food_truck_documents.sql'), 'utf8')
    expect(sql).toContain("'food-truck-docs', 'food-truck-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']")
  })
  it('doc state', () => {
    expect(truckDocState(null, null)).toBe('missing')
    expect(truckDocState('T1/p.pdf', null)).toBe('uploaded')
    expect(truckDocState('T1/p.pdf', 'x')).toBe('verified')
  })
})
