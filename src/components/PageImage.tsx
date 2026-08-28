import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

/**
 * A slug-keyed image slot on an editorial page. SERVER rendered.
 *
 * Renders NOTHING - no placeholder, no reserved box, no broken-image icon - when
 * the row is missing, inactive, or has no image_path. An empty slot has to be
 * invisible rather than obviously empty: every one of these slots ships unfilled
 * (migration 050 seeds slugs only), so a placeholder would put three "image
 * coming soon" boxes on live pages the day it deployed.
 *
 * alt is not defaulted here. A row cannot carry an image_path without alt text -
 * migration 050 enforces that with a check constraint - so if alt were empty the
 * correct response is to render nothing rather than to invent a description or
 * emit alt="".
 */
interface PageImageRow {
  image_path: string | null
  alt: string | null
  caption: string | null
}

const getPageImage = unstable_cache(
  async (slug: string): Promise<PageImageRow | null> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase
      .from('page_images')
      .select('image_path, alt, caption')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      // Same reasoning as the sponsor queries: degrade to nothing, but say so.
      // 42P01 here means migration 050 has not been applied yet.
      console.error(
        `[page-image] query failed for "${slug}" (${error.code}): ${error.message} - ` +
        'slot will render nothing. If 42P01, migration 050 has not been applied.'
      )
      return null
    }

    return (data as PageImageRow | null) ?? null
  },
  ['page_images'],
  { revalidate: 60, tags: ['page-images'] }
)

export default async function PageImage({
  slug,
  className,
  imageClassName,
}: {
  slug: string
  className?: string
  imageClassName?: string
}) {
  const row = await getPageImage(slug)
  if (!row?.image_path || !row.alt?.trim()) return null

  const src = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/page-images/${row.image_path}`

  return (
    <figure className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={row.alt} className={imageClassName ?? 'w-full rounded-xl'} loading="lazy" />
      {row.caption?.trim() && (
        <figcaption className="mt-2 text-center text-xs" style={{ color: '#999' }}>
          {row.caption}
        </figcaption>
      )}
    </figure>
  )
}
