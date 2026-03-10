'use client'

import Link from 'next/link'

export default function BoothTypeToggle({ active }: { active: 'artist' | 'vendor' }) {
  return (
    <div
      className="mb-6 inline-flex rounded-xl p-1"
      style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
    >
      <Link
        href="/apply/artist"
        className="rounded-lg px-5 py-2 text-xs font-bold transition-colors"
        style={{
          backgroundColor: active === 'artist' ? '#8B7355' : 'transparent',
          color: active === 'artist' ? '#fff' : '#666',
        }}
      >
        Artist Booth
      </Link>
      <Link
        href="/apply/vendor"
        className="rounded-lg px-5 py-2 text-xs font-bold transition-colors"
        style={{
          backgroundColor: active === 'vendor' ? '#8B7355' : 'transparent',
          color: active === 'vendor' ? '#fff' : '#666',
        }}
      >
        Vendor Booth
      </Link>
    </div>
  )
}
