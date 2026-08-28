'use client'

import { useState } from 'react'
import { PINUP_REGISTRATION_OPEN } from '@/lib/event-config'
import HoneypotField from '@/components/HoneypotField'

import PublicNav from '@/components/PublicNav'

const CRITERIA = [
  'Overall presentation and stage presence',
  'Authenticity and creativity of costume/styling',
  'Confidence and audience engagement',
  'Tattoo display and integration with look',
  'Audience response',
]

const JUDGES = [
  { name: 'Judge TBA', title: 'Head Judge', initials: 'TBA' },
  { name: 'Judge TBA', title: 'Guest Judge', initials: 'TBA' },
  { name: 'Judge TBA', title: 'Guest Judge', initials: 'TBA' },
]

const PRIZES = [
  { place: '1st Place - Miss AATC', prize: 'Custom Crown, Sash, Trophy + $500 Cash + Convention Feature' },
  { place: '2nd Place - 1st Runner-Up', prize: 'Trophy + $250 Cash' },
  { place: '3rd Place - 2nd Runner-Up', prize: 'Trophy + $100 Cash' },
]

const FIELDS = [
  { key: 'fullName'  as const, label: 'Full name',            type: 'text',  required: true },
  { key: 'stageName' as const, label: 'Stage name (optional)', type: 'text',  required: false },
  { key: 'email'     as const, label: 'Email',                type: 'email', required: true },
  { key: 'phone'     as const, label: 'Phone',                type: 'tel',   required: true },
  { key: 'address'   as const, label: 'Address (optional)',   type: 'text',  required: false },
]

export default function PinupContestClient({ entrySlot }: { entrySlot: React.ReactNode }) {
  const [form, setForm] = useState({
    fullName: '',
    stageName: '',
    email: '',
    phone: '',
    address: '',
    ageConfirmed: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  // Null until the server confirms a write. There is no optimistic success:
  // the stub this replaced set its success flag without asking anyone.
  const [result, setResult] = useState<'confirmed' | 'waitlist' | null>(null)
  // Bot trap. `website` must arrive empty; mountedAt gives the server an
  // elapsed time so an instant post can be spotted. Neither is the rate limit -
  // that is a Vercel WAF rule on this path.
  const [honeypot, setHoneypot] = useState('')
  const [mountedAt] = useState(() => Date.now())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})

    try {
      const res = await fetch('/api/pinup-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ageConfirmed: form.ageConfirmed === 'yes',
          website: honeypot,
          elapsedMs: Date.now() - mountedAt,
        }),
      })

      // Parsed defensively: a 502 from the platform is HTML, not JSON, and
      // letting that throw would surface as the network branch below and tell
      // the entrant to check their connection when the fault is ours.
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong saving your entry. Please try again.')
        if (data?.fieldErrors) setFieldErrors(data.fieldErrors)
        return
      }

      if (data?.status === 'confirmed' || data?.status === 'waitlist') {
        setResult(data.status)
      } else {
        setError('Your entry may not have saved. Please contact us before travelling.')
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputBase = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none'
  const inputStyle = { backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a' }

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Vintage Glamour Meets Modern Ink</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Miss AATC Pinup Contest</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Celebrating beauty, confidence, and tattoo culture. The Miss AATC Pinup Contest is one of Saturday evening&apos;s marquee events, bringing vintage glamour and modern ink together on the main stage.</span>
        </p>
      </div>

      {/* Event Details + Entry Form - side by side */}
      <section className="px-4 py-12">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">

          {/* Left: Event Details + Prizes */}
          <div className="space-y-6">
            <div>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
                <span className="text-emboss">Event Details</span>
              </h2>
              <div
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div className="space-y-3">
                  {[
                    { label: 'When', value: 'Saturday, April 17 at 2:00 PM' },
                    { label: 'Where', value: 'Main Stage, Crown Complex Event Center' },
                    { label: 'Entry Fee', value: 'FREE', gold: true },
                    { label: 'Check-In', value: 'Backstage by 1:00 PM Saturday' },
                    { label: 'Eligibility', value: 'Must be 18 years or older' },
                  ].map(item => (
                    <div key={item.label} className="flex gap-3">
                      <span className="w-20 shrink-0 text-right text-xs font-bold" style={{ color: '#C4A882' }}>{item.label}</span>
                      <span className="text-xs font-bold" style={{ color: 'gold' in item && item.gold ? '#C4A882' : '#999' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
                <span className="text-emboss">Prizes</span>
              </h2>
              <div className="space-y-2">
                {PRIZES.map(item => (
                  <div
                    key={item.place}
                    className="flex flex-col gap-1 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                  >
                    <span className="text-sm font-bold text-white">{item.place}</span>
                    <span className="text-xs" style={{ color: '#C4A882' }}>{item.prize}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* How to Enter */}
            <div>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
                <span className="text-emboss">How to Enter</span>
              </h2>
              <div
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div className="space-y-3 text-xs leading-relaxed" style={{ color: '#999' }}>
                  <p>
                    Entry is <strong style={{ color: '#C4A882' }}>FREE</strong>. Places are limited to 25 contestants and online registration comes first. If fewer than 25 register in advance, additional entries are taken at the contest table on the day.
                  </p>
                  <p>
                    Contestants should arrive backstage by 1:00 PM on Saturday for check-in and lineup coordination. The contest begins at 2:00 PM on the main stage.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Entry Form */}
          <div>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
              <span className="text-emboss">Entry Form</span>
            </h2>
            <div
              className="rounded-2xl p-6"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              {entrySlot}
              {!PINUP_REGISTRATION_OPEN ? (
                <div className="py-8 text-center">
                  <p className="text-lg font-bold text-white">Registration opens soon</p>
                  <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed" style={{ color: '#999' }}>
                    Online entry for the Miss AATC Pinup Contest is not open yet. Check back
                    shortly - places are limited and will be filled in the order they are
                    received.
                  </p>
                </div>
              ) : result ? (
                <div className="py-10 text-center">
                  <div
                    className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                    style={{ backgroundColor: result === 'confirmed' ? 'rgba(34,197,94,0.15)' : 'rgba(196,168,130,0.15)' }}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={result === 'confirmed' ? '#22c55e' : '#C4A882'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {result === 'confirmed'
                        ? <polyline points="20 6 9 17 4 12" />
                        : <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>}
                    </svg>
                  </div>
                  {/* The two outcomes say different things on purpose. Telling a
                      waitlisted entrant they are registered is the same failure
                      as the stub this replaced: a promise of a place that does
                      not exist. No prize amounts here - they are unconfirmed. */}
                  {result === 'confirmed' ? (
                    <>
                      <p className="text-lg font-bold text-white">You&apos;re registered</p>
                      <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: '#999' }}>
                        The contest is Saturday at 2:00 PM on the main stage. Please check in
                        backstage by 1:00 PM.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-white">You&apos;re on the waitlist</p>
                      <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: '#999' }}>
                        All 25 places are currently taken. We&apos;ll contact you if one opens up.
                        You can also try at the contest table on the day - if fewer contestants
                        check in than registered, places are filled from the waitlist first.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <HoneypotField value={honeypot} onChange={setHoneypot} />

                  <p className="text-xs" style={{ color: '#666' }}>
                    Entry is free. Fields marked * are required.
                  </p>

                  {error && (
                    <div
                      className="rounded-lg px-3 py-2 text-xs"
                      style={{ backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5' }}
                      role="alert"
                    >
                      {error}
                    </div>
                  )}

                  {FIELDS.map(f => (
                    <div key={f.key}>
                      <label htmlFor={f.key} className="mb-1 block text-xs" style={{ color: '#999' }}>
                        {f.label}{f.required && ' *'}
                      </label>
                      <input
                        id={f.key}
                        type={f.type}
                        value={form[f.key]}
                        onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        className={inputBase}
                        style={{ ...inputStyle, borderColor: fieldErrors[f.key] ? '#ef4444' : '#3a3a3a' }}
                        aria-invalid={Boolean(fieldErrors[f.key])}
                        aria-describedby={fieldErrors[f.key] ? `${f.key}-error` : undefined}
                      />
                      {fieldErrors[f.key] && (
                        <p id={`${f.key}-error`} className="mt-1 text-xs" style={{ color: '#fca5a5' }}>
                          {fieldErrors[f.key]}
                        </p>
                      )}
                    </div>
                  ))}

                  {/* Explicit, never inferred. Stored as age_confirmed. */}
                  <div>
                    <label className="flex items-start gap-2 text-xs" style={{ color: '#999' }}>
                      <input
                        type="checkbox"
                        checked={form.ageConfirmed === 'yes'}
                        onChange={e => setForm({ ...form, ageConfirmed: e.target.checked ? 'yes' : '' })}
                        className="mt-0.5"
                        aria-invalid={Boolean(fieldErrors.ageConfirmed)}
                      />
                      <span>I confirm I am 18 years of age or older. *</span>
                    </label>
                    {fieldErrors.ageConfirmed && (
                      <p className="mt-1 text-xs" style={{ color: '#fca5a5' }}>{fieldErrors.ageConfirmed}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-lg py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: '#8B7355' }}
                  >
                    {submitting ? 'Submitting...' : 'Register for the Pinup Contest'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Presented By */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: '#666' }}>
            <span className="text-emboss">Presented By</span>
          </p>
          <div
            className="inline-flex flex-col items-center rounded-2xl px-10 py-8"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl"
              style={{ backgroundColor: '#111', border: '2px solid #2a2a2a' }}
            >
              <span className="text-lg font-bold" style={{ color: '#555' }}>TBA</span>
            </div>
            <p className="mt-3 text-sm font-bold text-white">Sponsor TBA</p>
            <p className="mt-1 text-xs" style={{ color: '#999' }}>
              Sponsor details will be announced closer to the event.
            </p>
          </div>
        </div>
      </section>

      {/* Judging Criteria + Judges */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Judging Criteria</span>
          </h2>

          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <ul className="space-y-2.5">
              {CRITERIA.map(item => (
                <li key={item} className="flex items-center gap-2 text-xs" style={{ color: '#999' }}>
                  <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <h2 className="mb-6 mt-10 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Meet the Judges</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            {JUDGES.map((judge, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-2xl p-6 text-center"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div
                  className="mb-3 flex h-16 w-16 items-center justify-center rounded-full text-sm font-bold"
                  style={{ backgroundColor: '#111', border: '2px solid #2a2a2a', color: '#555' }}
                >
                  {judge.initials}
                </div>
                <h3 className="text-sm font-bold text-white">{judge.name}</h3>
                <p className="mt-0.5 text-xs font-semibold" style={{ color: '#C4A882' }}>{judge.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Questions about the Pinup Contest?</span>
        </p>
        <p className="text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Contact us at{' '}
          <a href="mailto:info@allamericantattooconvention.com" style={{ color: '#C4A882' }}>
            info@allamericantattooconvention.com
          </a></span>
        </p>
      </div>
    </div>
  )
}
