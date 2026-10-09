import type { NextConfig } from "next";
import { CANONICAL_ORIGIN } from "./src/lib/site";

/**
 * The old preview host. Since the cutover (2026-10-08) every PAGE on it
 * 308s to the same path on www, so it stops competing with www in search.
 * /api/* is left alone on purpose: machine callers (the daily Vercel cron,
 * anything still configured with this host) keep working, and API routes
 * have nothing to index. Stripe already posts to www (Ryan, 2026-10-09).
 */
export const LEGACY_HOST = "aatc-platform.vercel.app";

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
      // vercel.app pages -> www (see LEGACY_HOST). The query string is carried
      // over by Next; a URL fragment (an emailed auth link's #access_token)
      // is kept by the browser across the redirect.
      {
        source: '/:path((?!api(?:/|$)).*)',
        has: [{ type: 'host', value: LEGACY_HOST }],
        destination: `${CANONICAL_ORIGIN}/:path`,
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
