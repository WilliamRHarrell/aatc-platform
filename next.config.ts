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
};

export default nextConfig;
