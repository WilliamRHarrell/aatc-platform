'use client'

import { useState } from 'react'
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
  { place: '1st Place — Miss AATC', prize: 'Custom Crown, Sash, Trophy + $500 Cash + Convention Feature' },
  { place: '2nd Place — 1st Runner-Up', prize: 'Trophy + $250 Cash' },
  { place: '3rd Place — 2nd Runner-Up', prize: 'Trophy + $100 Cash' },
]

export default function PinupContestPage() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    socials: {
      instagram: '',
      facebook: '',
      tiktok: '',
      x: '',
    },
    socialPlatforms: {
      instagram: false,
      facebook: false,
      tiktok: false,
      x: false,
    },
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    // TODO: wire up to API / Supabase when ready
    await new Promise(r => setTimeout(r, 800))

    setSubmitted(true)
    setSubmitting(false)
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

      {/* Event Details + Entry Form — side by side */}
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
                    { label: 'When', value: 'Saturday, April 17 at 7:00 PM' },
                    { label: 'Where', value: 'Main Stage, Crown Complex Event Center' },
                    { label: 'Entry Fee', value: 'FREE', gold: true },
                    { label: 'Check-In', value: 'Backstage by 6:30 PM Saturday' },
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
                    Entry is <strong style={{ color: '#C4A882' }}>FREE</strong>. Fill out the registration form to secure your spot. Walk-up registration is also accepted at the event registration booth on Friday or Saturday before 5:00 PM, but pre-registration is encouraged as spots may be limited.
                  </p>
                  <p>
                    Contestants should arrive backstage by 6:30 PM on Saturday for check-in and lineup coordination. The contest begins promptly at 7:00 PM on the main stage.
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
              {submitted ? (
                <div className="py-10 text-center">
                  <div
                    className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                    style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-white">You&apos;re Registered!</p>
                  <p className="mt-2 text-sm" style={{ color: '#999' }}>
                    We&apos;ll see you backstage at 6:30 PM on Saturday. Good luck!
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <p className="text-xs" style={{ color: '#666' }}>
                    Entry is free. All fields marked with * are required.
                  </p>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>
                      Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className={inputBase}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className={inputBase}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>
                      Phone *
                    </label>
                    <input
                      type="tel"
                      required
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      className={inputBase}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>
                      Address
                    </label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={e => setForm({ ...form, address: e.target.value })}
                      placeholder="City, State"
                      className={inputBase}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider" style={{ color: '#999' }}>
                      Social Media
                    </label>
                    <div className="space-y-2">
                      {([
                        { key: 'instagram' as const, label: 'Instagram', placeholder: '@username' },
                        { key: 'facebook' as const, label: 'Facebook', placeholder: '/username' },
                        { key: 'tiktok' as const, label: 'TikTok', placeholder: '@username' },
                        { key: 'x' as const, label: 'X', placeholder: '@username' },
                      ]).map(platform => (
                        <div key={platform.key}>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={form.socialPlatforms[platform.key]}
                              onChange={e => setForm({
                                ...form,
                                socialPlatforms: { ...form.socialPlatforms, [platform.key]: e.target.checked },
                                socials: e.target.checked ? form.socials : { ...form.socials, [platform.key]: '' },
                              })}
                              className="h-3.5 w-3.5 rounded accent-[#8B7355]"
                            />
                            <span className="text-xs font-medium" style={{ color: '#999' }}>{platform.label}</span>
                          </label>
                          {form.socialPlatforms[platform.key] && (
                            <input
                              type="text"
                              value={form.socials[platform.key]}
                              onChange={e => setForm({ ...form, socials: { ...form.socials, [platform.key]: e.target.value } })}
                              placeholder={platform.placeholder}
                              className={`${inputBase} mt-1`}
                              style={inputStyle}
                            />
                          )}
                        </div>
                      ))}
                    </div>
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
