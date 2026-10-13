import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase-server'
import type { Database } from '@/types/database'
import { boothText, isStuckSending, mediaItems, POSTS_BUCKET } from '@/lib/artist-posts'
import { HoverVideo, OptOutButton, RefreshButton, SendPostButton, SkipButton } from '@/components/admin/ArtistPostCards'

/**
 * /admin/social/artist-posts - the top Instagram posts n8n scraped per
 * approved artist (101/102), with send-to-Postiz, skip and opt-out.
 * Admin only (src/proxy.ts; RLS on the three tables is admin-only; this page
 * also checks the role itself before using the service key).
 *
 * Server-rendered: reads run as the signed-in admin (RLS); the ONLY
 * service-role use is signing artist-posts thumbnails, after the role check,
 * because the bucket is private with no storage policies at all.
 * media[].path is bucket-relative. Writes happen in the client islands
 * (ArtistPostCards) and the /api/admin/artist-posts/* routes - state columns
 * only, never ingest columns.
 */

export const dynamic = 'force-dynamic'

type PostRow = Database['public']['Tables']['artist_social_posts']['Row']
type RunRow = Database['public']['Tables']['artist_scrape_runs']['Row']
type OptOutRow = Database['public']['Tables']['artist_repost_opt_outs']['Row']

const STATUS_FILTERS = ['new', 'sent', 'skipped', 'failed'] as const

const etTime = (iso: string) => new Date(iso).toLocaleString('en-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})
const etDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
})

const PILL: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: '#999' },
  sending: { label: 'Sending…', color: '#eab308' },
  sent: { label: 'Sent', color: '#4ade80' },
  skipped: { label: 'Skipped', color: '#777' },
  failed: { label: 'Failed', color: '#f87171' },
  stuck: { label: 'Stuck - retry', color: '#f87171' },
}

export default async function ArtistPostsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const statusFilter = (STATUS_FILTERS as readonly string[]).includes(one('status')) ? one('status') : ''
  const q = one('q').trim().toLowerCase()
  const showDropped = one('dropped') === '1'
  // Artists / Vendors tabs (103). Rows written before n8n sends exhibitor_type read as artist.
  const tab: 'artists' | 'vendors' = one('type') === 'vendors' ? 'vendors' : 'artists'
  const tabKind = tab === 'vendors' ? 'vendor' : 'artist'

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirect=/admin/social/artist-posts')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal')

  let postsQuery = supabase.from('artist_social_posts').select('*')
  if (!showDropped) postsQuery = postsQuery.eq('is_current_top5', true)
  const [{ data: postRows, error: postsErr }, { data: runRows }, { data: optOutRows }] = await Promise.all([
    postsQuery,
    supabase.from('artist_scrape_runs').select('*').order('handle'),
    supabase.from('artist_repost_opt_outs').select('*').order('created_at'),
  ])
  if (postsErr) {
    return (
      <p className="text-sm" style={{ color: '#f87171' }}>
        Artist posts could not load ({postsErr.message}). Are migrations 101 and 102 applied in Supabase?
      </p>
    )
  }
  const posts = (postRows ?? []) as PostRow[]
  const runs = (runRows ?? []) as RunRow[]
  const optOuts = (optOutRows ?? []) as OptOutRow[]

  // ── context: the applications and booths behind these rows ──
  const appIds = [...new Set([
    ...posts.flatMap(p => (p.application_id ? [p.application_id] : [])),
    ...optOuts.map(o => o.application_id),
  ])]
  const [{ data: apps }, { data: booths }] = await Promise.all([
    appIds.length
      ? supabase.from('applications').select('id, business_name, artists').in('id', appIds)
      : Promise.resolve({ data: [] as { id: string; business_name: string; artists: unknown }[] }),
    appIds.length
      ? supabase.from('booths').select('application_id, booth_number').in('application_id', appIds)
      : Promise.resolve({ data: [] as { application_id: string | null; booth_number: string }[] }),
  ])
  const appById = new Map((apps ?? []).map(a => [a.id, a]))
  const boothsByApp = new Map<string, string[]>()
  for (const b of booths ?? []) {
    if (!b.application_id) continue
    boothsByApp.set(b.application_id, [...(boothsByApp.get(b.application_id) ?? []), b.booth_number])
  }
  const rosterName = (applicationId: string | null, uid: string | null): string | null => {
    const roster = appById.get(applicationId ?? '')?.artists
    if (!Array.isArray(roster) || !uid) return null
    const el = (roster as Array<{ uid?: string; name?: string; nickname?: string }>).find(a => a?.uid === uid)
    return el ? (el.nickname?.trim() || el.name?.trim() || null) : null
  }

  // ── group by exhibitor (handle), on the active tab ──
  const postKind = (p: PostRow): 'artist' | 'vendor' =>
    ((p as { exhibitor_type?: string }).exhibitor_type === 'vendor' ? 'vendor' : 'artist')
  interface Group {
    handle: string
    name: string | null
    shop: string | null
    applicationId: string | null
    artistUid: string | null
    exhibitorType: 'artist' | 'vendor'
    boothNumbers: string[]
    posts: PostRow[]
  }
  const groups = new Map<string, Group>()
  for (const p of posts) {
    if (postKind(p) !== tabKind) continue
    const g = groups.get(p.handle) ?? {
      handle: p.handle, name: null, shop: null, applicationId: null, artistUid: null, exhibitorType: postKind(p), boothNumbers: [], posts: [],
    }
    if (!g.applicationId && p.application_id) {
      g.applicationId = p.application_id
      g.artistUid = p.artist_uid
      g.shop = appById.get(p.application_id)?.business_name ?? null
      g.name = postKind(p) === 'vendor' ? g.shop : rosterName(p.application_id, p.artist_uid)
      g.boothNumbers = [...(boothsByApp.get(p.application_id) ?? [])].sort()
    }
    g.posts.push(p)
    groups.set(p.handle, g)
  }
  for (const g of groups.values()) {
    g.posts.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (a.shortcode < b.shortcode ? -1 : 1))
  }

  const stuck = (p: PostRow) => isStuckSending(p.status, (p as { updated_at?: string }).updated_at ?? null)
  const effectiveStatus = (p: PostRow) => (stuck(p) ? 'failed' : p.status)

  const optOutFor = (g: Group) =>
    optOuts.find(o => o.application_id === g.applicationId && (o.artist_uid === g.artistUid || o.artist_uid === null))

  const visibleGroups = [...groups.values()]
    .filter(g => !q
      || g.handle.toLowerCase().includes(q)
      || (g.name ?? '').toLowerCase().includes(q)
      || (g.shop ?? '').toLowerCase().includes(q))
    .map(g => ({ ...g, posts: statusFilter ? g.posts.filter(p => effectiveStatus(p) === statusFilter) : g.posts }))
    .filter(g => g.posts.length > 0)
    .sort((a, b) => (a.name ?? a.handle).localeCompare(b.name ?? b.handle))

  // ── signed thumbnails (service role: the bucket is private, no policies) ──
  const paths = [...new Set(visibleGroups.flatMap(g => g.posts.flatMap(p => {
    const first = mediaItems(p.media)[0]
    return first ? [first.path] : []
  })))]
  const signedByPath = new Map<string, string>()
  if (paths.length) {
    const service = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: signed } = await service.storage.from(POSTS_BUCKET).createSignedUrls(paths, 3600)
    for (const s of signed ?? []) if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl)
  }

  // ── header counts ──
  const lastRefresh = runs.reduce<string | null>((m, r) => (!m || r.last_run_at > m ? r.last_run_at : m), null)
  const privateRuns = runs.filter(r => r.result === 'private_or_not_found')
  const emptyRuns = runs.filter(r => r.result === 'no_posts')
  const withPosts = new Set(posts.filter(p => p.is_current_top5).map(p => p.handle)).size

  const filterHref = (patch: Record<string, string>) => {
    const next = new URLSearchParams()
    const merged = { type: tab === 'vendors' ? 'vendors' : '', status: statusFilter, q: one('q'), dropped: showDropped ? '1' : '', ...patch }
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v)
    const s = next.toString()
    return `/admin/social/artist-posts${s ? `?${s}` : ''}`
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Artist posts</h1>
          <p className="mt-1 text-sm" style={{ color: '#999' }}>
            Top Instagram posts per approved artist, scraped monthly by n8n; send one to Postiz with the AATC watermark.
            {lastRefresh ? ` Last refresh ${etTime(lastRefresh)} ET.` : ' Not refreshed yet.'}
          </p>
          <p className="mt-1 text-xs" style={{ color: '#666' }}>
            {withPosts} artist{withPosts === 1 ? '' : 's'} with posts · {privateRuns.length} private or not found · {emptyRuns.length} with no posts
          </p>
        </div>
        <RefreshButton label="Refresh all artists" />
      </div>

      <div className="mb-4 flex gap-2">
        {(['artists', 'vendors'] as const).map(t => (
          <Link key={t} href={filterHref({ type: t === 'vendors' ? 'vendors' : '' })}
            className="rounded-lg px-4 py-1.5 text-sm font-semibold"
            style={{
              border: `1px solid ${tab === t ? '#8B7355' : '#2a2a2a'}`,
              color: tab === t ? '#C4A882' : '#999',
              backgroundColor: tab === t ? 'rgba(139,115,85,0.12)' : 'transparent',
            }}>
            {t === 'artists' ? 'Artists' : 'Vendors'}
          </Link>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {['', ...STATUS_FILTERS].map(s => (
          <Link key={s || 'all'} href={filterHref({ status: s })}
            className="rounded-full px-3 py-1 text-xs"
            style={{
              border: `1px solid ${statusFilter === s ? '#8B7355' : '#2a2a2a'}`,
              color: statusFilter === s ? '#C4A882' : '#999',
            }}>
            {s === '' ? 'All' : PILL[s].label}
          </Link>
        ))}
        <Link href={filterHref({ dropped: showDropped ? '' : '1' })}
          className="rounded-full px-3 py-1 text-xs"
          style={{ border: `1px solid ${showDropped ? '#8B7355' : '#2a2a2a'}`, color: showDropped ? '#C4A882' : '#999' }}>
          {showDropped ? 'Hiding nothing' : 'Show dropped posts'}
        </Link>
        <form method="get" className="ml-auto">
          {tab === 'vendors' && <input type="hidden" name="type" value="vendors" />}
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {showDropped && <input type="hidden" name="dropped" value="1" />}
          <input name="q" defaultValue={one('q')} placeholder={tab === 'vendors' ? 'Search vendors…' : 'Search artists…'}
            className="rounded-lg px-3 py-1.5 text-sm text-white"
            style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }} />
        </form>
      </div>

      {visibleGroups.length === 0 && (
        <p className="text-sm" style={{ color: '#999' }}>
          {posts.filter(p => postKind(p) === tabKind).length === 0
            ? `No ${tabKind} posts yet. "Refresh all artists" scrapes every approved, publicly listed ${tabKind} with an Instagram handle.`
            : 'Nothing matches the filters.'}
        </p>
      )}

      <div className="space-y-8">
        {visibleGroups.map(g => {
          const o = optOutFor(g)
          return (
            <section key={g.handle}>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {g.name ?? g.handle}
                    <a href={`https://www.instagram.com/${g.handle}/`} target="_blank" rel="noreferrer"
                      className="ml-2 text-xs font-normal underline" style={{ color: '#C4A882' }}>@{g.handle}</a>
                  </p>
                  <p className="text-xs" style={{ color: '#666' }}>
                    {[g.exhibitorType === 'vendor' ? 'Vendor' : g.shop,
                      g.boothNumbers.length ? boothText(g.boothNumbers).replace(' - find them at ', '') : null]
                      .filter(Boolean).join(' · ') || 'Application no longer linked'}
                    {o && <span style={{ color: '#f87171' }}> · opted out{o.artist_uid === null && g.exhibitorType === 'artist' ? ' (whole application)' : ''}</span>}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <RefreshButton handles={[g.handle]} label="Refresh" />
                  {g.applicationId && !o && (g.exhibitorType === 'vendor' || g.artistUid) && (
                    <OptOutButton applicationId={g.applicationId} artistUid={g.exhibitorType === 'vendor' ? null : g.artistUid} />
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {g.posts.map(p => {
                  const media = mediaItems(p.media)
                  const first = media[0]
                  const url = first ? signedByPath.get(first.path) : undefined
                  const pill = PILL[stuck(p) ? 'stuck' : p.status] ?? PILL.new
                  return (
                    <div key={p.id} className="overflow-hidden rounded-xl" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                      <div className="relative aspect-square" style={{ backgroundColor: '#111' }}>
                        {url && first?.type === 'video' && <HoverVideo src={url} className="h-full w-full object-cover" />}
                        {/* Signed URL, short-lived; next/image cannot cache it usefully. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {url && first?.type !== 'video' && <img src={url} alt={`@${g.handle} post`} className="h-full w-full object-cover" />}
                        {!url && <div className="flex h-full items-center justify-center text-xs" style={{ color: '#555' }}>No media</div>}
                        {/* Where the n8n watermark will land: bottom-right, 14% wide, 3% margin. */}
                        <div className="pointer-events-none absolute flex items-center justify-center"
                          style={{ right: '3%', bottom: '3%', width: '14%', aspectRatio: '1 / 1', border: '1px dashed rgba(255,255,255,0.45)', borderRadius: 4 }}>
                          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9 }}>wm</span>
                        </div>
                        {p.rank != null && (
                          <span className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-xs font-bold"
                            style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#C4A882' }}>#{p.rank}</span>
                        )}
                        <span className="absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] uppercase"
                          style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#999' }}>
                          {p.post_type ?? 'post'}{media.length > 1 ? ` · ${media.length}` : ''}
                        </span>
                        {!p.is_current_top5 && (
                          <span className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px]"
                            style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#eab308' }}>dropped out</span>
                        )}
                      </div>
                      <div className="space-y-1.5 p-2.5">
                        <p className="text-xs" style={{ color: '#999' }}>
                          {p.likes == null ? 'likes hidden' : `${p.likes.toLocaleString()} likes`} · {(p.comments ?? 0).toLocaleString()} comments
                          {p.views != null ? ` · ${p.views.toLocaleString()} views` : ''}
                        </p>
                        <p className="text-xs" style={{ color: '#666' }}>
                          {p.posted_at ? etDate(p.posted_at) : 'Post date unknown'} ·{' '}
                          <a href={p.post_url} target="_blank" rel="noreferrer" className="underline">original</a>
                        </p>
                        {p.caption_original && (
                          <p className="truncate text-xs" style={{ color: '#555' }} title="Original caption - reference only, never reposted">
                            {p.caption_original.split('\n')[0]}
                          </p>
                        )}
                        <p className="text-xs font-semibold" style={{ color: pill.color }}>
                          {pill.label}
                          {p.status === 'sent' && p.sent_at ? ` ${etTime(p.sent_at)} ET` : ''}
                        </p>
                        {(p.status === 'failed' || stuck(p)) && p.last_error && (
                          <p className="text-xs" style={{ color: '#f87171' }}>{p.last_error}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {p.status !== 'sending' || stuck(p) ? (
                            <SendPostButton
                              post={{
                                id: p.id, handle: p.handle, status: p.status, sentAt: p.sent_at,
                                hasImage: media.some(m => m.type === 'image'),
                                hasVideo: media.some(m => m.type === 'video'),
                                exhibitorType: postKind(p),
                              }}
                              booths={g.boothNumbers}
                            />
                          ) : null}
                          {p.status !== 'sending' && <SkipButton id={p.id} skipped={p.status === 'skipped'} />}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-white">Private or not found</h2>
          {privateRuns.length === 0 && <p className="text-xs" style={{ color: '#666' }}>None.</p>}
          <ul className="space-y-1">
            {privateRuns.map(r => (
              <li key={r.handle} className="text-xs" style={{ color: '#999' }}>
                @{r.handle} <span style={{ color: '#555' }}>checked {etTime(r.last_run_at)} ET</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-white">No posts in the last 12 months</h2>
          {emptyRuns.length === 0 && <p className="text-xs" style={{ color: '#666' }}>None.</p>}
          <ul className="space-y-1">
            {emptyRuns.map(r => (
              <li key={r.handle} className="text-xs" style={{ color: '#999' }}>
                @{r.handle} <span style={{ color: '#555' }}>{r.post_count_scanned ?? 0} scanned</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-white">Opted out</h2>
          {optOuts.length === 0 && <p className="text-xs" style={{ color: '#666' }}>None. Opt an artist out here or in the application editor.</p>}
          <ul className="space-y-1.5">
            {optOuts.map(o => {
              const app = appById.get(o.application_id)
              const name = o.artist_uid ? rosterName(o.application_id, o.artist_uid) : null
              return (
                <li key={o.id} className="flex items-center gap-2 text-xs" style={{ color: '#999' }}>
                  <span className="min-w-0 flex-1">
                    {o.artist_uid
                      ? `${name ?? 'Artist no longer on the roster'} (${app?.business_name ?? 'application missing'})`
                      : `${app?.business_name ?? 'Application missing'} - whole application`}
                  </span>
                  <OptOutButton applicationId={o.application_id} artistUid={o.artist_uid} optOutId={o.id} />
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </>
  )
}
