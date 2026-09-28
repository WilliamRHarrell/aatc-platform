'use client'

import { useState } from 'react'
import HoneypotField from '@/components/HoneypotField'

type Status = 'idle' | 'submitting' | 'success' | 'error'

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/

/**
 * Footer newsletter signup (design: docs/design/site-footer). Posts to
 * /api/newsletter, which adds the contact to GoHighLevel. Same bot trap as the
 * other public forms: an off-screen honeypot and a time-since-mount floor.
 */
export default function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [mountedAt] = useState(() => Date.now())

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!EMAIL.test(email.trim())) {
      setStatus('error')
      setError('Enter a valid email address.')
      return
    }
    setStatus('submitting')
    setError('')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), website: honeypot, elapsedMs: Date.now() - mountedAt }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setStatus('error')
        setError(j.error ?? 'We could not sign you up just now. Please try again.')
        return
      }
      setStatus('success')
    } catch {
      setStatus('error')
      setError('We could not sign you up just now. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <p role="status" className="border border-gold-antique px-3.5 py-3 font-condensed text-[14px] uppercase tracking-caps text-gold-antique">
        ★ You&apos;re on the list
      </p>
    )
  }

  const submitting = status === 'submitting'
  return (
    <form onSubmit={submit} noValidate className="relative flex min-w-0 flex-col gap-2">
      {/* Input and button joined flush in a row when the column is wide enough
          for the full placeholder; stacked when it is not (under 600px, and in
          the six-column band at desktop widths). Sized by the column, not the
          viewport: the footer's newsletter cell has @container. */}
      <div className="flex min-w-0 flex-col @[320px]:flex-row">
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); if (status === 'error') setStatus('idle') }}
          placeholder="EMAIL ADDRESS"
          aria-label="Email address"
          aria-invalid={status === 'error'}
          aria-describedby={status === 'error' ? 'newsletter-error' : undefined}
          autoComplete="email"
          className="min-w-0 flex-1 rounded-none border border-line-gold bg-surface px-3.5 py-3 font-condensed text-[14px] tracking-[0.06em] text-text-body outline-none transition-colors duration-120 ease-out placeholder:text-text-muted focus:border-gold-antique-hover @[320px]:border-r-0"
        />
        <button
          type="submit"
          disabled={submitting}
          className="shrink-0 rounded-none border-2 border-gold-antique bg-gold-antique px-7 py-3 font-condensed text-[14px] font-semibold uppercase tracking-caps text-background transition-colors duration-120 ease-out hover:border-gold-antique-hover hover:bg-gold-antique-hover active:border-gold-antique-press active:bg-gold-antique-press disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? 'Signing up…' : 'Sign up'}
        </button>
      </div>
      {status === 'error' && (
        <p id="newsletter-error" role="alert" className="font-condensed text-[12px] uppercase tracking-[0.06em] text-text-muted">
          {error}
        </p>
      )}
      <HoneypotField id="newsletter-website" value={honeypot} onChange={setHoneypot} />
    </form>
  )
}
