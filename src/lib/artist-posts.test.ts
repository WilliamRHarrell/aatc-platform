import { describe, it, expect } from 'vitest'
import {
  boothText, defaultCaption, defaultYoutubeTitle, easternToUtcIso, isStuckSending, mediaItems,
  validateSend, STUCK_SENDING_MS, TICKETS_DOMAIN, YOUTUBE_TITLE_MAX,
} from '@/lib/artist-posts'
import { EVENT_DATES_LABEL, EVENT_NAME, EVENT_YEAR, VENUE_NAME } from '@/lib/event-config'
import { AATC_POSTIZ_CHANNELS, channelUnavailable, type PostizChannel } from '@/lib/postiz-channels'

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
  it('a vendor gets the shop first line; the rest is shared (103)', () => {
    const vendor = defaultCaption('getskinreserve', [], 'vendor')
    expect(vendor).toContain('Shop @getskinreserve.')
    expect(vendor).not.toContain('Work by')
    expect(vendor.split('\n').slice(1)).toEqual(caption.replace('b_tat - find them at Booth 126', 'b_tat').split('\n').slice(1))
  })
  it('vendor YouTube title says Shop; the artist default is unchanged (103)', () => {
    expect(defaultYoutubeTitle('getskinreserve', 'vendor')).toBe(`Shop @getskinreserve | ${EVENT_NAME}`)
    expect(defaultYoutubeTitle('b_tat', 'artist')).toBe(`Tattoo by @b_tat | ${EVENT_NAME}`)
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
    expect(validateSend({ ...base, mode: 'draft' })).toEqual({ ok: true, scheduledAtUtc: null, youtubeTitle: null })
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
    expect(future).toEqual({ ok: true, scheduledAtUtc: `${EVENT_YEAR + 1}-01-01T15:00:00.000Z`, youtubeTitle: null })
  })
})

describe('YouTube rules (tested with an injected channel so they hold regardless of the live list)', () => {
  const yt: PostizChannel = { id: 'yt-test', platform: 'youtube', label: 'YouTube', requires: 'video', requireHint: 'Videos only' }
  const withYt = [...AATC_POSTIZ_CHANNELS, yt]
  const base = { id: 'x', caption: 'hello', channels: ['yt-test'], collab: false, mode: 'draft' as const }

  it('default title names the artist and the event (event-config), capped at 100', () => {
    expect(defaultYoutubeTitle('b_tat')).toBe(`Tattoo by @b_tat | ${EVENT_NAME}`)
    expect(defaultYoutubeTitle('x'.repeat(120)).length).toBe(YOUTUBE_TITLE_MAX)
  })
  it('a YouTube send needs a title; it is trimmed and capped', () => {
    expect(validateSend(base, Date.now(), withYt)).toEqual({ ok: false, error: 'YouTube needs a title.' })
    const v = validateSend({ ...base, youtubeTitle: `  ${'t'.repeat(150)}  ` }, Date.now(), withYt)
    expect(v).toEqual({ ok: true, scheduledAtUtc: null, youtubeTitle: 't'.repeat(YOUTUBE_TITLE_MAX) })
  })
  it('no title travels without a YouTube channel', () => {
    const v = validateSend({ ...base, channels: [AATC_POSTIZ_CHANNELS[0].id], youtubeTitle: 'ignored' }, Date.now(), withYt)
    expect(v).toEqual({ ok: true, scheduledAtUtc: null, youtubeTitle: null })
  })
  it('channelUnavailable gates YouTube on video and Google Business on an image', () => {
    const gmb = AATC_POSTIZ_CHANNELS.find(c => c.platform === 'gmb')!
    expect(channelUnavailable(gmb, false, true)).toBe('Photo posts only')
    expect(channelUnavailable(gmb, true, true)).toBeNull()
    expect(channelUnavailable(yt, true, false)).toBe('Videos only')
    expect(channelUnavailable(yt, false, true)).toBeNull()
    const ig = AATC_POSTIZ_CHANNELS.find(c => c.platform === 'instagram')!
    expect(channelUnavailable(ig, false, false)).toBeNull()
  })
})
