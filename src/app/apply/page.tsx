'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const REGISTRATION_OPENS = new Date('2026-04-19T00:00:00')

function useCountdown(target: Date) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const calc = () => {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return
      }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      })
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [target])

  return timeLeft
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="font-display text-4xl font-bold sm:text-5xl md:text-6xl"
        style={{ color: '#8B7355' }}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-xs font-medium uppercase tracking-widest" style={{ color: '#999999' }}>
        {label}
      </span>
    </div>
  )
}

export default function ApplyPage() {
  const timeLeft = useCountdown(REGISTRATION_OPENS)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* ── Header ── */}
      <header className="px-4 pt-10 pb-6 text-center">
        {/* Stars */}
        <div className="mb-3 flex justify-center gap-2 text-xl" style={{ color: '#8B7355' }}>
          {['★', '★', '★', '★', '★'].map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>

        {/* Logotype */}
        <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
          ALL AMERICAN
        </h1>
        <p className="mt-1 font-display text-2xl font-semibold sm:text-3xl md:text-4xl" style={{ color: '#8B7355' }}>
          TATTOO CONVENTION
        </p>

        {/* Gold divider */}
        <div
          className="mx-auto mt-6 h-px w-32 sm:w-48"
          style={{ backgroundColor: '#8B7355', opacity: 0.6 }}
        />
      </header>

      {/* ── Hero ── */}
      <section className="px-4 py-12 text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest" style={{ color: '#8B7355' }}>
          Pre-Registration
        </p>
        <h2 className="font-display text-3xl font-bold text-white sm:text-4xl md:text-5xl">
          Pre-Register for AATC
          <br className="hidden sm:block" />
          <span style={{ color: '#C4A882' }}> Fayetteville 2027</span>
        </h2>

        {/* Event details */}
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-6">
          <span className="flex items-center gap-2 text-sm" style={{ color: '#999999' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            April 16–18, 2027
          </span>
          <span className="hidden h-4 w-px sm:block" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="flex items-center gap-2 text-sm" style={{ color: '#999999' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            Crown Complex Event Center
          </span>
          <span className="hidden h-4 w-px sm:block" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-sm" style={{ color: '#999999' }}>Fayetteville, NC</span>
        </div>
      </section>

      {/* ── Countdown ── */}
      <section className="px-4 pb-12">
        <div
          className="mx-auto max-w-2xl rounded-2xl p-8 text-center"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <p className="mb-6 text-sm font-medium uppercase tracking-widest" style={{ color: '#8B7355' }}>
            Pre-Registration Opens In
          </p>
          <div className="flex items-start justify-center gap-6 sm:gap-10">
            <CountdownUnit value={timeLeft.days} label="Days" />
            <span className="mt-2 text-3xl font-bold sm:text-4xl" style={{ color: '#8B7355' }}>:</span>
            <CountdownUnit value={timeLeft.hours} label="Hours" />
            <span className="mt-2 text-3xl font-bold sm:text-4xl" style={{ color: '#8B7355' }}>:</span>
            <CountdownUnit value={timeLeft.minutes} label="Minutes" />
            <span className="mt-2 text-3xl font-bold sm:text-4xl" style={{ color: '#8B7355' }}>:</span>
            <CountdownUnit value={timeLeft.seconds} label="Seconds" />
          </div>
          <p className="mt-6 text-sm" style={{ color: '#999999' }}>
            Opening April 19, 2026 — mark your calendar
          </p>
        </div>
      </section>

      {/* ── CTA Buttons ── */}
      <section className="px-4 pb-12">
        <div className="mx-auto flex max-w-xl flex-col gap-4 sm:flex-row">
          {/* Artist — gold filled */}
          <Link
            href="/apply/artist"
            className="group flex flex-1 items-center justify-center gap-3 rounded-xl px-8 py-5 text-center font-semibold transition-all duration-200"
            style={{
              backgroundColor: '#8B7355',
              color: '#FFFFFF',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLElement).style.backgroundColor = '#C4A882'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLElement).style.backgroundColor = '#8B7355'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            Apply as Artist
          </Link>

          {/* Vendor — gold outline */}
          <Link
            href="/apply/vendor"
            className="flex flex-1 items-center justify-center gap-3 rounded-xl px-8 py-5 text-center font-semibold transition-all duration-200"
            style={{
              backgroundColor: 'transparent',
              color: '#C4A882',
              border: '2px solid #8B7355',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = '#8B7355'
              el.style.color = '#FFFFFF'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = 'transparent'
              el.style.color = '#C4A882'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            Apply as Vendor
          </Link>
        </div>
      </section>

      {/* ── What to Expect ── */}
      <section className="px-4 pb-16">
        <div
          className="mx-auto max-w-2xl rounded-2xl p-8"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <h3 className="font-display mb-6 text-xl font-bold text-white">What to Expect</h3>

          <ul className="space-y-5">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                ),
                title: 'Submit your application',
                desc: 'Fill out a short form with your business info, preferred booth size, and artist count. No payment required upfront.',
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                ),
                title: 'Review and approval',
                desc: 'Our team reviews every application. Approved applicants receive a confirmation email with their invoice and booth assignment.',
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                ),
                title: 'Secure your spot',
                desc: 'Pay your invoice online via Stripe to lock in your booth. A printable confirmation and floor plan are available in your exhibitor portal.',
              },
            ].map(({ icon, title, desc }) => (
              <li key={title} className="flex gap-4">
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: '#0a0a0a', color: '#8B7355' }}
                >
                  {icon}
                </div>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: '#999999' }}>
                    {desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="border-t px-4 py-10 text-center"
        style={{ borderColor: '#2a2a2a', backgroundColor: '#0a0a0a' }}
      >
        {/* Stars */}
        <div className="mb-3 flex justify-center gap-2 text-sm" style={{ color: '#8B7355' }}>
          {['★', '★', '★', '★', '★'].map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>

        <p className="font-display text-lg font-bold text-white">ALL AMERICAN TATTOO CONVENTION</p>
        <p className="mt-1 text-sm" style={{ color: '#999999' }}>
          Crown Complex Event Center · Fayetteville, NC
        </p>

        {/* Social placeholders */}
        <div className="mt-5 flex justify-center gap-5">
          {[
            { label: 'Instagram', href: '#' },
            { label: 'Facebook', href: '#' },
            { label: 'TikTok', href: '#' },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="text-sm transition-colors duration-150"
              style={{ color: '#999999' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999999')}
            >
              {label}
            </a>
          ))}
        </div>

        <p className="mt-6 text-xs" style={{ color: '#555555' }}>
          © {new Date().getFullYear()} All American Tattoo Convention. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
