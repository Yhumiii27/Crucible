import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './src/server/http/security-headers';

const nextConfig: NextConfig = {
  // CRUCIBLE_DIST_DIR lets CI / verification builds use their own output folder (e.g. .next-ci) so they never overwrite the
  // .next of `next dev` (copied from Keystone).
  distDir: process.env.CRUCIBLE_DIST_DIR || '.next',
  // Security headers on every response, static assets included (the per-request Content-Security-Policy is set by
  // src/proxy.ts). HSTS only in production builds.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: staticSecurityHeaders(process.env.NODE_ENV === 'production') }];
  },
};

export default nextConfig;
