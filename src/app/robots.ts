import type { MetadataRoute } from 'next'

import { clientEnv } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  const base = clientEnv().NEXT_PUBLIC_SITE_URL

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Área administrativa e API não têm o que indexar (doc 08).
      disallow: ['/admin', '/api', '/login', '/auth'],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
