'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { guardedWrite } from '@/lib/db-write'
import {
  TRUCK_DOC_KINDS, TRUCK_DOC_LABELS, TRUCK_DOC_ACCEPT, TRUCK_DOCS_BUCKET, checkTruckFile, truckDocState,
  type TruckDocKind,
} from '@/lib/food-truck-submission'

/**
 * Health permit and business license for a linked food truck (093).
 *
 * The owner uploads into their own truck's folder of the PRIVATE
 * food-truck-docs bucket ("food-truck-docs: owner insert"), then records the
 * path on their row ("Vendors update own food_truck"). 093's guard stamps the
 * upload time and clears any verification, so a replaced document is checked
 * again. Owners cannot read the files back (admin read only), so this shows
 * the state, not the file.
 */
export interface TruckDocs {
  id: string
  permit_path: string | null
  permit_uploaded_at: string | null
  permit_verified_at: string | null
  license_path: string | null
  license_uploaded_at: string | null
  license_verified_at: string | null
}

const STATE_STYLE = {
  missing:  { label: 'Not uploaded', color: '#999',    bg: 'rgba(153,153,153,0.15)' },
  uploaded: { label: 'Uploaded, awaiting review', color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
  verified: { label: 'Verified', color: '#4ade80', bg: 'rgba(74,222,128,0.15)' },
} as const

const SELECT = 'id, permit_path, permit_uploaded_at, permit_verified_at, license_path, license_uploaded_at, license_verified_at'

export function TruckDocumentsPanel({ truck, onChange }: { truck: TruckDocs; onChange: (t: TruckDocs) => void }) {
  const supabase = createClient()
  const [busy, setBusy] = useState<TruckDocKind | null>(null)

  const upload = async (kind: TruckDocKind, file: File | undefined, input: HTMLInputElement) => {
    if (!file) return
    const c = checkTruckFile(file, kind)
    if (!c.ok) { toast.error(c.error); input.value = ''; return }
    setBusy(kind)
    try {
      const path = `${truck.id}/${kind}-${crypto.randomUUID()}.${c.ext}`
      const { error: upErr } = await supabase.storage.from(TRUCK_DOCS_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) { toast.error(`${TRUCK_DOC_LABELS[kind]} did not upload: ${upErr.message}`); return }
      const res = await guardedWrite(
        supabase.from('food_trucks').update({ [`${kind}_path`]: path }).eq('id', truck.id).select(SELECT),
        `${TRUCK_DOC_LABELS[kind]} uploaded but not saved to your truck`,
        `portal/truck-docs ${kind} truck=${truck.id}`,
      )
      if (!res.ok) { toast.error(res.error); return }
      onChange(res.data[0] as unknown as TruckDocs)
      toast.success(`${TRUCK_DOC_LABELS[kind]} uploaded`)
    } finally {
      setBusy(null)
      input.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed" style={{ color: '#999' }}>
        A valid health permit and business license are required. Upload them here ahead of time or show them at setup.
        PDF, JPG or PNG, up to 10 MB. Only our team can see them.
      </p>
      {TRUCK_DOC_KINDS.map(kind => {
        const state = truckDocState(truck[`${kind}_path`], truck[`${kind}_verified_at`])
        const st = STATE_STYLE[state]
        const uploadedAt = truck[`${kind}_uploaded_at`]
        return (
          <div key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
            <div>
              <p className="text-sm font-medium text-white">{TRUCK_DOC_LABELS[kind]}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                {uploadedAt && <span className="text-xs" style={{ color: '#555' }}>{new Date(uploadedAt).toLocaleDateString()}</span>}
              </div>
            </div>
            <label
              className={`cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-80 focus-within:ring-2 focus-within:ring-[#C4A882] ${busy ? 'pointer-events-none opacity-50' : ''}`}
              style={{ backgroundColor: 'rgba(139,115,85,0.15)', color: '#C4A882', border: '1px solid rgba(139,115,85,0.3)' }}
            >
              {busy === kind ? 'Uploading...' : state === 'missing' ? 'Upload' : 'Replace'}
              <input
                type="file"
                accept={TRUCK_DOC_ACCEPT}
                className="sr-only"
                disabled={busy !== null}
                aria-label={`${state === 'missing' ? 'Upload' : 'Replace'} ${TRUCK_DOC_LABELS[kind].toLowerCase()}`}
                onChange={e => upload(kind, e.target.files?.[0], e.target)}
              />
            </label>
          </div>
        )
      })}
      <p className="text-xs" style={{ color: '#666' }}>Replacing a document sends it back for review.</p>
    </div>
  )
}
