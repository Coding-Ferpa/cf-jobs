import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { JobForm } from '@/components/admin/job-form'
import { JobRowActions } from '@/components/admin/job-row-actions'
import { StatusBadge } from '@/components/admin/status-badge'
import { Button } from '@/components/ui/button'
import { getAdminJob, getOpcoesDoFormulario } from '@/db/queries/admin'
import { requireRole } from '@/lib/auth'

export const metadata: Metadata = { title: 'Editar vaga' }

export default async function EditarVagaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const usuario = await requireRole('editor')
  const { id } = await params

  const [vaga, opcoes] = await Promise.all([getAdminJob(id), getOpcoesDoFormulario()])

  if (!vaga) notFound()

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
            {vaga.status === 'published' ? (
              <Button asChild className="self-start px-0" variant="link">
                <Link href={`/vagas/${vaga.slug}`} target="_blank">
                  Ver no site ↗
                </Link>
              </Button>
            ) : (
              <p className="text-muted-foreground text-caption">
                Ainda não está no ar. O endereço será /vagas/{vaga.slug}.
              </p>
            )}
          </div>

          <JobRowActions
            id={vaga.id}
            papel={usuario.role}
            status={vaga.status}
            titulo={vaga.title}
          />
        </div>
      </header>

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
  )
}
