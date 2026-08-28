'use client'

import { useEffect, useState } from 'react'

/**
 * Client island: the ticking digits only.
 *
 * Deliberately scoped as tight as possible - the countdown heading, sub-line and
 * calendar CTA are CMS copy and stay in the server component around this. The
 * digits are not indexable content, so they are the only thing that needs JS.
 */
function remaining(targetMs: number) {
  const diff = targetMs - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="font-display text-4xl font-bold sm:text-5xl md:text-6xl"
        style={{ color: '#8B7355' }}
        suppressHydrationWarning
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-xs font-medium uppercase tracking-widest" style={{ color: '#999999' }}>
        {label}
      </span>
    </div>
  )
}

export default function CountdownDigits({ targetIso }: { targetIso: string }) {
  const targetMs = new Date(targetIso).getTime()
  const [timeLeft, setTimeLeft] = useState(() => remaining(targetMs))

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(remaining(targetMs)), 1000)
    return () => clearInterval(id)
  }, [targetMs])

  return (
    <div className="flex items-start justify-center gap-6 sm:gap-10">
      <Unit value={timeLeft.days} label="Days" />
      <span className="mt-2 text-3xl font-bold sm:text-4xl" style={{ color: '#8B7355' }}>:</span>
      <Unit value={timeLeft.hours} label="Hours" />
      <span className="mt-2 text-3xl font-bold sm:text-4xl" style={{ color: '#8B7355' }}>:</span>
      <Unit value={timeLeft.minutes} label="Minutes" />
      <span className="mt-2 text-3xl font-bold sm:text-4xl" style={{ color: '#8B7355' }}>:</span>
      <Unit value={timeLeft.seconds} label="Seconds" />
    </div>
  )
}
