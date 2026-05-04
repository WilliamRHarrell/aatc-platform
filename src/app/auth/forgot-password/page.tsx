'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <div className="mb-3 flex justify-center gap-2 text-sm" style={{ color: '#8B7355' }}>
          {['★', '★', '★', '★', '★'].map((s, i) => <span key={i}>{s}</span>)}
        </div>
        <Link href="/apply">
          <h1 className="font-display text-2xl font-bold text-white"><span className="text-emboss">ALL AMERICAN</span></h1>
          <p className="font-display text-sm font-semibold" style={{ color: '#8B7355' }}>
            <span className="text-emboss">TATTOO CONVENTION</span>
          </p>
        </Link>
      </div>

      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
      >
        <h2 className="font-display mb-1 text-2xl font-bold text-white">Reset password</h2>
        <p className="mb-6 text-sm" style={{ color: '#999999' }}>
          {sent
            ? 'Check your inbox for a reset link.'
            : 'Enter your email and we’ll send a reset link.'}
        </p>

        {!sent && (
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg py-3 text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50"
              style={{ backgroundColor: '#8B7355' }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.backgroundColor = '#C4A882' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#8B7355' }}
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        {sent && (
          <div className="rounded-lg p-4 text-sm" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#999999' }}>
            We sent a reset link to <span className="text-white">{email}</span>. Click it to set a new password. The link will expire in 1 hour.
          </div>
        )}

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-xs" style={{ color: '#555555' }}>or</span>
          <div className="h-px flex-1" style={{ backgroundColor: '#2a2a2a' }} />
        </div>

        <p className="text-center text-sm" style={{ color: '#999999' }}>
          Remembered it?{' '}
          <Link
            href="/auth/login"
            className="font-medium transition-colors"
            style={{ color: '#C4A882' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#8B7355')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
          >
            Back to sign in
          </Link>
        </p>
      </div>

      <p className="mt-8 text-xs" style={{ color: '#555555' }}>
        <span className="text-emboss">© {new Date().getFullYear()} All American Tattoo Convention</span>
      </p>
    </div>
  )
}
