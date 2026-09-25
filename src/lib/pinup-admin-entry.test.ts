import { describe, it, expect } from 'vitest'
import { validateAdminPinupEntry } from '@/lib/pinup-admin-entry'

const good = { fullName: 'Ann Example', stageName: '', email: 'Ann@Example.com', phone: '910-555-0100', status: 'confirmed' }

describe('validateAdminPinupEntry', () => {
  it('accepts a complete entry, lowercases the email, normalises the phone, attests age and likeness with a timestamp', () => {
    const r = validateAdminPinupEntry(good, new Date('2026-09-25T12:00:00Z'))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.row.email).toBe('ann@example.com')
      expect(r.row.phone).toBe('(910) 555-0100')
      expect(r.row.stage_name).toBe(null)
      expect(r.row.status).toBe('confirmed')
      expect(r.row.age_confirmed).toBe(true)
      expect(r.row.likeness_release).toBe(true)
      expect(r.row.likeness_release_at).toBe('2026-09-25T12:00:00.000Z')
      expect(r.row.marketing_opt_in).toBe(false)
    }
  })
  it('names missing fields', () => {
    const r = validateAdminPinupEntry({ ...good, fullName: ' ', email: 'x', phone: '12' }, new Date())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['email', 'fullName', 'phone'])
  })
  it('only confirmed or waitlist can be chosen by hand (pending is the form path, withdrawn is an edit)', () => {
    for (const s of ['pending', 'withdrawn', 'nonsense']) {
      const r = validateAdminPinupEntry({ ...good, status: s }, new Date())
      expect(r.ok, s).toBe(false)
    }
    expect(validateAdminPinupEntry({ ...good, status: 'waitlist' }, new Date()).ok).toBe(true)
  })
})
