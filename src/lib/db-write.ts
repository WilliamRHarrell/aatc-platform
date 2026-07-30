/**
 * Guarded self-service writes.
 *
 * PostgREST does not error when RLS filters a write to nothing — it returns
 * `data: []` with `error: null`. Three separate features shipped broken because
 * of this and looked like they were working:
 *
 *   sponsor self-claim   updated 0 rows, silently, since sponsorships has no
 *                        owner UPDATE policy
 *   roster completion    updated 0 rows, silently, since applications had no
 *                        owner UPDATE policy (migration 041) — and needs_roster
 *                        is half the directory gate, so nobody would ever have
 *                        become directory-eligible
 *   contest voting       inserts a vote and never checks it landed
 *
 * The shape that hides it is a write with no `.select()`: without one there is
 * no returned row to count, so zero-affected is indistinguishable from success.
 *
 * Usage — always chain `.select()` on the query you pass in:
 *
 *   await guardedWrite(
 *     supabase.from('applications').update({ … }).eq('id', id).select('id'),
 *     'Could not save your roster',
 *   )
 */
export interface WriteResult<T> {
  ok: boolean
  data: T[]
  error: string | null
}

interface PostgrestLike<T> {
  data: T[] | null
  error: { message: string; code?: string } | null
}

export async function guardedWrite<T>(
  query: PromiseLike<PostgrestLike<T>>,
  friendlyMessage: string,
  context?: string,
): Promise<WriteResult<T>> {
  const { data, error } = await query

  if (error) {
    console.error(`[write] ${context ?? friendlyMessage}: ${error.code ?? ''} ${error.message}`)
    return { ok: false, data: [], error: friendlyMessage }
  }

  const rows = data ?? []
  if (rows.length === 0) {
    // The silent case. Almost always a missing or too-narrow RLS policy.
    console.error(
      `[write] ${context ?? friendlyMessage}: 0 rows affected — no error returned. ` +
      'This is normally a missing owner policy, not a client bug.'
    )
    return {
      ok: false,
      data: [],
      error: `${friendlyMessage} — nothing was saved. Please contact us if this keeps happening.`,
    }
  }

  return { ok: true, data: rows, error: null }
}
