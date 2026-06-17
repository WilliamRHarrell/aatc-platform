'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const NAV = [
  { href: '/portal', label: 'My Application', exact: true },
  { href: '/portal/graphics', label: 'Submit Graphics' },
]

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Shared portal top nav */}
      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, padding: '12px 20px', flexWrap: 'wrap',
          background: 'rgba(17,17,17,0.92)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #2a2a2a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#fff', letterSpacing: 1, fontSize: 14 }}>
            AATC <span style={{ color: '#8B7355' }}>PORTAL</span>
          </span>
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  fontSize: 14, fontWeight: 600, textDecoration: 'none',
                  color: active ? '#C4A882' : '#999',
                  borderBottom: active ? '2px solid #C4A882' : '2px solid transparent',
                  paddingBottom: 2,
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <button
          onClick={signOut}
          style={{
            background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 6,
            color: '#999', padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
          }}
        >
          Sign out
        </button>
      </nav>

      {children}
    </div>
  )
}
