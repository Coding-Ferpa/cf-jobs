import type { NextConfig } from 'next'

import { staticSecurityHeaders } from './src/lib/security-headers'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: staticSecurityHeaders }]
  },
}

export default nextConfig
