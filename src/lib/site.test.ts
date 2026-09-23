import { describe, it, expect } from 'vitest'
import { CANONICAL_ORIGIN, PRODUCTION_HOST } from '@/lib/site'
import { QR_BASE_URL } from '@/lib/tattoo-battle-config'

describe('canonical origin', () => {
  it('is the www host on the production domain, https, no trailing slash', () => {
    expect(CANONICAL_ORIGIN).toBe(`https://www.${PRODUCTION_HOST}`)
    expect(CANONICAL_ORIGIN.endsWith('/')).toBe(false)
  })
  it('is the one home the printed QR codes read from', () => {
    expect(QR_BASE_URL).toBe(CANONICAL_ORIGIN)
  })
})
