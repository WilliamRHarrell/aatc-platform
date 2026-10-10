import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canAccess } from '@/lib/roles'
import { ALLOWED_PATHS, ALLOWED_TAGS } from '@/lib/revalidate-paths'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

describe('Gold Star VIP Meet & Greet featured artists (098)', () => {
  it('the public page reads the view, has no placeholders, and hides an empty section', () => {
    const page = read('src/app/events/vip-meet-greet/page.tsx')
    expect(page).toContain('await getVipArtists()')
    expect(read('src/lib/vip-server.ts')).toContain(".from('vip_featured_public')")
    expect(page).toContain('{artists.length > 0 && (')
    expect(page).not.toContain('FEATURED_ARTISTS')
    expect(page).not.toContain('Artist Announcement Coming Soon')
    expect(page).not.toContain("'use client'")
  })
  it('the editor route syncs the table by uid and purges the page', () => {
    const route = read('src/app/api/admin/applications/editor/route.ts')
    expect(route).toContain('await syncVip(supabase, appId, body.input)')
    expect(route).toContain("revalidateTag('vip', { expire: 0 })")
  })
  it('the editor ticks per artist, loads the ticks, and reads back uids after a save', () => {
    const form = read('src/components/admin/ApplicationEditorForm.tsx')
    expect(form).toContain('Attending Gold Star VIP Meet &amp; Greet')
    expect(form).toContain('vip: a.vip,')
    expect(form).toContain("extra: { ...a.extra, uid }")
    expect(read('src/app/admin/applications/[id]/edit/page.tsx')).toContain("from('vip_featured_artists').select('artist_uid')")
  })
  it('the booth page toggles by uid; /admin/vip orders; admin only', () => {
    expect(read('src/app/admin/booths/[id]/page.tsx')).toContain('toggleVip(artist.uid as string, e.target.checked)')
    expect(read('src/app/admin/vip/page.tsx')).toContain("update({ display_order: order })")
    expect(read('src/components/admin/AdminShell.tsx')).toContain("href: '/admin/vip'")
    expect(canAccess('admin', '/admin/vip')).toBe(true)
    expect(canAccess('content_editor', '/admin/vip')).toBe(false)
    expect(canAccess('sponsorship_manager', '/admin/vip')).toBe(false)
  })
  it('the page and tag can be purged', () => {
    expect(ALLOWED_PATHS.has('/events/vip-meet-greet')).toBe(true)
    expect(ALLOWED_TAGS.has('vip')).toBe(true)
  })
  it('the view mirrors lib/tv-show.ts: own answer, else the application show for a one-artist roster', () => {
    const sql = read('supabase/migrations/098_vip_featured_artists.sql')
    expect(sql).toContain("when el->'tv_featured' = 'false'::jsonb then null")
    expect(sql).toContain('when jsonb_array_length(a.artists) = 1 and a.tv_show_featured is distinct from false')
    expect(sql).toContain("where a.status = 'approved'")
  })
})

describe('Featured badge and homepage section (099)', () => {
  it('the homepage section is behind the content switch and the minimum of 3', async () => {
    const { MIN_FEATURED_FOR_HOMEPAGE, VIP_PATHS } = await import('@/lib/vip-config')
    const { defaultsFor } = await import('@/content/registry')
    expect(MIN_FEATURED_FOR_HOMEPAGE).toBe(3)
    expect(VIP_PATHS).toContain('/')
    expect(defaultsFor('homepage').featured_artists_on).toBe('false')
    const home = read('src/app/page.tsx')
    expect(home).toContain("isTrue(c.featured_artists_on) && vipArtists.length >= MIN_FEATURED_FOR_HOMEPAGE")
    expect(home).toContain('{featuredArtists.length > 0 && (')
    expect(home).toContain('a.in_directory ?')
  })
  it('one cached read serves the VIP page and the homepage', () => {
    expect(read('src/app/events/vip-meet-greet/page.tsx')).toContain("from '@/lib/vip-server'")
    expect(read('src/app/events/vip-meet-greet/page.tsx')).not.toContain('unstable_cache(')
  })
  it('the directory badges exhibitors and artists from the view', () => {
    expect(read('src/app/directory/page.tsx')).toContain('featured={vip.applications.has(e.id)}')
    expect(read('src/app/directory/artists/page.tsx')).toContain('featured={!!a.uid && vip.artists.has(a.uid)}')
    expect(read('src/app/directory/[id]/page.tsx')).toContain('a.uid && vip.artists.has(a.uid) && <FeaturedBadge')
    expect(read('src/lib/vip.ts')).toContain(".from('vip_featured_public').select('application_id, artist_uid')")
  })
  it('every admin writer purges both pages', () => {
    for (const f of ['src/app/admin/booths/[id]/page.tsx', 'src/app/admin/vip/page.tsx']) expect(read(f)).toContain('paths: VIP_PATHS')
    expect(read('src/app/api/admin/applications/editor/route.ts')).toContain('VIP_PATHS.forEach(p => revalidatePath(p))')
  })
})
