'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'

const REGISTRATION_OPENS = new Date('2026-06-01T00:00:00')

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

export default function ApplyClient({ content }: { content: Record<string, string> }) {
  const c = content
  const timeLeft = useCountdown(REGISTRATION_OPENS)

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* ── Header ── */}
      <header className="px-4 pt-10 pb-6 text-center">
        {/* Logo */}
        <img
          src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-assets/aatc-secondary-main-horizontal%202.png`}
          alt="All American Tattoo Convention"
          className="mx-auto h-24 w-auto sm:h-32 md:h-40"
        />
      </header>

      {/* ── Hero ── */}
      <section className="px-4 py-12 text-center">
        <p className="mb-0 text-sm font-medium uppercase tracking-widest" style={{ color: '#8B7355' }}>
          <span className="text-emboss">{c.hero_eyebrow}</span>
        </p>
        <h2 className="font-display text-3xl font-bold text-white sm:text-4xl md:text-5xl leading-relaxed">
          <span className="text-emboss">{c.hero_title}</span>
          <br className="hidden sm:block" />
          <span className="text-emboss" style={{ color: '#C4A882' }}> {c.hero_title_accent}</span>
        </h2>

        {/* Event details */}
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-6">
          <span className="text-emboss inline-flex items-center gap-2 whitespace-nowrap text-sm" style={{ color: '#999999' }}>
            <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {c.event_dates}
          </span>
          <span className="hidden h-4 w-px sm:block" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-emboss inline-flex items-center gap-2 whitespace-nowrap text-sm" style={{ color: '#999999' }}>
            <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <a href="https://share.google/vRhsv0xqNzDRTPtGC" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 transition-colors hover:text-white">{c.event_venue}</a>
          </span>
          <span className="hidden h-4 w-px sm:block" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-emboss text-sm" style={{ color: '#999999' }}>{c.event_location}</span>
        </div>
      </section>

      {/* ── Countdown ── */}
      <section className="px-4 pb-12">
        <div
          className="mx-auto max-w-2xl rounded-2xl p-8 text-center"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <p className="mb-6 text-sm font-medium uppercase tracking-widest" style={{ color: '#8B7355' }}>
            {c.countdown_heading}
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
          <p className="mt-6 text-sm font-bold uppercase tracking-wider" style={{ color: '#C4A882' }}>
            {c.countdown_opens_text} —{' '}
            <a
              href={`data:text/calendar;charset=utf-8,${encodeURIComponent(
                [
                  'BEGIN:VCALENDAR',
                  'VERSION:2.0',
                  'PRODID:-//AATC//EN',
                  'BEGIN:VEVENT',
                  'DTSTART:20270416T100000',
                  'DTEND:20270418T190000',
                  'SUMMARY:All American Tattoo Convention 2027',
                  'LOCATION:Crown Complex Event Center, Fayetteville, NC',
                  'DESCRIPTION:All American Tattoo Convention — April 16-18, 2027. Get your tickets at allamericantattooconvention.com',
                  'END:VEVENT',
                  'END:VCALENDAR',
                ].join('\r\n')
              )}`}
              download="aatc-2027.ics"
              className="underline underline-offset-4 transition-colors"
              style={{ color: '#C4A882' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#fff')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
            >
              {c.countdown_calendar_cta}
            </a>
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
            {c.cta_artist}
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
            {c.cta_vendor}
          </Link>
          {/* Sponsor — dark grey with gold accents */}
          <Link
            href="/sponsors/packages"
            className="flex flex-1 items-center justify-center gap-3 rounded-xl px-8 py-5 text-center font-semibold transition-all duration-200"
            style={{
              backgroundColor: '#2a2a2a',
              color: '#C4A882',
              border: '2px solid #3a3a3a',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = '#3a3a3a'
              el.style.borderColor = '#8B7355'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = '#2a2a2a'
              el.style.borderColor = '#3a3a3a'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>
            </svg>
            {c.cta_sponsor}
          </Link>
        </div>
      </section>

      {/* ── What to Expect ── */}
      <section className="px-4 pb-16">
        <div
          className="mx-auto max-w-2xl rounded-2xl p-8"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <h3 className="font-display mb-6 text-xl font-bold text-white">{c.expect_title}</h3>

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
                title: c.expect_step1_title,
                desc: c.expect_step1_desc,
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                ),
                title: c.expect_step2_title,
                desc: c.expect_step2_desc,
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                ),
                title: c.expect_step3_title,
                desc: c.expect_step3_desc,
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
                    <Markdown inline>{desc}</Markdown>
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
        style={{ borderColor: '#2a2a2a' }}
      >
        {/* Stars */}
        <div className="mb-3 flex justify-center gap-2 text-sm" style={{ color: '#8B7355' }}>
          {['★', '★', '★', '★', '★'].map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>

        <p className="font-display text-lg font-bold text-white"><span className="text-emboss">{c.footer_name}</span></p>
        <p className="mt-1 text-sm" style={{ color: '#999999' }}>
          <span className="text-emboss">{c.footer_location}</span>
        </p>

        <p className="mt-6 text-xs" style={{ color: '#555555' }}>
          <span className="text-emboss">© {new Date().getFullYear()} All American Tattoo Convention. All rights reserved.</span>
        </p>
      </footer>
    </div>
  )
}
