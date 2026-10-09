import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

describe('the old vercel.app host redirects its pages to www (2026-10-09)', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
  it('a host rule sends every non-API path to the canonical origin, permanently', () => {
    expect(config).toContain('export const LEGACY_HOST = "aatc-platform.vercel.app"')
    expect(config).toContain("has: [{ type: 'host', value: LEGACY_HOST }]")
    expect(config).toContain('destination: `${CANONICAL_ORIGIN}/:path`')
  })
  it('the path pattern leaves /api and /api/* alone and redirects everything else', () => {
    const re = /^\/((?!api(?:\/|$)).*)$/
    for (const p of ['/', '/tickets', '/apiary', '/auth/reset-password']) expect(re.test(p), p).toBe(true)
    for (const p of ['/api', '/api/cron/lifecycle-sweep', '/api/webhooks/stripe']) expect(re.test(p), p).toBe(false)
    expect(config).toContain("source: '/:path((?!api(?:/|$)).*)'")
  })
  it('no code falls back to the vercel.app host any more', () => {
    for (const f of ['src/app/api/admin/reset-user-password/route.ts', 'src/app/api/cron/lifecycle-sweep/route.ts']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toContain('vercel.app')
    }
  })
})
