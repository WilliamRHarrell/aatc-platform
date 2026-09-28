import { describe, it, expect } from 'vitest'
import { normaliseEmail, subscribeToNewsletter, GHL_BASE, NEWSLETTER_TAG, NEWSLETTER_SOURCE } from './ghl'

const ENV = { GHL_API_TOKEN: 'pit-test', GHL_LOCATION_ID: 'loc-1' }

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const r = responses[calls.length - 1] ?? { status: 500, body: {} }
    return new Response(JSON.stringify(r.body), { status: r.status })
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('normaliseEmail', () => {
  it('trims and lower-cases a valid address', () => { expect(normaliseEmail('  ZZ@Example.COM ')).toBe('zz@example.com') })
  it('refuses junk, lists and non-strings', () => {
    expect(normaliseEmail('nope')).toBeNull()
    expect(normaliseEmail('a@b.com,c@d.com')).toBeNull()
    expect(normaliseEmail(42)).toBeNull()
  })
})

describe('subscribeToNewsletter', () => {
  it('without env vars: not_configured, and no network call', async () => {
    const { f, calls } = fakeFetch([])
    expect(await subscribeToNewsletter('zz@example.com', { env: {}, fetchImpl: f })).toEqual({ ok: false, reason: 'not_configured' })
    expect(calls).toHaveLength(0)
  })

  it('upserts WITHOUT tags (they would replace existing ones), then adds the newsletter tag', async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { new: false, contact: { id: 'c-9' } } }, { status: 200, body: { tags: ['vip', NEWSLETTER_TAG] } }])
    const r = await subscribeToNewsletter('zz@example.com', { env: ENV, fetchImpl: f })
    expect(r).toEqual({ ok: true, contactId: 'c-9', created: false })

    expect(calls[0].url).toBe(`${GHL_BASE}/contacts/upsert`)
    const up = JSON.parse(String(calls[0].init.body))
    expect(up).toEqual({ locationId: 'loc-1', email: 'zz@example.com', source: NEWSLETTER_SOURCE })
    expect('tags' in up).toBe(false)
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer pit-test')

    expect(calls[1].url).toBe(`${GHL_BASE}/contacts/c-9/tags`)
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ tags: [NEWSLETTER_TAG] })
  })

  it('reports an upstream failure with its status, never throws', async () => {
    const { f } = fakeFetch([{ status: 401, body: { message: 'Invalid JWT' } }])
    const r = await subscribeToNewsletter('zz@example.com', { env: ENV, fetchImpl: f })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason === 'upstream' && r.detail).toMatch(/^upsert 401/)
  })

  it('a failed tag call is a failure too', async () => {
    const { f } = fakeFetch([{ status: 200, body: { new: true, contact: { id: 'c-1' } } }, { status: 422, body: {} }])
    const r = await subscribeToNewsletter('zz@example.com', { env: ENV, fetchImpl: f })
    expect(!r.ok && r.reason === 'upstream' && r.detail).toMatch(/^tags 422/)
  })
})
