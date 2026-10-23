import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import { createServerClient } from '@/lib/supabase-server'
import { WOH_SUBMISSIONS_BUCKET } from '@/lib/wall-of-honor-submission'
import { uniqueFolderName, csvRow } from '@/lib/wall-of-honor-print'
import type { Database } from '@/types/database'

/**
 * GET /api/admin/wall-of-honor/print - admin-only. A zip of every entry that is
 * published and flagged include_in_print: one folder per honoree (original,
 * full-quality photos from the private bucket, numbered in photo_paths order,
 * plus tribute.txt) and wall-of-honor.csv at the root.
 *
 * Auth is the publish route's shape: the cookie client proves the caller is an
 * admin, then the work runs on the service-role client (the originals are in a
 * private bucket).
 *
 * The zip is built in an in-memory buffer; that is fine at this scale (tens of
 * honorees). The final print LAYOUT waits on the printer's specs (spec decision
 * 10); this is the originals + text export the spec defaulted to.
 *
 * One photo that will not download never fails the export: it is skipped,
 * logged, and listed in MISSING-PHOTOS.txt so the print shop knows.
 */
export const dynamic = 'force-dynamic'

const service = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CSV_HEADER = ['honoree_name', 'rank', 'branch', 'unit', 'service_years', 'event_year', 'photo_count', 'include_in_print']

/** File extension from a stored path, lowercased; 'jpg' when there is none. */
function extOf(path: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(path)
  return m ? m[1].toLowerCase() : 'jpg'
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: events, error: evErr } = await service.from('events').select('id, start_date')
  if (evErr) {
    console.error(`[admin/wall-of-honor/print] events read failed (${evErr.code}): ${evErr.message}`)
    return NextResponse.json({ error: 'Could not read events' }, { status: 500 })
  }
  const years = new Map<string, number>()
  for (const ev of events ?? []) {
    const y = ev.start_date ? new Date(ev.start_date).getUTCFullYear() : NaN
    if (!Number.isNaN(y)) years.set(ev.id, y)
  }

  const { data: rows, error: rowsErr } = await service.from('wall_of_honor_entries')
    .select('id, event_id, honoree_name, honoree_rank, branch, unit, service_years, tribute, tribute_display, photo_paths, include_in_print')
    .eq('is_published', true).eq('include_in_print', true)
  if (rowsErr) {
    console.error(`[admin/wall-of-honor/print] entries read failed (${rowsErr.code}): ${rowsErr.message}`)
    return NextResponse.json({ error: 'Could not read the wall entries' }, { status: 500 })
  }

  // Event year, then honoree name. Entries with no known year sort last.
  const entries = [...(rows ?? [])].sort((a, b) =>
    (years.get(a.event_id) ?? Infinity) - (years.get(b.event_id) ?? Infinity)
    || a.honoree_name.localeCompare(b.honoree_name))

  const zip = new JSZip()
  const csv: string[] = [csvRow(CSV_HEADER)]
  const missing: string[] = []
  const usedFolders = new Set<string>()

  for (const e of entries) {
    const year = years.get(e.event_id)
    const folderName = uniqueFolderName(year === undefined ? e.honoree_name : `${e.honoree_name} (${year})`, usedFolders)
    const folder = zip.folder(folderName)!

    folder.file('tribute.txt', [
      e.honoree_name,
      `Rank: ${e.honoree_rank ?? ''}`,
      `Branch: ${e.branch}`,
      `Unit: ${e.unit ?? ''}`,
      `Service years: ${e.service_years ?? ''}`,
      `Event year: ${year ?? ''}`,
      '',
      e.tribute_display ?? e.tribute,
    ].join('\n'))

    for (const [i, path] of e.photo_paths.entries()) {
      const { data: blob, error: dlErr } = await service.storage.from(WOH_SUBMISSIONS_BUCKET).download(path)
      if (dlErr || !blob || blob.size === 0) {
        console.error(`[admin/wall-of-honor/print] ${e.id}: could not read ${WOH_SUBMISSIONS_BUCKET}/${path}: ${dlErr?.message ?? (blob ? 'empty object' : 'no data')}`)
        missing.push(`${folderName}: ${path}`)
        continue
      }
      folder.file(`${String(i + 1).padStart(2, '0')}.${extOf(path)}`, await blob.arrayBuffer())
    }

    csv.push(csvRow([e.honoree_name, e.honoree_rank, e.branch, e.unit, e.service_years, year ?? '', e.photo_paths.length, e.include_in_print]))
  }

  zip.file('wall-of-honor.csv', csv.join('\r\n') + '\r\n')
  if (missing.length > 0) {
    zip.file('MISSING-PHOTOS.txt', ['These photos could not be downloaded and are not in this export:', '', ...missing].join('\n') + '\n')
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="wall-of-honor-print.zip"',
      'cache-control': 'no-store',
    },
  })
}
