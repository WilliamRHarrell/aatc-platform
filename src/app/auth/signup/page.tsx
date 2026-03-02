'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center px-4"
        style={{ backgroundColor: '#0a0a0a' }}
      >
        <div
          className="w-full max-w-md rounded-2xl p-8 text-center"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          {/* Envelope icon */}
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: '#0a0a0a' }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8B7355"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h2 className="font-display mb-2 text-2xl font-bold text-white">Check your email</h2>
          <p className="mb-1 text-sm" style={{ color: '#999999' }}>
            We sent a confirmation link to
          </p>
          <p className="mb-6 font-medium" style={{ color: '#C4A882' }}>
            {email}
          </p>
          <p className="mb-6 text-sm leading-relaxed" style={{ color: '#999999' }}>
            Click the link in the email to confirm your account, then come back to sign in.
          </p>
          <Link
            href="/auth/login"
            className="inline-block rounded-lg px-6 py-3 text-sm font-semibold text-white transition-all duration-150"
            style={{ backgroundColor: '#8B7355' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#C4A882')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#8B7355')}
          >
            Go to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mb-3 flex justify-center gap-2 text-sm" style={{ color: '#8B7355' }}>
          {['★', '★', '★', '★', '★'].map((s, i) => <span key={i}>{s}</span>)}
        </div>
        <Link href="/apply">
          <h1 className="font-display text-2xl font-bold text-white">ALL AMERICAN</h1>
          <p className="font-display text-sm font-semibold" style={{ color: '#8B7355' }}>
            TATTOO CONVENTION
          </p>
        </Link>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
      >
        <h2 className="font-display mb-1 text-2xl font-bold text-white">Create account</h2>
        <p className="mb-6 text-sm" style={{ color: '#999999' }}>
          Register to apply as an exhibitor
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white" htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
              placeholder="Jane Doe"
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
              placeholder="you@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
              placeholder="Min. 8 characters"
            />
          </div>

          {/* Confirm password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white" htmlFor="confirm">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
              placeholder="••••••••"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg py-3 text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50"
            style={{ backgroundColor: '#8B7355' }}
            onMouseEnter={e => {
              if (!loading) (e.currentTarget as HTMLElement).style.backgroundColor = '#C4A882'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLElement).style.backgroundColor = '#8B7355'
            }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-xs" style={{ color: '#555555' }}>or</span>
          <div className="h-px flex-1" style={{ backgroundColor: '#2a2a2a' }} />
        </div>

        <p className="text-center text-sm" style={{ color: '#999999' }}>
          Already have an account?{' '}
          <Link
            href="/auth/login"
            className="font-medium transition-colors"
            style={{ color: '#C4A882' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#8B7355')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
          >
            Sign in
          </Link>
        </p>
      </div>

      <p className="mt-8 text-xs" style={{ color: '#555555' }}>
        © {new Date().getFullYear()} All American Tattoo Convention
      </p>
    </div>
  )
}
