import { describe, it, expect } from 'vitest'
import {
  parseBucket, entryPath, entryUrl, judgingIso, buildTimeline, entryAlt, ogImageFor, mediaPublicUrl,
  normalizeInstagram, safeHttpUrl,
} from '@/lib/tattoo-battle'
import { BUCKET_COUNT, QR_BASE_URL } from '@/lib/tattoo-battle-config'

describe('parseBucket', () => {
  it('accepts 1 and BUCKET_COUNT (the boundaries themselves)', () => {
    expect(parseBucket('1')).toBe(1)
    expect(parseBucket(String(BUCKET_COUNT))).toBe(BUCKET_COUNT)
  })
  it('rejects 0, BUCKET_COUNT+1, leading zeros, whitespace, letters, empty', () => {
    expect(parseBucket('0')).toBeNull()
    expect(parseBucket(String(BUCKET_COUNT + 1))).toBeNull()
    expect(parseBucket('07')).toBeNull()
    expect(parseBucket(' 7')).toBeNull()
    expect(parseBucket('7abc')).toBeNull()
    expect(parseBucket('')).toBeNull()
  })
})

describe('entry urls', () => {
  it('builds the path and the fixed-host URL', () => {
    expect(entryPath(3)).toBe('/tattoo-battle/entry/3')
    expect(entryUrl(3)).toBe(`${QR_BASE_URL}/tattoo-battle/entry/3`)
    expect(QR_BASE_URL).toBe('https://www.allamericantattooconvention.com')
  })
})

describe('judgingIso', () => {
  it('adds the duration and keeps the offset', () => {
    expect(judgingIso('2027-04-16T13:00:00-04:00', 4)).toBe('2027-04-16T17:00:00-04:00')
  })
})

const rows = [
  { title: 'All American Tattoo Battle Begins', day_date: '2027-04-16', start_time: '13:00:00' },
  { title: 'Tattoo Battle Ends - Voting Opens', day_date: '2027-04-16', start_time: '17:00:00' },
  { title: 'All American Tattoo Battle Champion Crowned', day_date: '2027-04-18', start_time: '18:00:00' },
]

describe('buildTimeline', () => {
  it('produces six steps with schedule-sourced times and no mismatch', () => {
    const { steps, mismatch } = buildTimeline(rows, { startIso: '2027-04-16T13:00:00-04:00', durationHours: 4 })
    expect(mismatch).toBeNull()
    expect(steps).toHaveLength(6)
    expect(steps[2].when).toBe('Friday, April 16 · 1:00 PM')
    expect(steps[3].when).toBe('Friday, April 16 · 5:00 PM')
    expect(steps[5].when).toBe('Sunday, April 18 · 6:00 PM')
  })
  it('prefers the schedule row when the derived judging time disagrees', () => {
    const drifted = rows.map(r => r.title.includes('Voting') ? { ...r, start_time: '17:30:00' } : r)
    const { steps, mismatch } = buildTimeline(drifted, { startIso: '2027-04-16T13:00:00-04:00', durationHours: 4 })
    expect(steps[3].when).toBe('Friday, April 16 · 5:30 PM')
    expect(mismatch).toContain('17:30')
  })
  it('falls back to the derived judging time when the row is missing', () => {
    const { steps, mismatch } = buildTimeline(rows.filter(r => !r.title.includes('Voting')), { startIso: '2027-04-16T13:00:00-04:00', durationHours: 4 })
    expect(steps[3].when).toBe('Friday, April 16 · 5:00 PM')
    expect(mismatch).toContain('missing')
  })
})

describe('entryAlt', () => {
  it('uses the exact brief wording', () => {
    expect(entryAlt(4, 'Jane Doe')).toBe('Tattoo Battle entry, Bucket #4, by Jane Doe')
  })
})

describe('ogImageFor', () => {
  it('returns the first IMAGE item, skipping a leading video', () => {
    const media = [
      { type: 'video' as const, path: 'e/bucket-01/a.mp4', poster_path: 'e/bucket-01/a-poster.jpg' },
      { type: 'image' as const, path: 'e/bucket-01/b.jpg' },
    ]
    expect(ogImageFor(media, 'FALLBACK')).toBe(mediaPublicUrl('e/bucket-01/b.jpg'))
  })
  it('uses the fallback when there is no image item', () => {
    expect(ogImageFor([{ type: 'video', path: 'x.mp4' }], 'FALLBACK')).toBe('FALLBACK')
    expect(ogImageFor([], 'FALLBACK')).toBe('FALLBACK')
  })
})

describe('normalizeInstagram', () => {
  it('strips @, whitespace and anything outside the handle alphabet, capped at 30', () => {
    expect(normalizeInstagram('@some.artist_1')).toBe('some.artist_1')
    expect(normalizeInstagram(' @Some.Artist ')).toBe('Some.Artist')
    expect(normalizeInstagram('explore/tags/x?y#z')).toBe('exploretagsxyz')
    expect(normalizeInstagram('a'.repeat(40))).toHaveLength(30)
    expect(normalizeInstagram('')).toBe('')
  })
})

describe('safeHttpUrl', () => {
  it('passes http(s) URLs and refuses anything else', () => {
    expect(safeHttpUrl('https://wholelifeaftercare.com/')).toBe('https://wholelifeaftercare.com/')
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com')
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('  HTTPS://x.y ')).toBe('HTTPS://x.y')
    expect(safeHttpUrl(null)).toBeNull()
    expect(safeHttpUrl('')).toBeNull()
  })
})
