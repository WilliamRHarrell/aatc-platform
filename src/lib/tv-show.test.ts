import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tvShowLabel } from '@/lib/tv-show'

describe('tvShowLabel', () => {
  it('Yes with and without a name, No, and not asked', () => {
    expect(tvShowLabel(true, 'Ink Master')).toBe('Yes: Ink Master')
    expect(tvShowLabel(true, '  ')).toBe('Yes (show not named)')
    expect(tvShowLabel(false, null)).toBe('No')
    expect(tvShowLabel(null, null)).toBeNull()
    expect(tvShowLabel(null, 'Ink Master')).toBe('Ink Master')
  })
  it('the artist form saves the Yes/No', () => {
    const form = readFileSync(join(process.cwd(), 'src/app/apply/artist/ArtistApplyForm.tsx'), 'utf8')
    expect(form).toContain('tv_show_featured: details.tv_show_flag')
  })
})
