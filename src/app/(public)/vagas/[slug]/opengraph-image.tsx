import { ImageResponse } from 'next/og'

import { getJobBySlug } from '@/db/queries/jobs'
import { formatarLocalizacao } from '@/lib/format'

export const alt = 'Vaga no CF Jobs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Imagem de compartilhamento com a identidade da comunidade (doc 08): fundo
 * quase preto, glow violeta e os dados que decidem o clique.
 */
export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const vaga = await getJobBySlug(slug)

  const titulo = vaga?.title ?? 'Vagas de tecnologia, direto ao ponto.'
  const empresa = vaga?.company.name ?? 'Comunidade Coding Ferpa'
  const chips = [
    vaga?.seniority?.label,
    vaga?.workMode?.label,
    vaga ? formatarLocalizacao(vaga.location, vaga.workMode?.slug) : null,
  ].filter((item): item is string => Boolean(item))

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#0d0d0d',
        padding: '64px',
        // O glow violeta é a assinatura da marca.
        backgroundImage:
          'radial-gradient(circle at 85% 15%, rgba(139,92,246,0.35), transparent 55%)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ color: '#a3a3a3', fontSize: 32 }}>{empresa}</div>
        <div
          style={{
            color: '#f5f5f5',
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.15,
            display: 'flex',
          }}
        >
          {titulo}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {chips.map((chip) => (
          <div
            key={chip}
            style={{
              color: '#c4b5fd',
              fontSize: 26,
              border: '1px solid #262626',
              borderRadius: 999,
              padding: '10px 24px',
              display: 'flex',
            }}
          >
            {chip}
          </div>
        ))}
        <div
          style={{
            color: '#8b5cf6',
            fontSize: 30,
            fontWeight: 700,
            marginLeft: 'auto',
            display: 'flex',
          }}
        >
          CF Jobs
        </div>
      </div>
    </div>,
    size,
  )
}
