/**
 * A link for a stored social value: a full URL as is, otherwise a handle or
 * page name on the platform. Admin overviews (sponsorships, food trucks).
 */
export function socialUrl(platform: 'instagram' | 'facebook', value: string): string {
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  const handle = v.replace(/^@/, '').replace(/^\/+/, '')
  return platform === 'instagram' ? `https://instagram.com/${handle}` : `https://facebook.com/${handle}`
}
