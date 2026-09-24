'use client'

import { useApplicationDocs } from '@/lib/use-application-docs'
import type { SignedDoc } from '@/lib/application-docs'

function formatSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function typeLabel(doc: SignedDoc): string {
  if (doc.kind === 'pdf') return 'PDF'
  if (doc.mimeType) return doc.mimeType.replace('image/', '').toUpperCase()
  return doc.fileName.split('.').pop()?.toUpperCase() ?? 'FILE'
}

/**
 * Lists every document on an application: a thumbnail for images (signed URL,
 * five minutes), file name, type, size, upload date, and a View button that
 * re-signs and opens a new tab. Nothing here is ever server-rendered; the URLs
 * exist only in an admin's browser after an authenticated POST.
 */
export default function ApplicationDocuments({ applicationId, filter }: { applicationId: string; filter?: (d: SignedDoc) => boolean }) {
  const { docs, missing, loading, error, open } = useApplicationDocs(applicationId)
  const shown = filter ? docs.filter(filter) : docs

  if (error) return <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
  if (loading && shown.length === 0) return <p className="text-xs" style={{ color: '#555' }}>Loading documents…</p>
  if (shown.length === 0 && missing === 0) return <p className="text-xs" style={{ color: '#555' }}>No documents uploaded</p>

  return (
    <div className="space-y-2">
      {shown.map(doc => (
        <div key={doc.key} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            {doc.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold" style={{ color: '#8B7355' }}>{doc.label}</p>
            <p className="truncate text-sm text-white" title={doc.fileName}>{doc.fileName}</p>
            <p className="text-xs" style={{ color: '#999' }}>
              {typeLabel(doc)}
              {doc.size != null && ` · ${formatSize(doc.size)}`}
              {doc.uploadedAt && ` · Uploaded ${formatDate(doc.uploadedAt)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => open(doc.key)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
          >
            View
          </button>
        </div>
      ))}
      {missing > 0 && (
        <p className="text-xs" style={{ color: '#f87171' }}>
          {missing} referenced file{missing === 1 ? '' : 's'} not found in storage
        </p>
      )}
    </div>
  )
}
