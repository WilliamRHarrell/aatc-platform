'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DocKey, SignedDoc } from '@/lib/application-docs'

interface DocsResponse { documents?: SignedDoc[]; missing?: number; error?: string }

/**
 * Client side of the admin application-docs route. Fetches on mount and on
 * `refresh()`; `open(key)` re-fetches first so the tab always gets a fresh
 * five-minute URL rather than one minted when the drawer opened.
 */
export function useApplicationDocs(applicationId: string | null) {
  const [docs, setDocs] = useState<SignedDoc[]>([])
  const [missing, setMissing] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<SignedDoc[]> => {
    if (!applicationId) { setDocs([]); setMissing(0); return [] }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/application-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      })
      const json = (await res.json().catch(() => ({}))) as DocsResponse
      if (!res.ok) {
        setError(res.status === 403 ? 'Only full admins can view ID documents.' : (json.error ?? 'Could not load documents'))
        setDocs([]); setMissing(0)
        return []
      }
      const list = json.documents ?? []
      setDocs(list); setMissing(json.missing ?? 0); setError(null)
      return list
    } catch {
      setError('Could not load documents')
      return []
    } finally {
      setLoading(false)
    }
  }, [applicationId])

  useEffect(() => { void refresh() }, [refresh])

  const open = useCallback(async (key: DocKey) => {
    const list = await refresh()
    const doc = list.find(d => d.key === key)
    if (!doc) { setError('That document is no longer available'); return }
    window.open(doc.url, '_blank', 'noopener,noreferrer')
  }, [refresh])

  return { docs, missing, loading, error, refresh, open }
}
