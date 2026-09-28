/**
 * GoHighLevel (LeadConnector) API - newsletter signups. SERVER ONLY: the token
 * is read from process.env here and never leaves the server.
 *
 * Env (set in Vercel): GHL_API_TOKEN (a Private Integration token with the
 * `contacts.write` scope, nothing else) and GHL_LOCATION_ID.
 *
 * TWO CALLS, ON PURPOSE. POST /contacts/upsert has a `tags` field, but it
 * "will overwrite all current tags associated with the contact" (GHL docs), so
 * tagging through it would strip an existing contact's other tags. The upsert
 * sends no tags; POST /contacts/:id/tags then ADDS "newsletter".
 */
export const GHL_BASE = 'https://services.leadconnectorhq.com'
/** API version header for the contacts endpoints. Confirm on the first live call. */
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

export type SubscribeResult =
  | { ok: true; contactId: string; created: boolean }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'upstream'; detail: string }

type Fetch = typeof fetch

export async function subscribeToNewsletter(
  email: string,
  opts: { env?: Record<string, string | undefined>; fetchImpl?: Fetch } = {},
): Promise<SubscribeResult> {
  const env = opts.env ?? process.env
  const token = env.GHL_API_TOKEN
  const locationId = env.GHL_LOCATION_ID
  if (!token || !locationId) return { ok: false, reason: 'not_configured' }
  const f = opts.fetchImpl ?? fetch

  const headers = {
    Authorization: `Bearer ${token}`,
    Version: GHL_API_VERSION,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const call = async (path: string, body: unknown) => {
    const res = await f(`${GHL_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) })
    const text = await res.text()
    let json: unknown = null
    try { json = JSON.parse(text) } catch { /* non-JSON error body */ }
    return { res, json, text }
  }

  try {
    const up = await call('/contacts/upsert', { locationId, email, source: NEWSLETTER_SOURCE })
    const contact = (up.json as { contact?: { id?: string }; new?: boolean } | null)
    const contactId = contact?.contact?.id
    if (!up.res.ok || !contactId) {
      return { ok: false, reason: 'upstream', detail: `upsert ${up.res.status}: ${up.text.slice(0, 300)}` }
    }
    const tag = await call(`/contacts/${encodeURIComponent(contactId)}/tags`, { tags: [NEWSLETTER_TAG] })
    if (!tag.res.ok) {
      return { ok: false, reason: 'upstream', detail: `tags ${tag.res.status}: ${tag.text.slice(0, 300)}` }
    }
    return { ok: true, contactId, created: contact?.new === true }
  } catch (e) {
    return { ok: false, reason: 'upstream', detail: String(e instanceof Error ? e.message : e) }
  }
}
