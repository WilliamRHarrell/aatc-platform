'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { REGISTRY, getPageDef } from '@/content/registry'
import Markdown from '@/components/Markdown'

export default function AdminContentPage() {
  const supabase = createClient()
  const [pageKey, setPageKey] = useState(REGISTRY[0].key)
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const pageDef = getPageDef(pageKey)!

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const base: Record<string, string> = Object.fromEntries(
        Object.entries(pageDef.sections).map(([k, s]) => [k, s.default])
      )
      const { data } = await supabase
        .from('page_content')
        .select('section_key, content')
        .eq('page_key', pageKey)
      ;(data ?? []).forEach(r => {
        if (r.content != null) base[r.section_key] = r.content
      })
      if (!cancelled) {
        setValues(base)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [pageKey])

  const save = async (sectionKey: string) => {
    setSavingKey(sectionKey)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('page_content')
      .upsert(
        {
          page_key: pageKey,
          section_key: sectionKey,
          content: values[sectionKey] ?? '',
          content_type: pageDef.sections[sectionKey].type,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
        { onConflict: 'page_key,section_key' }
      )
    setSavingKey(null)
    if (error) {
      toast.error('Save failed — are you an admin?')
    } else {
      toast.success('Saved · live within ~60s')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-white">Page Content</h1>
      <p className="mt-1 text-sm" style={{ color: '#999' }}>
        Edit the wording on your public pages. Changes appear within about a minute.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {REGISTRY.map(p => (
          <button
            key={p.key}
            onClick={() => setPageKey(p.key)}
            className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: pageKey === p.key ? 'rgba(139,115,85,0.15)' : '#1a1a1a',
              color: pageKey === p.key ? '#C4A882' : '#999',
              border: `1px solid ${pageKey === p.key ? 'rgba(139,115,85,0.3)' : '#2a2a2a'}`,
            }}
          >
            {p.title}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {Object.entries(pageDef.sections).map(([key, section]) => (
            <div key={key} className="rounded-2xl p-5" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}>
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-sm font-semibold text-white">{section.label}</label>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: '#555' }}>{section.type}</span>
              </div>
              {section.help && (
                <p className="mt-0.5 text-xs" style={{ color: '#666' }}>{section.help}</p>
              )}
              <textarea
                value={values[key] ?? ''}
                onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
                rows={section.type === 'markdown' ? 4 : 2}
                className="mt-2 w-full rounded-lg p-3 text-sm text-white"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
              />

              <div className="mt-2 rounded-lg p-3 text-sm" style={{ backgroundColor: '#0a0a0a', border: '1px dashed #2a2a2a', color: '#ccc' }}>
                <p className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: '#555' }}>Preview</p>
                {section.type === 'markdown'
                  ? <Markdown>{values[key] ?? ''}</Markdown>
                  : <span>{values[key]}</span>}
              </div>

              <button
                onClick={() => save(key)}
                disabled={savingKey === key}
                className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: '#8B7355' }}
              >
                {savingKey === key ? 'Saving…' : 'Save'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
