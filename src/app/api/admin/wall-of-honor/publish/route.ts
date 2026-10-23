import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase-server'
import { canPublish, shouldSendPublishEmail } from '@/lib/wall-of-honor-publish'
import { WOH_SUBMISSIONS_BUCKET, WOH_PUBLIC_BUCKET } from '@/lib/wall-of-honor-submission'
import { wallOfHonorPublishedEmail } from '@/lib/email-templates'
import { sendTransactional } from '@/lib/transactional-email'
import { ROUTES } from '@/lib/routes'
import { SITE_URL } from '@/lib/site'
import type { Database } from '@/types/database'

/**
 * POST /api/admin/wall-of-honor/publish - admin-only, body { id, publish }.
 * Puts one Wall of Honor entry on the public wall, or takes it off (105).
 *
 * Auth is the /api/admin/food-truck-docs shape: the signed-in user's cookie
 * client proves the caller is an admin; the work then runs on the service-role
 * client, because it writes the public bucket and fields the 105 guard keeps
 * from everyone else.
 *
 * A publish spans files and a row, so ROLLBACK DIRECTION FOLLOWS WHICH FAILURE
 * IS VISIBLE (docs/handoff/rules.md). The row is the visible gate: the public
 * wall shows an entry only while is_published is true and reads its photos
 * from public_photo_paths.
 *  - Publish: copies first, then the row. A copy in the public bucket with no
 *    published row behind it is invisible on the wall, so a failed copy or a
 *    failed row update deletes the copies made and the row never changes. The
 *    reverse order could publish a row whose photos are missing.
 *  - Unpublish: the row first, then the deletes. Once the row is off the wall
 *    is right; a failed delete leaves files nobody links to, which is the
 *    lesser failure, so it returns 200 with a warning naming the paths still
 *    in the public bucket (the admin must see it and retry).
 *
 * The "now on the Wall" email never fails a publish: the row is the source of
 * truth, a send failure is logged and the answer says emailSent: false.
 * published_at is stamped by the 105 guard on the false to true transition and
 * is never sent from here.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WALL_TAG = 'wall-of-honor'

const service = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function revalidateWall() {
  revalidatePath(ROUTES.wallOfHonor)
  revalidateTag(WALL_TAG, { expire: 0 })
}

/** Delete public copies; returns the paths that could not be removed. */
async function removePublic(id: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return []
  const { error } = await service.storage.from(WOH_PUBLIC_BUCKET).remove(paths)
  if (error) {
    console.error(`[admin/wall-of-honor/publish] ${id}: could not remove ${WOH_PUBLIC_BUCKET}/${paths.join(', ')}: ${error.message}`)
    return paths
  }
  return []
}

/**
 * Publish rollback: delete this call's copies, unless another call has
 * published the entry since (the same paths are then its live photos).
 * Returns the paths still in the public bucket because a delete failed.
 */
async function rollbackCopies(id: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return []
  const { data, error } = await service.from('wall_of_honor_entries').select('is_published').eq('id', id).maybeSingle()
  if (error) {
    console.error(`[admin/wall-of-honor/publish] ${id}: re-read before rollback failed (${error.code}): ${error.message}; copies left in place`)
    return paths
  }
  if (data?.is_published) {
    console.warn(`[admin/wall-of-honor/publish] ${id}: another call published it meanwhile; copies kept`)
    return []
  }
  return removePublic(id, paths)
}

/** A rolled-back publish: 500, naming any copies the cleanup could not remove. */
function failedPublish(id: string, error: string, stillPublic: string[]) {
  if (stillPublic.length === 0) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({
    error: `${error}. These photos are still in the public bucket: ${stillPublic.join(', ')}. Unpublish this entry to clear them.`,
  }, { status: 500 })
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; publish?: unknown }
  const id = typeof body?.id === 'string' && UUID.test(body.id) ? body.id : null
  if (!id || typeof body.publish !== 'boolean') return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const publish = body.publish

  const { data: entry, error: readErr } = await service.from('wall_of_honor_entries')
    .select('id, status, is_published, published_at, photo_paths, public_photo_paths, honoree_name, submitter_name, submitter_email, imported_at, published_email_sent_at')
    .eq('id', id).maybeSingle()
  if (readErr) {
    console.error(`[admin/wall-of-honor/publish] ${id}: read failed (${readErr.code}): ${readErr.message}`)
    return NextResponse.json({ error: 'Could not read that tribute' }, { status: 500 })
  }
  if (!entry) return NextResponse.json({ error: 'Tribute not found' }, { status: 404 })

  // ---------- Unpublish: row first, then the public files ----------
  if (!publish) {
    if (entry.is_published) {
      const { error: updErr } = await service.from('wall_of_honor_entries')
        .update({ is_published: false, public_photo_paths: [] }).eq('id', id)
      if (updErr) {
        console.error(`[admin/wall-of-honor/publish] ${id}: unpublish update failed (${updErr.code}): ${updErr.message}`)
        return NextResponse.json({ error: 'The tribute is still on the wall; unpublish did not save' }, { status: 500 })
      }
    }
    // Also runs when already unpublished: a retry clears copies an earlier
    // failed delete left behind (removing a missing object is not an error).
    // Re-read first: a publish that landed since our read owns these paths
    // now, and deleting them would break a live entry.
    const { data: now, error: rereadErr } = await service.from('wall_of_honor_entries')
      .select('is_published').eq('id', id).maybeSingle()
    if (rereadErr || !now || now.is_published) {
      if (rereadErr) console.error(`[admin/wall-of-honor/publish] ${id}: re-read before delete failed (${rereadErr.code}): ${rereadErr.message}`)
      revalidateWall()
      return NextResponse.json({
        is_published: now?.is_published ?? false,
        published_at: entry.published_at,
        emailSent: false,
        warning: now?.is_published
          ? 'Another publish landed while unpublishing; the tribute is on the wall. Unpublish again if that is not intended.'
          : 'Unpublished, but the public photos were not checked or removed. Unpublish again to retry.',
      })
    }
    const paths = [...new Set([...entry.public_photo_paths, ...entry.photo_paths])]
    const stillPublic = await removePublic(id, paths)
    revalidateWall()
    return NextResponse.json({
      is_published: false,
      // The 105 guard keeps published_at on unpublish, so the read value stands.
      published_at: entry.published_at,
      emailSent: false,
      ...(stillPublic.length > 0 && {
        warning: `Unpublished, but these photos are still in the public bucket: ${stillPublic.join(', ')}. Unpublish again to retry.`,
      }),
    })
  }

  // ---------- Publish: copies first, then the row ----------
  if (entry.is_published) {
    revalidateWall()
    return NextResponse.json({ is_published: true, published_at: entry.published_at, emailSent: false })
  }

  const gate = canPublish({ status: entry.status, photo_paths: entry.photo_paths })
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 409 })

  // Same path in the public bucket, so public_photo_paths stays under the
  // entry's own folder (104 CHECK).
  const paths = entry.photo_paths
  const copied: string[] = []
  for (const path of paths) {
    const { data: blob, error: dlErr } = await service.storage.from(WOH_SUBMISSIONS_BUCKET).download(path)
    // A 0-byte object is a failed or empty upload, never a photo for the wall.
    if (dlErr || !blob || blob.size === 0) {
      console.error(`[admin/wall-of-honor/publish] ${id}: could not read ${WOH_SUBMISSIONS_BUCKET}/${path}: ${dlErr?.message ?? (blob ? 'empty object' : 'no data')}`)
      return failedPublish(id, 'A photo could not be copied to the wall; nothing was published', await rollbackCopies(id, copied))
    }
    const { error: upErr } = await service.storage.from(WOH_PUBLIC_BUCKET)
      .upload(path, blob, { contentType: blob.type || undefined, upsert: true })
    if (upErr) {
      console.error(`[admin/wall-of-honor/publish] ${id}: could not write ${WOH_PUBLIC_BUCKET}/${path}: ${upErr.message}`)
      return failedPublish(id, 'A photo could not be copied to the wall; nothing was published', await rollbackCopies(id, copied))
    }
    copied.push(path)
  }

  // Conditional on is_published = false: when two calls race, exactly one
  // flips the row. The loser gets no row and no error, must NOT clean up (the
  // paths are the winner's live photos) and must not mail (the winner does).
  // The failure branches above and below go through rollbackCopies, which
  // re-checks is_published so a loser never deletes a winner's live photos.
  const { data: updated, error: updErr } = await service.from('wall_of_honor_entries')
    .update({ is_published: true, public_photo_paths: paths }).eq('id', id).eq('is_published', false)
    .select('published_at').maybeSingle()
  if (updErr) {
    console.error(`[admin/wall-of-honor/publish] ${id}: publish update failed (${updErr.code}): ${updErr.message}`)
    return failedPublish(id, 'The tribute did not publish; please try again', await rollbackCopies(id, paths))
  }
  if (!updated) {
    const { data: winner } = await service.from('wall_of_honor_entries').select('published_at').eq('id', id).maybeSingle()
    revalidateWall()
    return NextResponse.json({ is_published: true, published_at: winner?.published_at ?? null, emailSent: false })
  }

  let emailSent = false
  if (shouldSendPublishEmail(entry)) {
    try {
      await sendTransactional(entry.submitter_email, `Your tribute to ${entry.honoree_name} is on the Wall of Honor`,
        wallOfHonorPublishedEmail({
          honoreeName: entry.honoree_name,
          submitterName: entry.submitter_name,
          wallUrl: `${SITE_URL}${ROUTES.wallOfHonor}`,
        }))
      emailSent = true
    } catch (e) {
      console.error(`[admin/wall-of-honor/publish] ${id} published but the submitter email failed: ${String(e)}`)
    }
    if (emailSent) {
      const { error: flagErr } = await service.from('wall_of_honor_entries')
        .update({ published_email_sent_at: new Date().toISOString() }).eq('id', id)
      if (flagErr) {
        console.error(`[admin/wall-of-honor/publish] ${id}: email sent but published_email_sent_at not saved (${flagErr.code}): ${flagErr.message}; a republish would send it again`)
      }
    }
  }

  revalidateWall()
  return NextResponse.json({ is_published: true, published_at: updated.published_at, emailSent })
}
