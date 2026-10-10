'use client'

/**
 * Gold Star VIP Meet & Greet featured artists, client side (098, 099): the
 * directory "Featured" badge. The public read is vip_featured_public
 * (approved applications of the active event). Server reads: lib/vip-server.ts.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/** What the badge needs: which applications and which roster artists (uid) are featured. */
export interface VipFeatured { applications: Set<string>; artists: Set<string> }

const EMPTY: VipFeatured = { applications: new Set(), artists: new Set() }

/** Featured applications and artists; empty until loaded, or if the view cannot be read. */
export function useVipFeatured(): VipFeatured {
  const [featured, setFeatured] = useState<VipFeatured>(EMPTY)
  useEffect(() => {
    let live = true
    void createClient().from('vip_featured_public').select('application_id, artist_uid').then(({ data, error }) => {
      if (error) { console.error(`[directory] vip_featured_public: ${error.code} ${error.message}`); return }
      if (!live || !data) return
      setFeatured({ applications: new Set(data.map(r => r.application_id)), artists: new Set(data.map(r => r.artist_uid)) })
    })
    return () => { live = false }
  }, [])
  return featured
}
