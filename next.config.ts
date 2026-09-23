import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'srlgjovefsmtkxthtjkz.supabase.co',
      },
    ],
  },
  async redirects() {
    return [
      // The WordPress battle page and its two attachment sub-URLs (Wayback,
      // 2024-12 / 2025-01). Approved by Ryan 2026-09-23. `permanent` emits 308,
      // which every crawler and browser treats as a permanent move.
      { source: '/all-american-tattoo-battle-rules-signup', destination: '/tattoo-battle', permanent: true },
      { source: '/all-american-tattoo-battle-rules-signup/:path*', destination: '/tattoo-battle', permanent: true },
    ]
  },
};

export default nextConfig;
