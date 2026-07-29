/**
 * Client-side helper: ask the server to purge the static cache after an admin
 * save. Fire-and-report — a failure here means the edit is saved but the public
 * page shows it on the normal 60s window instead of immediately, so it warns
 * rather than erroring.
 */
export async function requestRevalidate(opts: { paths?: string[]; tags?: string[] } = {}): Promise<boolean> {
  try {
    const res = await fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: opts.paths ?? ['/'], tags: opts.tags ?? [] }),
    })
    return res.ok
  } catch {
    return false
  }
}
