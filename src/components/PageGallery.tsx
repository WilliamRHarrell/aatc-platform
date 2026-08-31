import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

/**
 * An ordered image collection. SERVER rendered.
 *
 * Renders NOTHING when the gallery is empty or every image is hidden - no
 * heading over nothing, no placeholder grid, no reserved space. Same rule as
 * PageImage, and it matters more here: a gallery ships empty and fills up over
 * time, so the empty state is the normal state for a while.
 *
 * alt is NOT NULL in the table, so unlike PageImage there is no need to skip
 * rows missing it - the database will not store one.
 */
interface GalleryRow {
  id: string
  image_path: string
  alt: string
  caption: string | null
}

const getGallery = unstable_cache(
  async (slug: string): Promise<GalleryRow[]> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error } = await supabase
      .from('page_galleries')
      .select('id, image_path, alt, caption')
      .eq('gallery_slug', slug)
      .eq('active', true)
      .order('sort_order')
      .order('created_at')

    if (error) {
      // 42P01 means migration 057 has not been applied yet.
      console.error(
        `[page-gallery] query failed for "${slug}" (${error.code}): ${error.message} - ` +
        'gallery will render nothing. If 42P01, migration 057 has not been applied.'
      )
      return []
    }
    return (data ?? []) as GalleryRow[]
  },
  ['page_galleries'],
  { revalidate: 60, tags: ['page-galleries'] }
)

export default async function PageGallery({
  slug,
  title,
  className,
}: {
  slug: string
  title?: string
  className?: string
}) {
  const rows = await getGallery(slug)
  if (rows.length === 0) return null

  const src = (p: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/page-images/${p}`

  return (
    <section className={className}>
      {title && (
        <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">{title}</span>
        </h2>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(r => (
          <figure key={r.id} className="overflow-hidden rounded-2xl" style={{ border: '1px solid #2a2a2a' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(r.image_path)} alt={r.alt} className="h-56 w-full object-cover" loading="lazy" />
            {r.caption?.trim() && (
              <figcaption className="px-3 py-2 text-xs" style={{ color: '#999', backgroundColor: '#1a1a1a' }}>
                {r.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  )
}
