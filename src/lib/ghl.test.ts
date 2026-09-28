import { describe, it, expect } from 'vitest'
import { normaliseEmail, subscribeToNewsletter, tagsIn, GHL_BASE, NEWSLETTER_TAG, NEWSLETTER_SOURCE } from './ghl'

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
    expect(await subscribeToNewsletter('zz@example.com', { env: {}, fetchImpl: f })).toEqual({ ok: false, reason: 'not_configured', steps: [] })
    expect(calls).toHaveLength(0)
  })

  it('NEW contact: plain upsert, then an upsert carrying the tag (nothing to overwrite)', async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { new: true, contact: { id: 'c-9' } } }, { status: 200, body: { new: false, contact: { id: 'c-9' } } }])
    const r = await subscribeToNewsletter('zz@example.com', { env: ENV, fetchImpl: f })
    expect(r).toMatchObject({ ok: true, contactId: 'c-9', created: true, tagged: true })
    expect(calls.map(c => c.url)).toEqual([`${GHL_BASE}/contacts/upsert`, `${GHL_BASE}/contacts/upsert`])
    const first = JSON.parse(String(calls[0].init.body))
    expect(first).toEqual({ locationId: 'loc-1', email: 'zz@example.com', source: NEWSLETTER_SOURCE })
    expect(JSON.parse(String(calls[1].init.body)).tags).toEqual([NEWSLETTER_TAG])
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer pit-test')
  })

  it('EXISTING contact: never tags through upsert (it would replace their tags); adds via /tags', async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { new: false, contact: { id: 'c-9' } } }, { status: 201, body: { tags: ['vip', NEWSLETTER_TAG] } }])
    const r = await subscribeToNewsletter('zz@example.com', { env: ENV, fetchImpl: f })
    expect(r).toMatchObject({ ok: true, created: false, tagged: true })
    expect('tags' in JSON.parse(String(calls[0].init.body))).toBe(false)
    expect(calls[1].url).toBe(`${GHL_BASE}/contacts/c-9/tags`)
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ tags: [NEWSLETTER_TAG] })
  })

  it('a 2xx from /tags without the tag in its response is NOT a success (the production failure)', async () => {
    const { f } = fakeFetch([{ status: 200, body: { new: false, contact: { id: 'c-9' } } }, { status: 201, body: { tags: [] } }])
    const r = await subscribeToNewsletter('zz@example.com', { env: ENV, fetchImpl: f })
    expect(r).toMatchObject({ ok: true, tagged: false })
    expect(r.ok && r.tagError).toMatch(/not in the returned tags/)
    expect(r.steps.map(s => [s.call, s.status])).toEqual([['upsert', 200], ['add-tags', 201]])
  })

  it('the Version header can be overridden (admin test)', async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { new: true, contact: { id: 'c-1' } } }, { status: 200, body: {} }])
    await subscribeToNewsletter('zz@example.com', { env: ENV, fetchImpl: f, version: 'v3' })
    expect((calls[0].init.headers as Record<string, string>).Version).toBe('v3')
  })

  it('reports an upstream failure with its status, never throws', async () => {
    const { f } = fakeFetch([{ status: 401, body: { message: 'Invalid JWT' } }])
    const r = await subscribeToNewsletter('zz@example.com', { env: ENV, fetchImpl: f })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason === 'upstream' && r.detail).toMatch(/^upsert 401/)
  })

  it('a failed tag call keeps the contact but reports the tag error with GHL\'s status', async () => {
    const { f } = fakeFetch([{ status: 200, body: { new: true, contact: { id: 'c-1' } } }, { status: 422, body: { message: 'bad' } }])
    const r = await subscribeToNewsletter('zz@example.com', { env: ENV, fetchImpl: f })
    expect(r).toMatchObject({ ok: true, tagged: false })
    expect(r.ok && r.tagError).toMatch(/^upsert-with-tag 422/)
  })

  it('tagsIn reads both response shapes', () => {
    expect(tagsIn({ tags: ['Newsletter'] })).toEqual(['newsletter'])
    expect(tagsIn({ contact: { tags: ['a'] } })).toEqual(['a'])
    expect(tagsIn({})).toBeNull()
  })
})
