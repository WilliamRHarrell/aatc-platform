import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { VETERAN_LABEL, shopVeteranLabel, groupVeteranBadges } from '@/lib/veteran-config'
import { ALLOWED_TAGS } from '@/lib/revalidate-paths'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

describe('public Veteran badges (100)', () => {
  it("labels are Ryan's (2026-10-10)", () => {
    expect(VETERAN_LABEL).toEqual({ artist: 'Veteran', vendor: 'Veteran-owned' })
    expect(shopVeteranLabel(0)).toBeNull()
    expect(shopVeteranLabel(1)).toBe('Veteran artist')
    expect(shopVeteranLabel(3)).toBe('Veteran artists')
  })
  it('groups rows into vendor businesses, artists and per-shop counts', () => {
    const g = groupVeteranBadges([
      { application_id: 'v1', artist_uid: null },
      { application_id: 'a1', artist_uid: 'u1' }, { application_id: 'a1', artist_uid: 'u2' }, { application_id: 'a2', artist_uid: 'u3' },
    ])
    expect([...g.vendors]).toEqual(['v1'])
    expect([...g.artists]).toEqual(['u1', 'u2', 'u3'])
    expect(g.shopCounts.get('a1')).toBe(2)
    expect(g.shopCounts.get('v1')).toBeUndefined()
  })
  it('the badge is a text label with a decorative flag and no star', () => {
    const badge = read('src/components/VeteranBadge.tsx')
    expect(badge).toContain('aria-hidden="true"')
    expect(badge).toContain('{label}')
    expect(badge).not.toContain('<polygon')
  })
  it('never derived from is_veteran: only admin ticks write it', () => {
    for (const f of ['src/app/directory/page.tsx', 'src/app/directory/artists/page.tsx', 'src/app/directory/[id]/page.tsx', 'src/app/events/vip-meet-greet/page.tsx', 'src/app/page.tsx']) {
      const src = read(f)
      expect(src, f).toContain('VeteranBadge')
      expect(src, f).not.toContain('is_veteran')
    }
    expect(read('src/app/api/admin/applications/editor/route.ts')).toContain('await syncVeteranBadges(supabase, appId, body.input)')
    expect(read('src/app/admin/booths/[id]/page.tsx')).toContain("toggleVeteran('', e.target.checked)")
    expect(read('src/components/admin/ApplicationEditorForm.tsx')).toContain('Show a public Veteran-owned badge')
    expect(read('src/components/admin/ApplicationEditorForm.tsx')).toContain('Show a public Veteran badge')
  })
  it('the directory shop card says "Veteran artist(s)", a vendor "Veteran-owned"', () => {
    const dir = read('src/app/directory/page.tsx')
    expect(dir).toContain("e.exhibitor_type === 'vendor' ? (veteran.vendors.has(e.id) ? VETERAN_LABEL.vendor : null) : shopVeteranLabel(veteran.shopCounts.get(e.id) ?? 0)")
  })
  it('server pages can be purged', () => {
    expect(ALLOWED_TAGS.has('veteran')).toBe(true)
  })
})
