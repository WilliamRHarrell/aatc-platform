import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAuthLanding } from '@/lib/auth-link'

const BASE = 'https://www.allamericantattooconvention.com/auth/reset-password'

describe('parseAuthLanding', () => {
  it('admin recovery / invite links land with the session in the hash (what the live redirect returned, 2026-10-08)', () => {
    const l = parseAuthLanding(`${BASE}#access_token=AT&expires_at=1&expires_in=3600&refresh_token=RT&sb=&token_type=bearer&type=recovery`)
    expect(l).toEqual({ kind: 'tokens', accessToken: 'AT', refreshToken: 'RT', type: 'recovery' })
    expect(parseAuthLanding(`${BASE}#access_token=AT&refresh_token=RT&type=invite`)).toMatchObject({ kind: 'tokens', type: 'invite' })
  })
  it('a used or expired link lands with an error in the hash', () => {
    const l = parseAuthLanding(`${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=`)
    expect(l).toEqual({ kind: 'error', code: 'otp_expired', description: 'Email link is invalid or has expired' })
  })
  it('an error in the query counts too', () => {
    expect(parseAuthLanding(`${BASE}?error=access_denied&error_code=otp_expired`).kind).toBe('error')
  })
  it('self-service links land with ?code=', () => {
    expect(parseAuthLanding(`${BASE}?code=abc`)).toEqual({ kind: 'code' })
  })
  it('nothing in the URL', () => {
    expect(parseAuthLanding(BASE)).toEqual({ kind: 'none' })
  })
})

describe('the reset page never waits forever', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/auth/reset-password/page.tsx'), 'utf8')
  it('times out, sets the session from hash tokens, and offers a new link', () => {
    expect(page).toContain('AUTH_LINK_TIMEOUT_MS')
    expect(page).toContain('setSession(')
    expect(page).toContain('This link has expired or was already used')
    expect(page).toContain('/auth/forgot-password')
  })
})
