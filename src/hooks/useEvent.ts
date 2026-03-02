'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Event } from '@/types'

export function useEvent(eventId?: string) {
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchEvent = async () => {
      setLoading(true)
      try {
        let query = supabase.from('events').select('*')

        if (eventId) {
          query = query.eq('id', eventId)
        } else {
          query = query.eq('is_active', true)
        }

        const { data, error } = await query.single()
        if (error) throw error
        setEvent(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load event')
      } finally {
        setLoading(false)
      }
    }

    fetchEvent()
  }, [eventId])

  return { event, loading, error }
}
