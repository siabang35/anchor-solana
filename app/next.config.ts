import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  turbopack: {},
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://localhost:* http://127.0.0.1:* https://*.solana.com wss://*.solana.com https://*.helius-rpc.com wss://*.helius-rpc.com https://api.exoduze.com https://www.exoduze.com wss://api.exoduze.com https://api.binance.com wss://stream.binance.com:9443",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  async rewrites() {
    // Clean URLs: /politics → /category/politics (internally)
    const sectors = ['politics', 'finance', 'tech', 'crypto', 'sports', 'economy', 'science'];
    return sectors.map(sector => ({
      source: `/${sector}`,
      destination: `/category/${sector}`,
    }));
  },
};

export default nextConfig;
