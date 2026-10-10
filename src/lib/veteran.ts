'use client'

/** Public Veteran badges for the client-rendered directory pages (100). */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { groupVeteranBadges, type VeteranBadges } from '@/lib/veteran-config'

/** Empty until loaded, or if the view cannot be read (logged). */
export function useVeteranBadges(): VeteranBadges {
  const [badges, setBadges] = useState<VeteranBadges>(() => groupVeteranBadges([]))
  useEffect(() => {
    let live = true
    void createClient().from('veteran_badges_public').select('application_id, artist_uid').then(({ data, error }) => {
      if (error) { console.error(`[directory] veteran_badges_public: ${error.code} ${error.message}`); return }
      if (live && data) setBadges(groupVeteranBadges(data))
    })
    return () => { live = false }
  }, [])
  return badges
}
