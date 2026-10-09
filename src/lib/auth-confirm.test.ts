import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeNext, confirmUrl, confirmTemplateUrl, isConfirmType } from '@/lib/auth-confirm'

describe('auth-confirm', () => {
  it('only same-site destinations, else the default for the link type', () => {
    expect(safeNext('/portal', 'email')).toBe('/portal')
    expect(safeNext('//evil.example', 'recovery')).toBe('/auth/reset-password')
    expect(safeNext('https://evil.example', 'email')).toBe('/apply')
    expect(safeNext('/\\evil.example', 'email')).toBe('/apply')
    expect(safeNext(undefined, 'invite')).toBe('/auth/reset-password')
  })
  it('builds app links and dashboard template links', () => {
    expect(confirmUrl('https://www.allamericantattooconvention.com', 'abc', 'recovery', '/auth/reset-password'))
      .toBe('https://www.allamericantattooconvention.com/auth/confirm?token_hash=abc&type=recovery&next=%2Fauth%2Freset-password')
    expect(confirmTemplateUrl('email', '/apply')).toBe('{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/apply')
    expect(isConfirmType('magiclink')).toBe(false)
  })
})

describe('scanner-safe: nothing verifies on GET', () => {
  it('the page only renders a POST form; only the POST route calls verifyOtp', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/auth/confirm/page.tsx'), 'utf8')
    const route = readFileSync(join(process.cwd(), 'src/app/auth/confirm/verify/route.ts'), 'utf8')
    expect(page).not.toContain('verifyOtp')
    expect(page).toContain('method="post" action="/auth/confirm/verify"')
    expect(route).toContain('export async function POST')
    expect(route).not.toMatch(/export (async )?function GET/)
    expect(route).toContain('verifyOtp')
  })
})
