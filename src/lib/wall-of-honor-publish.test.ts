import { describe, it, expect } from 'vitest'
import { canPublish, shouldSendPublishEmail, groupByEventYear } from '@/lib/wall-of-honor-publish'
import { wallOfHonorPublishedEmail } from '@/lib/email-templates'
import { WALL_OF_HONOR_EMAIL } from '@/lib/event-config'

describe('canPublish', () => {
  it('is ok when approved with at least one photo', () => {
    expect(canPublish({ status: 'approved', branch: 'Army', photo_paths: ['a.jpg'] })).toEqual({ ok: true })
  })
  it('names a distinct gap for each blocked case', () => {
    const pending = canPublish({ status: 'pending', branch: 'Army', photo_paths: ['a.jpg'] })
    const noPhoto = canPublish({ status: 'approved', branch: 'Army', photo_paths: [] })
    const rejected = canPublish({ status: 'rejected', branch: 'Army', photo_paths: ['a.jpg'] })
    for (const r of [pending, noPhoto, rejected]) expect(r.ok).toBe(false)
    const reasons = [pending, noPhoto, rejected].map(r => (r.ok ? '' : r.reason))
    expect(new Set(reasons).size).toBe(3)
    expect(reasons.every(r => r.length > 0)).toBe(true)
  })
})

describe('canPublish branch', () => {
  it('refuses an empty or whitespace branch with the branch reason', () => {
    for (const branch of ['', '  ']) {
      expect(canPublish({ status: 'approved', branch, photo_paths: ['a.jpg'] })).toEqual({ ok: false, reason: 'Fill in the branch first.' })
    }
  })
  it('is ok with a branch', () => {
    expect(canPublish({ status: 'approved', branch: 'Army', photo_paths: ['a.jpg'] })).toEqual({ ok: true })
  })
})

describe('shouldSendPublishEmail', () => {
  const base = { imported_at: null, published_email_sent_at: null, submitter_email: 'a@b.co' }
  it('is true for a fresh online tribute with an email', () => {
    expect(shouldSendPublishEmail(base)).toBe(true)
  })
  it('is false for imported tributes', () => {
    expect(shouldSendPublishEmail({ ...base, imported_at: '2026-01-01T00:00:00Z' })).toBe(false)
  })
  it('is false when already sent', () => {
    expect(shouldSendPublishEmail({ ...base, published_email_sent_at: '2026-01-01T00:00:00Z' })).toBe(false)
  })
  it('is false with no email', () => {
    expect(shouldSendPublishEmail({ ...base, submitter_email: '' })).toBe(false)
  })
})

describe('groupByEventYear', () => {
  it('orders years descending, nulls last, keeping input order within a year', () => {
    const rows = [
      { id: 'a', event_year: 2027 }, { id: 'b', event_year: 2026 },
      { id: 'c', event_year: 2027 }, { id: 'd', event_year: null },
    ]
    const groups = groupByEventYear(rows)
    expect(groups.map(g => g.year)).toEqual([2027, 2026, null])
    expect(groups[0].rows.map(r => r.id)).toEqual(['a', 'c'])
    expect(groups[1].rows.map(r => r.id)).toEqual(['b'])
    expect(groups[2].rows.map(r => r.id)).toEqual(['d'])
  })
  it('returns no groups for no rows', () => {
    expect(groupByEventYear([])).toEqual([])
  })
})

describe('wallOfHonorPublishedEmail', () => {
  const html = wallOfHonorPublishedEmail({ honoreeName: 'John Smith', submitterName: 'Jane', wallUrl: 'https://www.example.com/wall-of-honor' })
  it('names the honoree, links the wall, and uses the wall contact address', () => {
    expect(html).toContain('John Smith')
    expect(html).toContain('href="https://www.example.com/wall-of-honor"')
    expect(html).toContain(WALL_OF_HONOR_EMAIL)
    expect(html).toContain('Jane')
  })
  it('escapes names', () => {
    const bad = wallOfHonorPublishedEmail({ honoreeName: '<b>x</b>', submitterName: 'J', wallUrl: 'https://e.co' })
    expect(bad).not.toContain('<b>x</b>')
  })
})
