import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import PublicNav from '@/components/PublicNav'
import MediaCarousel from '@/components/tattoo-battle/MediaCarousel'
import { ASSETS, EVENT_YEAR, TATTOO_BATTLE_PRESENTER } from '@/lib/event-config'
import { canonical } from '@/lib/site'
import { BUCKETS_ONLY_COPY, ONLINE_DONATIONS_COUNT_AS_VOTES, VETERAN_INK } from '@/lib/tattoo-battle-config'
import { entryAlt, normalizeInstagram, ogImageFor, parseBucket } from '@/lib/tattoo-battle'
import { getEntryByBucket } from '@/lib/tattoo-battle-data'

export const revalidate = 60

type Params = { params: Promise<{ bucket: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { bucket } = await params
  const n = parseBucket(bucket)
  if (n === null) return {}
  const entry = await getEntryByBucket(n)
  const title = entry
    ? `Bucket #${n}: ${entry.artist_name} | The All American Tattoo Battle ${EVENT_YEAR}`
    : `Bucket #${n} | The All American Tattoo Battle ${EVENT_YEAR}`
  const description = entry
    ? `Tattoo Battle entry by ${entry.artist_name}${entry.shop_name ? ` of ${entry.shop_name}` : ''}. Like it? Vote with your dollars in Bucket #${n}. Every dollar supports ${VETERAN_INK.name}.`
    : `This tattoo posts right after judging Friday afternoon. Presented by ${TATTOO_BATTLE_PRESENTER}.`
  const image = entry ? ogImageFor(entry.media, ASSETS.tattooBattleOg) : ASSETS.tattooBattleOg
  return {
    title,
    description,
    // noindex until published: a holding page is not a search result.
    robots: entry ? undefined : { index: false, follow: true },
    alternates: { canonical: entry ? canonical(`/tattoo-battle/entry/${n}`) : undefined },
    openGraph: { title, description, images: [{ url: image, alt: entry ? entryAlt(n, entry.artist_name) : 'The All American Tattoo Battle' }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default async function EntryPage({ params }: Params) {
  const { bucket } = await params
  const n = parseBucket(bucket)
  if (n === null) notFound()
  const entry = await getEntryByBucket(n)

  return (
    <div className="min-h-screen">
      <PublicNav />
      <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
        <Link href="/tattoo-battle" className="inline-block">
          <Image src="/images/tattoo-battle/wordmark-wide.png" alt="The All American Tattoo Battle" width={1200} height={380} className="mx-auto h-auto w-64" priority />
        </Link>

        <h1 className="mt-6 text-center font-battle-display text-6xl uppercase leading-none" style={{ color: '#C4A882' }}>
          <span className="sr-only">Tattoo Battle: </span>Bucket #{n}
        </h1>
        {entry?.is_champion && (
          <p className="mt-2 text-center font-battle-condensed text-sm font-bold uppercase tracking-[0.3em] text-black">
            <span className="inline-block rounded-md px-3 py-1" style={{ backgroundColor: '#C4A882' }}>{EVENT_YEAR} Champion</span>
          </p>
        )}

        {!entry ? (
          <div className="mt-8 rounded-2xl p-6 text-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <p className="font-battle-slab text-xl text-white">This tattoo posts right after judging Friday afternoon.</p>
            <p className="mt-3 text-sm" style={{ color: '#bbb' }}>Come back after the artists present on stage, then vote with your dollars.</p>
            <Link href="/tattoo-battle" className="mt-6 inline-block rounded-xl bg-[#866f52] px-6 py-3 text-sm font-bold text-white">About the Battle</Link>
          </div>
        ) : (
          <>
            <div className="mt-6">
              <MediaCarousel items={entry.media} alt={entryAlt(n, entry.artist_name)} />
            </div>
            <div className="mt-6 text-center">
              <p className="font-battle-slab text-2xl text-white">{entry.artist_name}</p>
              {entry.shop_name && <p className="text-sm" style={{ color: '#bbb' }}>{entry.shop_name}{entry.city_state ? ` · ${entry.city_state}` : ''}</p>}
              {normalizeInstagram(entry.instagram) && (
                <a href={`https://instagram.com/${normalizeInstagram(entry.instagram)}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm underline underline-offset-4" style={{ color: '#C4A882' }}>
                  @{normalizeInstagram(entry.instagram)}
                </a>
              )}
            </div>

            <div className="mt-8 rounded-2xl p-6 text-center" style={{ backgroundColor: 'rgba(139,115,85,0.15)', border: '1px solid #8B7355' }}>
              <p className="font-battle-display text-2xl uppercase text-white">Like this one?</p>
              <p className="mt-2 font-battle-slab text-lg" style={{ color: '#C4A882' }}>Vote with your dollars: drop cash in Bucket #{n}.</p>
              {!ONLINE_DONATIONS_COUNT_AS_VOTES && <p className="mt-2 text-sm" style={{ color: '#ddd' }}>{BUCKETS_ONLY_COPY}</p>}
            </div>

            <div className="mt-6 text-center text-sm" style={{ color: '#bbb' }}>
              <p>Every dollar supports <a href={VETERAN_INK.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" style={{ color: '#C4A882' }}>{VETERAN_INK.name}</a>.</p>
              <p className="mt-2">{VETERAN_INK.description}</p>
            </div>

            <div className="mt-8 text-center">
              <Link href="/tattoo-battle#entries" className="text-sm font-semibold underline underline-offset-4" style={{ color: '#C4A882' }}>See all entries</Link>
            </div>
          </>
        )}
        <p className="mt-10 text-center font-battle-condensed text-xs uppercase tracking-[0.25em]" style={{ color: '#999' }}>Presented by {TATTOO_BATTLE_PRESENTER}</p>
      </main>
    </div>
  )
}
