import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tvShowLabel, artistTv, artistTvLabel, unattributedTv, publicTvShows } from '@/lib/tv-show'

describe('tvShowLabel', () => {
  it('Yes with and without a name, No, and not asked', () => {
    expect(tvShowLabel(true, 'Ink Master')).toBe('Yes: Ink Master')
    expect(tvShowLabel(true, '  ')).toBe('Yes (show not named)')
    expect(tvShowLabel(false, null)).toBe('No')
    expect(tvShowLabel(null, null)).toBeNull()
    expect(tvShowLabel(null, 'Ink Master')).toBe('Ink Master')
  })
})

describe('per-artist TV (Ryan, 2026-10-09: the artist is the source of truth)', () => {
  const two = (a: object, b: object) => [{ name: 'A', ...a }, { name: 'B', ...b }]
  it("an artist's own answer wins, with or without a show name", () => {
    const app = { tv_show_featured: true, tv_show: null, artists: two({ tv_featured: true, tv_credit: 'Ink Master S12' }, { tv_featured: false }) }
    expect(artistTv(app, 0)).toEqual({ featured: true, show: 'Ink Master S12', from: 'artist' })
    expect(artistTvLabel(artistTv(app, 1))).toBe('No')
    expect(artistTvLabel(artistTv({ artists: [{ name: 'A', tv_featured: true }] }, 0))).toBe('Yes (show not named)')
  })
  it('a PR 2 tv_credit without the Yes/No counts as Yes', () => {
    expect(artistTv({ artists: [{ name: 'A', tv_credit: 'Best Ink' }, { name: 'B' }] }, 0)).toEqual({ featured: true, show: 'Best Ink', from: 'artist' })
  })
  it("the application's answer is used only for a one-artist roster", () => {
    expect(artistTv({ tv_show_featured: true, tv_show: 'Ink Master', artists: [{ name: 'A' }] }, 0)).toEqual({ featured: true, show: 'Ink Master', from: 'application' })
    expect(artistTv({ tv_show_featured: true, tv_show: 'Ink Master', artists: two({}, {}) }, 0)).toBeNull()
    // applications_public has tv_show only
    expect(artistTv({ tv_show: 'Ink Master', artists: [{ name: 'A' }] }, 0)?.show).toBe('Ink Master')
  })
  it('an older multi-artist Yes is unattributed until an artist carries it', () => {
    const legacy = { tv_show_featured: true, tv_show: 'Ink Master', artists: two({}, {}) }
    expect(unattributedTv(legacy)).toBe('Yes: Ink Master')
    expect(unattributedTv({ ...legacy, artists: two({ tv_featured: true, tv_credit: 'Ink Master' }, {}) })).toBeNull()
    expect(unattributedTv({ ...legacy, artists: [{ name: 'A' }] })).toBeNull()
    expect(unattributedTv({ ...legacy, tv_show_featured: false })).toBeNull()
  })
  it('public shows: named only, artists first, no repeats, unattributed last', () => {
    expect(publicTvShows({ tv_show: 'Ink Master', artists: two({ tv_credit: 'Best Ink' }, { tv_featured: true }) })).toEqual(['Best Ink'])
    expect(publicTvShows({ tv_show: 'Ink Master', artists: two({}, {}) })).toEqual(['Ink Master'])
    expect(publicTvShows({ tv_show: null, artists: two({ tv_credit: 'X' }, { tv_credit: 'X' }) })).toEqual(['X'])
    expect(publicTvShows({ tv_show: null, artists: null })).toEqual([])
  })
})

describe('TV is asked and shown per artist', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  it('the public artist form asks per artist and keeps "any artist said Yes" on the application', () => {
    const form = read('src/app/apply/artist/ArtistApplyForm.tsx')
    expect(form).toContain('Has this artist been featured on a tattoo TV show?')
    expect(form).toContain("tv_featured: entry.tv_featured, tv_credit: entry.tv_featured ? entry.tv_credit.trim() : ''")
    expect(form).toContain('tv_show_featured: artistEntries.some(e => e.tv_featured)')
    expect(form).not.toContain('tv_show_flag')
  })
  it('admin screens no longer edit the application-level answer', () => {
    expect(read('src/components/admin/ApplicationEditorForm.tsx')).not.toMatch(/tv_show(_featured)?:/)
    expect(read('src/app/admin/booths/[id]/page.tsx')).not.toContain('profile.tv_show')
  })
  it('the directory and admin read through lib/tv-show', () => {
    expect(read('src/app/directory/page.tsx')).toContain('publicTvShows(e)')
    expect(read('src/app/directory/[id]/page.tsx')).toContain('artistTv(e, i)')
    expect(read('src/app/admin/applications/page.tsx')).toContain('unattributedTv(app)')
    expect(read('src/app/admin/print/page.tsx')).toContain('artistTvLabel(artistTv(app, i))')
  })
  it('completing a roster in the portal keeps every saved artist key', () => {
    const panel = read('src/components/portal/RosterCompletionPanel.tsx')
    expect(panel).toContain('...base,')
    expect(panel).toContain('required={!a.hasId}')
  })
})
