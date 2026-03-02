'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { ExhibitorWithBooth } from '@/types'

export function useExhibitors(eventId?: string) {
  const [exhibitors, setExhibitors] = useState<ExhibitorWithBooth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!eventId) return

    const fetchExhibitors = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('exhibitors')
          .select('*, booth:booths(*)')
          .eq('event_id', eventId)
          .order('business_name')

        if (error) throw error
        setExhibitors((data as ExhibitorWithBooth[]) ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load exhibitors')
      } finally {
        setLoading(false)
      }
    }

    fetchExhibitors()
  }, [eventId])

  return { exhibitors, loading, error }
}
