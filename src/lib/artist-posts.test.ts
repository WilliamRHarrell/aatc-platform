import { describe, it, expect } from 'vitest'
import {
  boothText, defaultCaption, easternToUtcIso, isStuckSending, mediaItems,
  validateSend, STUCK_SENDING_MS, TICKETS_DOMAIN,
} from '@/lib/artist-posts'
import { EVENT_DATES_LABEL, EVENT_NAME, EVENT_YEAR, VENUE_NAME } from '@/lib/event-config'
import { AATC_POSTIZ_CHANNELS } from '@/lib/postiz-channels'

describe('boothText', () => {
  it('no booths: empty, so the caption reads cleanly without one', () => {
    expect(boothText([])).toBe('')
  })
  it('one booth', () => {
    expect(boothText(['126'])).toBe(' - find them at Booth 126')
  })
  it('consecutive numbers collapse to a range', () => {
    expect(boothText(['143', '142', '145', '144'])).toBe(' - find them at Booths 142-145')
  })
  it('non-consecutive numbers are listed', () => {
    expect(boothText(['142', '126'])).toBe(' - find them at Booths 126, 142')
  })
  it('a run plus a stray lists the range and the stray', () => {
    expect(boothText(['126', '142', '143'])).toBe(' - find them at Booths 126, 142-143')
  })
  it('duplicates and blanks are dropped; non-numeric booths are kept verbatim', () => {
    expect(boothText(['126', '126', ' ', 'A1'])).toBe(' - find them at Booths 126, A1')
  })
})

describe('defaultCaption', () => {
  const caption = defaultCaption('b_tat', ['126'])
  it('names the artist and the booth', () => {
    expect(caption).toContain('Work by @b_tat - find them at Booth 126.')
  })
  it('reads the dates, venue and name from event-config (no second copy)', () => {
    expect(caption).toContain(`${EVENT_NAME}, ${EVENT_DATES_LABEL} at the ${VENUE_NAME}`)
    expect(caption).toContain(`#AATC${EVENT_YEAR}`)
  })
  it('tickets line uses the production domain', () => {
    expect(caption).toContain(`Tickets: ${TICKETS_DOMAIN}`)
    expect(TICKETS_DOMAIN).not.toContain('localhost')
  })
  it('contains no em or en dash (prebuild guard: site copy uses hyphens)', () => {
    // The characters are built numerically: the guard bans them in src/ in every spelling.
    const emEn = new RegExp(`[${String.fromCharCode(8211)}${String.fromCharCode(8212)}]`)
    expect(caption).not.toMatch(emEn)
  })
})

describe('easternToUtcIso', () => {
  it('EDT: 18:30 New York = 22:30 UTC', () => {
    expect(easternToUtcIso(`${EVENT_YEAR - 1}-07-01T18:30`)).toBe(`${EVENT_YEAR - 1}-07-01T22:30:00.000Z`)
  })
  it('EST: 18:30 New York = 23:30 UTC', () => {
    expect(easternToUtcIso(`${EVENT_YEAR - 1}-01-15T18:30`)).toBe(`${EVENT_YEAR - 1}-01-15T23:30:00.000Z`)
  })
  it('rejects anything that is not a datetime-local value', () => {
    expect(easternToUtcIso('tomorrow')).toBeNull()
    expect(easternToUtcIso('')).toBeNull()
  })
})

describe('isStuckSending', () => {
  const now = Date.now()
  it('only sending rows can be stuck', () => {
    expect(isStuckSending('failed', new Date(now - 2 * STUCK_SENDING_MS).toISOString(), now)).toBe(false)
  })
  it('fresh sending is not stuck; quiet past 15 minutes is', () => {
    expect(isStuckSending('sending', new Date(now - STUCK_SENDING_MS / 2).toISOString(), now)).toBe(false)
    expect(isStuckSending('sending', new Date(now - STUCK_SENDING_MS - 1000).toISOString(), now)).toBe(true)
  })
  it('sending with no timestamp (102 not applied yet) shows the retry', () => {
    expect(isStuckSending('sending', null, now)).toBe(true)
  })
})

describe('mediaItems', () => {
  it('keeps bucket-relative paths and sizes, drops junk', () => {
    expect(mediaItems([
      { path: 'b_tat/SHORT/0.mp4', type: 'video', width: 1080, height: 1920 },
      { path: '', type: 'image' },
      'nope',
    ])).toEqual([{ path: 'b_tat/SHORT/0.mp4', type: 'video', width: 1080, height: 1920 }])
  })
  it('anything that is not an array is empty', () => {
    expect(mediaItems(null)).toEqual([])
    expect(mediaItems({})).toEqual([])
  })
})

describe('validateSend', () => {
  const base = { id: 'x', caption: 'hello', channels: [AATC_POSTIZ_CHANNELS[0].id], collab: true }
  it('a draft needs no time', () => {
    expect(validateSend({ ...base, mode: 'draft' })).toEqual({ ok: true, scheduledAtUtc: null })
  })
  it('refuses an empty caption, no channels, and a channel off the allow list', () => {
    expect(validateSend({ ...base, mode: 'draft', caption: '  ' }).ok).toBe(false)
    expect(validateSend({ ...base, mode: 'draft', channels: [] }).ok).toBe(false)
    expect(validateSend({ ...base, mode: 'draft', channels: ['intruder'] }).ok).toBe(false)
  })
  it('a schedule must have a future New York time, returned as UTC', () => {
    const missing = validateSend({ ...base, mode: 'schedule' })
    expect(missing.ok).toBe(false)
    const past = validateSend({ ...base, mode: 'schedule', scheduledLocal: `${EVENT_YEAR - 7}-01-01T10:00` })
    expect(past.ok).toBe(false)
    const future = validateSend({ ...base, mode: 'schedule', scheduledLocal: `${EVENT_YEAR + 1}-01-01T10:00` })
    expect(future).toEqual({ ok: true, scheduledAtUtc: `${EVENT_YEAR + 1}-01-01T15:00:00.000Z` })
  })
})
