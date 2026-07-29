import Link from 'next/link'

import type { JobListItem } from '@/db/queries/jobs'
import {
  diasAteExpirar,
  formatarDataRelativa,
  formatarLocalizacao,
  formatarSalario,
} from '@/lib/format'

const MAXIMO_DE_CHIPS = 4
const DIAS_PARA_AVISAR_ENCERRAMENTO = 3

function Iniciais({ nome }: { nome: string }) {
  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span
      aria-hidden="true"
      className="bg-surface text-caption text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-sm font-semibold"
    >
      {iniciais}
    </span>
  )
}

export function JobCard({ job }: { job: JobListItem }) {
  const localizacao = formatarLocalizacao(job.location, job.workMode?.slug)
  const salario = formatarSalario(job.salary)
  const chips = job.technologies.slice(0, MAXIMO_DE_CHIPS)
  const restantes = job.technologies.length - chips.length

  const diasRestantes = job.expiresAt ? diasAteExpirar(job.expiresAt) : null
  const encerrandoEmBreve =
    job.status === 'published' &&
    diasRestantes !== null &&
    diasRestantes >= 0 &&
    diasRestantes <= DIAS_PARA_AVISAR_ENCERRAMENTO

  const metadados = [localizacao, job.seniority?.label, job.contractType?.label].filter(
    (item): item is string => Boolean(item),
  )

  return (
    // O card inteiro é um link único: sem links aninhados, alvo de toque cheio.
    // `h-full` preenche a célula do grid (doc 03): com as alturas reservadas
    // abaixo, os cards de uma mesma linha ficam idênticos em altura e com os
    // rodapés alinhados.
    <Link
      className="border-border bg-card hover:border-primary hover:shadow-glow focus-visible:border-primary group flex h-full flex-col gap-3 rounded-md border p-5 transition duration-150 hover:-translate-y-0.5"
      href={`/vagas/${job.slug}`}
    >
      <div className="flex items-center gap-3">
        <Iniciais nome={job.company.name} />
        <span className="text-caption text-muted-foreground truncate">
          {job.company.name}
        </span>

        {job.status === 'archived' ? (
          <span className="bg-surface text-muted-foreground ml-auto rounded-full px-2 py-0.5 text-xs">
            Arquivada
          </span>
        ) : null}
        {encerrandoEmBreve ? (
          <span className="text-warning border-warning ml-auto rounded-full border px-2 py-0.5 text-xs">
            {diasRestantes === 0
              ? 'Encerra hoje'
              : `Encerra em ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`}
          </span>
        ) : null}
      </div>

      {/* Duas linhas sempre: `line-clamp-2` corta o que passa, e `min-h-[2lh]`
          segura o espaço quando o título cabe em uma só — sem isso o card de
          título curto sobe tudo o que vem abaixo. */}
      <h3 className="text-h3 line-clamp-2 min-h-[2lh] font-semibold">{job.title}</h3>

      {metadados.length > 0 ? (
        <p className="text-caption text-muted-foreground">{metadados.join(' · ')}</p>
      ) : null}

      {/* A lista é renderizada mesmo vazia, com a altura de uma linha de chip
          reservada: vaga sem tecnologia cadastrada não desalinha a vizinha. */}
      <ul className="flex min-h-[1.75rem] flex-wrap gap-2">
        {chips.map((tecnologia) => (
          <li
            className="bg-surface text-muted-foreground rounded-full px-2.5 py-1 font-mono text-xs"
            key={tecnologia.slug}
          >
            {tecnologia.label}
          </li>
        ))}
        {restantes > 0 ? (
          <li className="text-muted-foreground px-1 py-1 font-mono text-xs">
            +{restantes}
          </li>
        ) : null}
      </ul>

      <div className="text-caption mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="text-muted-foreground">
          {job.publishedAt ? formatarDataRelativa(job.publishedAt) : null}
        </span>
        {salario ? <span className="text-success font-medium">{salario}</span> : null}
      </div>
    </Link>
  )
}
