import type { MetadataRoute } from 'next'

import { listPublishedJobSlugs } from '@/db/queries/jobs'
import { clientEnv } from '@/lib/env'

/** Uma hora: publicar uma vaga não precisa aparecer no sitemap no mesmo minuto. */
export const revalidate = 3600

/**
 * Só vagas publicadas (doc 08). Arquivada sai daqui mas continua no ar: a URL é
 * permanente e o `validThrough` no passado já é o sinal de expiração.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = clientEnv().NEXT_PUBLIC_SITE_URL
  const vagas = await listPublishedJobSlugs()

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1,
    },
    ...vagas.map((vaga) => ({
      url: `${base}/vagas/${vaga.slug}`,
      lastModified: new Date(vaga.updatedAt),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ]
}
