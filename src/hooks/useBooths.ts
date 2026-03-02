'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { sortBoothsNumerically } from '@/lib/utils'
import type { Booth } from '@/types'

export function useBooths(eventId?: string) {
  const [booths, setBooths] = useState<Booth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!eventId) return

    const fetchBooths = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('booths')
          .select('*')
          .eq('event_id', eventId)

        if (error) throw error
        setBooths(sortBoothsNumerically(data ?? []))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load booths')
      } finally {
        setLoading(false)
      }
    }

    fetchBooths()

    const channel = supabase
      .channel(`booths-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booths', filter: `event_id=eq.${eventId}` },
        () => fetchBooths()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [eventId])

  return { booths, loading, error }
}
