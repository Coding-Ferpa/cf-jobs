import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getDashboardSummary, listRecentAudit } from '@/db/queries/admin'
import { getCurrentUser } from '@/lib/auth'
import { formatarDataRelativa } from '@/lib/format'
import { hasRole } from '@/lib/roles'

/** KPIs de `v_dashboard_summary` (doc 09) + o que aconteceu por último. */

const ROTULO_DA_ACAO: Record<string, string> = {
  'job.create': 'criou a vaga',
  'job.update': 'editou a vaga',
  'job.publish': 'publicou a vaga',
  'job.archive': 'arquivou a vaga',
  'job.reject': 'rejeitou a vaga',
  'job.restore': 'voltou a vaga para rascunho',
  'job.delete': 'excluiu a vaga',
  'company.upsert': 'salvou a empresa',
  'taxonomy.upsert': 'salvou a taxonomia',
  'taxonomy.toggle_active': 'ativou ou desativou a taxonomia',
  'user.set_role': 'mudou o papel de alguém',
}

function Indicador({
  titulo,
  valor,
  destaque,
}: {
  titulo: string
  valor: number
  destaque?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-caption font-medium">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={`text-h2 font-bold ${destaque && valor > 0 ? 'text-warning' : ''}`}
          // O número sozinho não diz o que é para quem usa leitor de tela.
          aria-label={`${valor} ${titulo.toLowerCase()}`}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  )
}

export default async function AdminDashboardPage() {
  // O layout já garantiu sessão e papel mínimo; aqui só lemos para a saudação.
  const usuario = await getCurrentUser()
  const podeCurar = usuario ? hasRole(usuario.role, 'editor') : false

  const [resumo, auditoria] = await Promise.all([
    getDashboardSummary(),
    listRecentAudit(8),
  ])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 font-bold">Painel</h1>
          <p className="text-muted-foreground text-caption">
            {podeCurar
              ? 'Você pode criar, editar e publicar vagas.'
              : 'Seu acesso é de leitura e revisão de sugestões.'}
          </p>
        </div>

        {podeCurar ? (
          <Button asChild>
            <Link href="/admin/vagas/nova">Nova vaga</Link>
          </Button>
        ) : null}
      </header>

      <section aria-labelledby="titulo-indicadores" className="flex flex-col gap-3">
        <h2 className="text-caption font-semibold" id="titulo-indicadores">
          Vagas
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador titulo="Publicadas" valor={resumo.jobsPublished} />
          <Indicador destaque titulo="Em revisão" valor={resumo.jobsPendingReview} />
          <Indicador titulo="Rascunhos" valor={resumo.jobsDraft} />
          <Indicador titulo="Arquivadas" valor={resumo.jobsArchived} />
        </div>
      </section>

      <section aria-labelledby="titulo-pipeline" className="flex flex-col gap-3">
        <h2 className="text-caption font-semibold" id="titulo-pipeline">
          Importação e curadoria
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador destaque titulo="Importações falhas" valor={resumo.importsFailed} />
          <Indicador titulo="Importações em revisão" valor={resumo.importsInReview} />
          <Indicador
            destaque
            titulo="Sugestões pendentes"
            valor={resumo.suggestionsPending}
          />
          <Indicador titulo="Vagas rejeitadas" valor={resumo.jobsRejected} />
        </div>
      </section>

      <section aria-labelledby="titulo-auditoria" className="flex flex-col gap-3">
        <h2 className="text-caption font-semibold" id="titulo-auditoria">
          Últimas ações
        </h2>

        {auditoria.length === 0 ? (
          <p className="text-muted-foreground text-caption border-border rounded-md border border-dashed p-6 text-center">
            Nada registrado ainda. Toda ação do admin aparece aqui.
          </p>
        ) : (
          <ul className="border-border divide-border divide-y rounded-md border">
            {auditoria.map((linha) => (
              <li
                className="text-caption flex flex-wrap items-center gap-2 px-4 py-3"
                key={linha.id}
              >
                <Badge variant="secondary">{linha.entity}</Badge>
                <span className="text-foreground font-medium">
                  {linha.actorName ?? 'Alguém'}
                </span>
                <span className="text-muted-foreground">
                  {ROTULO_DA_ACAO[linha.action] ?? linha.action}
                </span>
                <span className="text-muted-foreground ml-auto">
                  {formatarDataRelativa(linha.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
