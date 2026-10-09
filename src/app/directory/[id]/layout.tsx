import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { pageMetadata, titled, atTheShow } from '@/lib/page-meta'

// The profile page is a client component, which cannot export metadata. Its
// title, description, canonical and social preview are built here from the
// exhibitor's public row (applications_public, approved only: the same rule
// /directory uses), so a shared profile link names the exhibitor (2026-10-09).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const path = `/directory/${id}`
  let name: string | null = null
  if (UUID.test(id)) {
    const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data } = await sb.from('applications_public').select('business_name').eq('id', id).eq('status', 'approved').maybeSingle()
    name = data?.business_name?.trim() || null
  }
  if (!name) return { ...pageMetadata('/directory', { title: titled('Exhibitor Directory'), description: atTheShow('The artists and vendors exhibiting') }), robots: { index: false } }
  return pageMetadata(path, { title: titled(`${name} | Exhibitor Directory`), description: atTheShow(`${name}, exhibiting`) })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
