import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Document uploads pass through server actions; the API caps files at
    // UPLOAD_MAX_BYTES (10 MB). This only has to sit above that cap.
    serverActions: { bodySizeLimit: '12mb' },
  },
  // Baseline security headers for every page and route handler. A full
  // Content-Security-Policy needs per-request nonces for Next's inline
  // scripts, so only the framing directive is set here (clickjacking).
  async headers() {
    const headers = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
    ];
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
