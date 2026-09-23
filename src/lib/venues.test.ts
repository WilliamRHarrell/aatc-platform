import { describe, it, expect } from 'vitest'
import { venueLinks, mapsUrl, isPreConvention, weekdaySlug, nightLabel, type VenueLite } from '@/lib/venues'

const base: VenueLite = {
  name: 'Club Luna', slug: 'club-luna', blurb: '', address: null, phone: null,
  website_url: null, instagram_url: null, instagram_label: null, facebook_url: null, tiktok_url: null, logo_slot: null,
}

describe('venueLinks', () => {
  it('returns only the links that exist, in website/instagram/facebook/tiktok order', () => {
    const links = venueLinks({ ...base, website_url: 'https://uptownsfay.com', instagram_url: 'https://www.instagram.com/uptownsfay/', facebook_url: 'https://www.facebook.com/UptownsFay' })
    expect(links.map(l => l.kind)).toEqual(['website', 'instagram', 'facebook'])
    expect(links[1].label).toBe('Club Luna on Instagram')
  })
  it('a label with no Instagram URL yields no Instagram link at all', () => {
    const links = venueLinks({ ...base, instagram_label: 'Club Luna on Instagram (via Dad Bod District)', facebook_url: 'https://www.facebook.com/profile.php?id=1' })
    expect(links.map(l => l.kind)).toEqual(['facebook'])
  })
  it('instagram_label overrides the default label when the URL exists', () => {
    const links = venueLinks({ ...base, instagram_url: 'https://www.instagram.com/dadboddistrict/', instagram_label: 'Club Luna on Instagram (via Dad Bod District)' })
    expect(links[0].label).toBe('Club Luna on Instagram (via Dad Bod District)')
  })
  it('refuses non-http URLs', () => {
    expect(venueLinks({ ...base, website_url: 'javascript:alert(1)' })).toEqual([])
  })
})

describe('mapsUrl', () => {
  it('encodes the address into a Google Maps search', () => {
    expect(mapsUrl('1707 Owen Dr, Fayetteville, NC 28304')).toBe('https://www.google.com/maps/search/?api=1&query=1707%20Owen%20Dr%2C%20Fayetteville%2C%20NC%2028304')
  })
})

describe('isPreConvention', () => {
  it('is true only for days strictly before the event start date', () => {
    expect(isPreConvention('2027-04-15', '2027-04-16')).toBe(true)
    expect(isPreConvention('2027-04-16', '2027-04-16')).toBe(false)
    expect(isPreConvention('2027-04-18', '2027-04-16')).toBe(false)
  })
})

describe('weekdaySlug and nightLabel', () => {
  it('derive from the calendar date, rebuilt from parts (no UTC drift)', () => {
    expect(weekdaySlug('2027-04-15')).toBe('after-party-thursday')
    expect(weekdaySlug('2027-04-18')).toBe('after-party-sunday')
    expect(nightLabel('2027-04-15')).toEqual({ night: 'Thursday', date: 'April 15' })
  })
})
