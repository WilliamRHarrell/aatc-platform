import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { socialUrl } from '@/lib/social-url'

describe('socialUrl', () => {
  it('handles, page names and full URLs', () => {
    expect(socialUrl('instagram', '@truck')).toBe('https://instagram.com/truck')
    expect(socialUrl('facebook', 'MyPage')).toBe('https://facebook.com/MyPage')
    expect(socialUrl('facebook', 'https://www.facebook.com/x')).toBe('https://www.facebook.com/x')
  })
})

describe('sponsor list does not repeat the tier (2026-10-09)', () => {
  it('extras leave out the item already shown as the tier', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/admin/sponsorships/page.tsx'), 'utf8')
    expect(page).toContain('(s.additional_items ?? []).filter(i => i !== s.tier)')
  })
})
