/**
 * GoHighLevel (LeadConnector) API - newsletter signups. SERVER ONLY: the token
 * is read from process.env here and never leaves the server.
 *
 * Env (set in Vercel): GHL_API_TOKEN (a Private Integration token; needs
 * `contacts.write`, plus `contacts.readonly` for the admin read-back in
 * /api/admin/newsletter-test) and GHL_LOCATION_ID.
 *
 * TAGGING. POST /contacts/upsert has a `tags` field, but it "will overwrite
 * all current tags associated with the contact" (GHL docs). So:
 *   - NEW contact (upsert says `new: true`): a second upsert carrying the tag.
 *     Safe, there are no tags to overwrite, and it is the call already proven
 *     to work with this token.
 *   - EXISTING contact: POST /contacts/:id/tags, which ADDS. Its response lists
 *     the contact's tags after the call; the tag counts as applied only if
 *     "newsletter" is in that list.
 * Production 2026-09-28 11:13 ET: a new contact was created with no tag while
 * the add-tags call returned 2xx (the route logged nothing, answered 200). A
 * 2xx alone is therefore not trusted any more.
 *
 * Every call is recorded (status + body, never the token) in `steps`, for the
 * route's logs and the admin test.
 */
export const GHL_BASE = 'https://services.leadconnectorhq.com'
/** API version header. The upsert works with it (production, 2026-09-28). */
export const GHL_API_VERSION = '2021-07-28'
export const NEWSLETTER_TAG = 'newsletter'
export const NEWSLETTER_SOURCE = 'website footer'

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/

/** One plausible address, lower-cased; null when it is not one. */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const e = raw.trim().toLowerCase()
  return e.length <= 254 && EMAIL.test(e) ? e : null
}

export interface GhlStep { call: string; status: number; body: string }

export type SubscribeResult =
  | { ok: true; contactId: string; created: boolean; tagged: boolean; tagError?: string; steps: GhlStep[] }
  | { ok: false; reason: 'not_configured'; steps: GhlStep[] }
  | { ok: false; reason: 'upstream'; detail: string; steps: GhlStep[] }

type Fetch = typeof fetch
interface Opts { env?: Record<string, string | undefined>; fetchImpl?: Fetch; version?: string }

function client(opts: Opts, steps: GhlStep[]) {
  const env = opts.env ?? process.env
  const token = env.GHL_API_TOKEN
  const locationId = env.GHL_LOCATION_ID
  if (!token || !locationId) return null
  const f = opts.fetchImpl ?? fetch
  const headers = {
    Authorization: `Bearer ${token}`,
    Version: opts.version ?? GHL_API_VERSION,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const call = async (name: string, method: 'GET' | 'POST', path: string, body?: unknown) => {
    const res = await f(`${GHL_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) })
    const text = await res.text()
    steps.push({ call: name, status: res.status, body: text.slice(0, 500) })
    let json: unknown = null
    try { json = JSON.parse(text) } catch { /* non-JSON body */ }
    return { ok: res.ok, status: res.status, json, text }
  }
  return { call, locationId }
}

/** Tags listed in a GHL response ({tags} from add-tags, {contact:{tags}} from a read). */
export function tagsIn(json: unknown): string[] | null {
  const j = json as { tags?: unknown; contact?: { tags?: unknown } } | null
  const t = Array.isArray(j?.tags) ? j?.tags : Array.isArray(j?.contact?.tags) ? j?.contact?.tags : null
  return t ? (t as unknown[]).filter((x): x is string => typeof x === 'string').map(x => x.toLowerCase()) : null
}

export async function subscribeToNewsletter(email: string, opts: Opts = {}): Promise<SubscribeResult> {
  const steps: GhlStep[] = []
  const g = client(opts, steps)
  if (!g) return { ok: false, reason: 'not_configured', steps }

  try {
    const up = await g.call('upsert', 'POST', '/contacts/upsert', { locationId: g.locationId, email, source: NEWSLETTER_SOURCE })
    const u = up.json as { contact?: { id?: string }; new?: boolean } | null
    const contactId = u?.contact?.id
    if (!up.ok || !contactId) return { ok: false, reason: 'upstream', detail: `upsert ${up.status}: ${up.text.slice(0, 300)}`, steps }
    const created = u?.new === true

    let tagError: string | undefined
    if (created) {
      const t = await g.call('upsert-with-tag', 'POST', '/contacts/upsert', { locationId: g.locationId, email, source: NEWSLETTER_SOURCE, tags: [NEWSLETTER_TAG] })
      if (!t.ok) tagError = `upsert-with-tag ${t.status}: ${t.text.slice(0, 300)}`
    } else {
      const t = await g.call('add-tags', 'POST', `/contacts/${encodeURIComponent(contactId)}/tags`, { tags: [NEWSLETTER_TAG] })
      const after = tagsIn(t.json)
      if (!t.ok) tagError = `add-tags ${t.status}: ${t.text.slice(0, 300)}`
      else if (!after?.includes(NEWSLETTER_TAG)) tagError = `add-tags ${t.status} but "${NEWSLETTER_TAG}" is not in the returned tags: ${t.text.slice(0, 300)}`
    }
    return { ok: true, contactId, created, tagged: !tagError, ...(tagError ? { tagError } : {}), steps }
  } catch (e) {
    return { ok: false, reason: 'upstream', detail: String(e instanceof Error ? e.message : e), steps }
  }
}

/** Read a contact's tags back (needs contacts.readonly). For the admin test only. */
export async function readContactTags(contactId: string, opts: Opts = {}): Promise<{ tags: string[] | null; step: GhlStep | null }> {
  const steps: GhlStep[] = []
  const g = client(opts, steps)
  if (!g) return { tags: null, step: null }
  try {
    const r = await g.call('read', 'GET', `/contacts/${encodeURIComponent(contactId)}`)
    return { tags: r.ok ? tagsIn(r.json) : null, step: steps[0] }
  } catch (e) {
    return { tags: null, step: { call: 'read', status: 0, body: String(e instanceof Error ? e.message : e) } }
  }
}
