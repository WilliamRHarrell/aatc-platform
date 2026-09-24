'use client'

import { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import type { SignedDoc } from '@/lib/application-docs'
import BoothPacketPDF, { type BoothPacketData } from './BoothPacketPDF'

interface Props {
  applicationId: string
  data: BoothPacketData
  fileName: string
}

export default function BoothPacketDownload({ applicationId, data, fileName }: Props) {
  const [generating, setGenerating] = useState(false)

  const handleDownload = async () => {
    setGenerating(true)
    try {
      // Artist ID images come from the admin application-docs route (the one
      // home for signing; five-minute URLs, admin role checked server-side).
      // A non-admin gets 403 and a packet without ID images, not a broken one.
      const res = await fetch('/api/admin/application-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      })
      const json = res.ok ? ((await res.json()) as { documents: SignedDoc[] }) : { documents: [] }
      const urlByKey = new Map(json.documents.map(d => [d.key, d.url]))

      const resolvedArtists = data.artists.map((artist, i) =>
        artist.id_url ? { ...artist, id_url: urlByKey.get(`artist-${i + 1}`) ?? null } : artist
      )

      const resolvedData: BoothPacketData = { ...data, artists: resolvedArtists }
      const blob = await pdf(<BoothPacketPDF data={resolvedData} />).toBlob()

      // Trigger download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to generate PDF:', err)
    }
    setGenerating(false)
  }

  return (
    <button
      onClick={handleDownload}
      disabled={generating}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
    >
      {generating ? (
        <>
          <div className="h-3 w-3 animate-spin rounded-full border border-current" style={{ borderTopColor: 'transparent' }} />
          Building...
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Download
        </>
      )}
    </button>
  )
}
