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
};

export default nextConfig;
