import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { JobForm } from '@/components/admin/job-form'
import { JobRowActions } from '@/components/admin/job-row-actions'
import { ReviewPanel } from '@/components/admin/review-panel'
import { StatusBadge } from '@/components/admin/status-badge'
import { getAdminJob, getOpcoesDoFormulario } from '@/db/queries/admin'
import { importacaoDaVaga } from '@/db/queries/imports'
import { sugestoesDaVaga, taxonomiasDoTipo } from '@/db/queries/suggestions'
import { conferirRevisao, lerRespostaDaIa } from '@/features/import/review'
import { requireRole } from '@/lib/auth'

/**
 * A tela mais importante do admin (doc 08): é onde a vaga que a IA montou
 * vira — ou não — vaga publicada.
 *
 * O formulário é o mesmo da edição manual, de propósito: quem revisa não
 * precisa aprender dois formulários, e o que muda é o contexto em volta —
 * o painel com a origem, o que não casou com o cadastro e as sugestões
 * pendentes desta vaga.
 */

export const metadata: Metadata = { title: 'Revisar vaga importada' }

export default async function RevisarVagaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const usuario = await requireRole('editor')
  const { id } = await params

  const [vaga, opcoes, importacao, sugestoes] = await Promise.all([
    getAdminJob(id),
    getOpcoesDoFormulario(),
    importacaoDaVaga(id),
    sugestoesDaVaga(id),
  ])

  if (!vaga) notFound()

  const conferencia = conferirRevisao({
    ia: lerRespostaDaIa(importacao?.aiResponse),
    vaga: {
      roleCategoryId: vaga.roleCategoryId,
      seniorityId: vaga.seniorityId,
      workModeId: vaga.workModeId,
      contractTypeId: vaga.contractTypeId,
      technologyIds: vaga.technologyIds,
      tagIds: vaga.tagIds,
      salaryMin: vaga.salaryMin,
      locationCity: vaga.locationCity,
      locationCountry: vaga.locationCountry,
    },
  })

  // Uma consulta por tipo presente na fila, não uma por sugestão: dez termos de
  // tecnologia pendentes na mesma vaga não são dez idas ao banco.
  const tipos = [...new Set(sugestoes.map((sugestao) => sugestao.kind))]
  const destinos = Object.fromEntries(
    await Promise.all(
      tipos.map(async (tipo) => [tipo, await taxonomiasDoTipo(tipo)] as const),
    ),
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          className="text-caption text-muted-foreground hover:text-foreground transition duration-150"
          href="/admin/vagas"
        >
          ← Vagas
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-h2 font-bold">{vaga.title}</h1>
              <StatusBadge status={vaga.status} />
            </div>
            <p className="text-muted-foreground text-caption">
              Confira os campos, resolva as sugestões e publique. Nada foi ao ar ainda.
            </p>
          </div>

          <JobRowActions
            id={vaga.id}
            papel={usuario.role}
            status={vaga.status}
            titulo={vaga.title}
          />
        </div>
      </header>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <JobForm
            opcoes={opcoes}
            vaga={{
              id: vaga.id,
              title: vaga.title,
              companyId: vaga.companyId,
              descriptionMd: vaga.descriptionMd,
              summary: vaga.summary ?? '',
              roleCategoryId: vaga.roleCategoryId,
              seniorityId: vaga.seniorityId,
              workModeId: vaga.workModeId,
              contractTypeId: vaga.contractTypeId,
              locationCity: vaga.locationCity ?? '',
              locationState: vaga.locationState ?? '',
              locationCountry: vaga.locationCountry ?? '',
              salaryMin: vaga.salaryMin ?? '',
              salaryMax: vaga.salaryMax ?? '',
              salaryCurrency: vaga.salaryCurrency as 'BRL' | 'USD' | 'EUR' | null,
              salaryPeriod: vaga.salaryPeriod as 'hour' | 'month' | 'year',
              benefits: vaga.benefits.join('\n'),
              keywords: vaga.keywords.join('\n'),
              language: vaga.language,
              sourceUrl: vaga.sourceUrl,
              applyUrl: vaga.applyUrl,
              technologyIds: vaga.technologyIds,
              tagIds: vaga.tagIds,
            }}
          />
        </div>

        <ReviewPanel
          conferencia={conferencia}
          destinos={destinos}
          importacao={importacao}
          sugestoes={sugestoes}
        />
      </div>
    </div>
  )
}
