'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import ApplicationEditorForm, { type EditorInitial } from '@/components/admin/ApplicationEditorForm'

/**
 * /admin/applications/[id]/edit - any application, any status, in the editor
 * (editor PR 3). Admin only (src/proxy.ts); saves go through
 * /api/admin/applications/editor, which keeps the stored price while the order
 * is unchanged and refuses an order change once money is recorded.
 */
export default function EditApplicationPage() {
  const { id } = useParams<{ id: string }>()
  const [initial, setInitial] = useState<EditorInitial | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    void (async () => {
      const [{ data: row, error: e1 }, { data: invoices }, { data: vip }] = await Promise.all([
        supabase.from('applications')
          .select('id, status, exhibitor_type, business_name, contact_name, email, phone, website, instagram, facebook, other_links, notes, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, add_ons, artist_count, is_veteran, artists, logo_url, id_doc_url, veteran_id_url, total_amount, agreed_total, comped_at, permits_comped_at')
          .eq('id', id).maybeSingle(),
        supabase.from('invoices').select('amount, amount_paid').eq('application_id', id),
        // 098; before it is applied this errors and the checkboxes start unticked.
        supabase.from('vip_featured_artists').select('artist_uid').eq('application_id', id),
      ])
      if (e1 || !row) { setError(e1?.message ?? 'Application not found.'); return }
      setInitial({ id: row.id, row: row as unknown as EditorInitial['row'], invoice: invoices?.[0] ?? null, vipUids: (vip ?? []).map(v => v.artist_uid) })
    })()
  }, [id])

  return (
    <>
      <div className="mb-6">
        <Link href={`/admin/applications?open=${id}`} className="text-sm font-semibold" style={{ color: '#8B7355' }}>← Applications</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
          Edit application{initial ? `: ${initial.row.business_name}` : ''}
        </h1>
        {initial && <p className="mt-1 text-sm" style={{ color: '#999' }}>Status: {initial.row.status}. No email is sent from here.</p>}
      </div>
      {error && <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>}
      {!initial && !error && (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
        </div>
      )}
      {initial && <ApplicationEditorForm key={initial.id} initial={initial} />}
    </>
  )
}
