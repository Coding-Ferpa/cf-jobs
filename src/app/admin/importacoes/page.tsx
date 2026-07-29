import type { Metadata } from 'next'
import Link from 'next/link'

import { ImportRetry } from '@/components/admin/import-retry'
import { duracao } from '@/components/admin/import-panels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listarImportacoes } from '@/db/queries/imports'
import { requireRole } from '@/lib/auth'
import { formatarData } from '@/lib/format'

export const metadata: Metadata = { title: 'Importações' }

/**
 * O "Tentar novamente" desta tela dispara o mesmo pipeline em segundo plano, e
 * uma Server Action roda na rota de onde foi chamada — sem este teto, a
 * repetição morreria no limite padrão da função (doc 02). Ver
 * `lib/import-runtime`.
 */
export const maxDuration = 300

/**
 * Log das importações (doc 08), com filtro por status, adapter e modelo — que
 * é o recorte que o painel de observabilidade do doc 09 também usa.
 *
 * Os filtros são links e não formulário: cada combinação vira URL, e mandar
 * "as falhas do Gupy" para outra pessoa é copiar o endereço.
 */

const ROTULO_DO_STATUS: Record<string, { texto: string; classe: string }> = {
  queued: { texto: 'Na fila', classe: 'bg-surface text-muted-foreground' },
  fetching: { texto: 'Buscando', classe: 'text-warning border-warning' },
  extracting: { texto: 'Extraindo', classe: 'text-warning border-warning' },
  classifying: { texto: 'Classificando', classe: 'text-warning border-warning' },
  mapping: { texto: 'Mapeando', classe: 'text-warning border-warning' },
  review: { texto: 'Em revisão', classe: 'text-success border-success' },
  completed: { texto: 'Concluída', classe: 'text-success border-success' },
  failed: { texto: 'Falhou', classe: 'text-destructive border-destructive' },
}

const ROTULO_DA_ETAPA: Record<string, string> = {
  fetching: 'busca',
  extracting: 'extração',
  classifying: 'classificação',
  mapping: 'mapeamento',
  persisting: 'gravação',
  cancelled: 'cancelada',
}

type Busca = { status?: string; adapter?: string; modelo?: string; pagina?: string }

function comFiltro(atual: Busca, mudanca: Partial<Busca>): string {
  const parametros = new URLSearchParams()
  const combinado = { ...atual, ...mudanca, pagina: undefined }

  for (const [chave, valor] of Object.entries(combinado)) {
    if (valor) parametros.set(chave, valor)
  }

  const query = parametros.toString()
  return query ? `/admin/importacoes?${query}` : '/admin/importacoes'
}

function Filtro({
  atual,
  ativo,
  campo,
  rotulo,
  valor,
}: {
  atual: Busca
  ativo: boolean
  campo: keyof Busca
  rotulo: string
  valor?: string
}) {
  return (
    <Button asChild size="sm" variant={ativo ? 'default' : 'outline'}>
      <Link href={comFiltro(atual, { [campo]: valor })}>{rotulo}</Link>
    </Button>
  )
}

export default async function ImportacoesPage({
  searchParams,
}: {
  searchParams: Promise<Busca>
}) {
  await requireRole('editor')

  const busca = await searchParams
  const pagina = Number(busca.pagina ?? '1') || 1

  const { linhas, total, sourceSites, models } = await listarImportacoes({
    ...(busca.status ? { status: busca.status } : {}),
    ...(busca.adapter ? { sourceSite: busca.adapter } : {}),
    ...(busca.modelo ? { model: busca.modelo } : {}),
    pagina,
  })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-h2 font-bold">Importações</h1>
          <p className="text-muted-foreground text-caption">
            {total} {total === 1 ? 'tentativa registrada' : 'tentativas registradas'}.
            Cada linha guarda etapa, modelo, tokens e tempo.
          </p>
        </div>

        <Button asChild>
          <Link href="/admin/vagas/importar">Importar vaga</Link>
        </Button>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground w-16">Status</span>
          <Filtro atual={busca} ativo={!busca.status} campo="status" rotulo="Todos" />
          <Filtro
            atual={busca}
            ativo={busca.status === 'review'}
            campo="status"
            rotulo="Em revisão"
            valor="review"
          />
          <Filtro
            atual={busca}
            ativo={busca.status === 'failed'}
            campo="status"
            rotulo="Falhas"
            valor="failed"
          />
        </div>

        {sourceSites.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-muted-foreground w-16">Adapter</span>
            <Filtro atual={busca} ativo={!busca.adapter} campo="adapter" rotulo="Todos" />
            {sourceSites.map((site) => (
              <Filtro
                atual={busca}
                ativo={busca.adapter === site}
                campo="adapter"
                key={site}
                rotulo={site}
                valor={site}
              />
            ))}
          </div>
        ) : null}

        {models.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-muted-foreground w-16">Modelo</span>
            <Filtro atual={busca} ativo={!busca.modelo} campo="modelo" rotulo="Todos" />
            {models.map((modelo) => (
              <Filtro
                atual={busca}
                ativo={busca.modelo === modelo}
                campo="modelo"
                key={modelo}
                rotulo={modelo}
                valor={modelo}
              />
            ))}
          </div>
        ) : null}
      </div>

      {linhas.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed px-6 py-12 text-center">
          Nenhuma importação com esse recorte.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vaga / endereço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Adapter</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Tempo</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>

            <TableBody>
              {linhas.map((linha) => {
                const status = ROTULO_DO_STATUS[linha.status] ?? {
                  texto: linha.status,
                  classe: '',
                }

                return (
                  <TableRow key={linha.id}>
                    <TableCell className="max-w-xs">
                      {linha.jobId ? (
                        <Link
                          className="text-primary font-medium underline-offset-4 hover:underline"
                          href={`/admin/vagas/${linha.jobId}/revisar`}
                        >
                          {linha.jobTitle}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground block truncate text-xs">
                          {linha.url}
                        </span>
                      )}
                      {linha.errorMessage ? (
                        <p className="text-destructive mt-1 text-xs">
                          {linha.errorStep
                            ? `Na ${ROTULO_DA_ETAPA[linha.errorStep] ?? linha.errorStep}: `
                            : null}
                          {linha.errorMessage}
                        </p>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      <Badge className={status.classe} variant="outline">
                        {status.texto}
                      </Badge>
                      {linha.attempt > 1 ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {linha.attempt}ª
                        </span>
                      ) : null}
                    </TableCell>

                    <TableCell className="text-caption">
                      {linha.sourceSite ?? '—'}
                    </TableCell>

                    <TableCell className="text-caption max-w-40 truncate">
                      {linha.model ?? '—'}
                    </TableCell>

                    <TableCell className="text-caption text-right tabular-nums">
                      {linha.tokensIn === null && linha.tokensOut === null
                        ? '—'
                        : (linha.tokensIn ?? 0) + (linha.tokensOut ?? 0)}
                    </TableCell>

                    <TableCell className="text-caption text-right tabular-nums">
                      {duracao(linha.latencyMs)}
                    </TableCell>

                    <TableCell className="text-caption whitespace-nowrap">
                      {formatarData(linha.createdAt)}
                    </TableCell>

                    <TableCell>
                      {linha.status === 'failed' ? (
                        <ImportRetry importId={linha.id} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
