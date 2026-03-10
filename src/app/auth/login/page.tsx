'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/apply'
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    toast.success('Signed in successfully')
    router.push(redirect)
    router.refresh()
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
    >
      {/* Header */}
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

      {/* Card */}
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
      >
        <h2 className="font-display mb-1 text-2xl font-bold text-white">Sign in</h2>
        <p className="mb-6 text-sm" style={{ color: '#999999' }}>
          Access your exhibitor account
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #2a2a2a',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#8B7355')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
              placeholder="you@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-white" htmlFor="password">
                Password
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-xs transition-colors"
                style={{ color: '#8B7355' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#8B7355')}
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm text-white outline-none transition-colors"
              style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #2a2a2a',
              }}
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
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-xs" style={{ color: '#555555' }}>
            or
          </span>
          <div className="h-px flex-1" style={{ backgroundColor: '#2a2a2a' }} />
        </div>

        <p className="text-center text-sm" style={{ color: '#999999' }}>
          Don&apos;t have an account?{' '}
          <Link
            href="/auth/signup"
            className="font-medium transition-colors"
            style={{ color: '#C4A882' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#8B7355')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
          >
            Create one
          </Link>
        </p>
      </div>

      <p className="mt-8 text-xs" style={{ color: '#555555' }}>
        <span className="text-emboss">© {new Date().getFullYear()} All American Tattoo Convention</span>
      </p>
    </div>
  )
}
