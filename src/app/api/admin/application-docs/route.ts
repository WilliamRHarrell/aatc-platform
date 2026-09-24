import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import {
  DOCS_BUCKET, SIGNED_URL_TTL_SECONDS, docKind, listDocRefs, splitPath, type SignedDoc,
} from '@/lib/application-docs'

/**
 * Admin-only: the documents on one application, each with its storage
 * metadata and a signed URL that lives SIGNED_URL_TTL_SECONDS (five minutes).
 *
 * The ONE home for signing application-docs URLs (application-docs.test.ts
 * fails if a second caller appears). Paths come from the APPLICATION ROW,
 * never from the request, so a caller cannot sign an arbitrary object.
 *
 * Every Supabase call runs as the signed-in admin through the cookie client,
 * so the "application-docs: admin read" storage policy (role = 'admin' only,
 * migration 071) is the authority; the role check here is defence in depth and
 * turns a silent empty result into a 403 the UI can explain.
 */
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { applicationId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const { data: app } = await supabase
    .from('applications')
    .select('id, id_doc_url, veteran_id_url, artists')
    .eq('id', applicationId)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const refs = listDocRefs(app)
  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()
  const documents: SignedDoc[] = []

  for (const ref of refs) {
    const { folder, fileName } = splitPath(ref.path)
    const [{ data: listed }, { data: signed }] = await Promise.all([
      supabase.storage.from(DOCS_BUCKET).list(folder, { search: fileName, limit: 10 }),
      supabase.storage.from(DOCS_BUCKET).createSignedUrl(ref.path, SIGNED_URL_TTL_SECONDS),
    ])
    // A row can reference a file that is no longer in the bucket (teardown,
    // future retention). It is reported through `missing`, not invented.
    if (!signed?.signedUrl) continue
    const meta = listed?.find(o => o.name === fileName)
    const metadata = (meta?.metadata ?? null) as { mimetype?: string; size?: number } | null
    const mimeType = metadata?.mimetype ?? null
    documents.push({
      key: ref.key,
      label: ref.label,
      fileName,
      mimeType,
      size: typeof metadata?.size === 'number' ? metadata.size : null,
      uploadedAt: meta?.created_at ?? null,
      kind: docKind(mimeType ?? fileName),
      url: signed.signedUrl,
      expiresAt,
    })
  }

  return NextResponse.json({ documents, missing: refs.length - documents.length })
}
