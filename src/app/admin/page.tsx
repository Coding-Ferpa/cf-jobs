import Link from 'next/link'

import { SerieDeEngajamento } from '@/components/admin/analytics-chart'
import {
  AteQuandoAgrega,
  PainelDeEngajamento,
  PainelDeOrigens,
  PainelDeSaude,
  PainelDeTags,
  PainelDeTopEmpresas,
  PainelDeTopTecnologias,
  PainelDeTopVagas,
  SeletorDePeriodo,
} from '@/components/admin/analytics-panels'
import { PainelDeImportacoes, PainelDeOrcamento } from '@/components/admin/import-panels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getDashboardSummary, listRecentAudit } from '@/db/queries/admin'
import {
  importacoesDasUltimas24h,
  origemDeVisitantes,
  resumoDeEngajamento,
  serieDiaria,
  topEmpresas,
  topTags,
  topTecnologias,
  topVagas,
  ultimaExecucaoDoCron,
} from '@/db/queries/analytics'
import { estatisticasDeImportacao } from '@/db/queries/import-stats'
import { avaliarSaude } from '@/features/analytics/painel'
import { avaliarOrcamento } from '@/features/import/budget'
import { periodoValido } from '@/lib/analytics-periodos'
import { getCurrentUser } from '@/lib/auth'
import { serverEnv } from '@/lib/env'
import { formatarDataRelativa } from '@/lib/format'
import { hasRole } from '@/lib/roles'

/**
 * O dashboard do doc 09: saúde no topo, KPIs de `v_dashboard_summary`,
 * engajamento e importação — e por último o que aconteceu.
 *
 * O período (7/30/90) chega por query string e vale para tudo o que é série ou
 * top. Um seletor por widget daria mais liberdade e nenhuma resposta: comparar
 * "vagas mais vistas em 7 dias" com "tecnologias procuradas em 90" não diz nada.
 */

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
  'taxonomy.approve': 'aprovou a sugestão',
  'taxonomy.merge': 'mesclou a sugestão',
  'taxonomy.reject': 'rejeitou a sugestão',
  'import.start': 'abriu uma importação',
  'import.review': 'importou a vaga',
  'import.retry': 'repetiu a importação',
  'import.cancel': 'cancelou a importação',
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

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  // O layout já garantiu sessão e papel mínimo; aqui só lemos para a saudação.
  const usuario = await getCurrentUser()
  const podeCurar = usuario ? hasRole(usuario.role, 'editor') : false

  const dias = periodoValido((await searchParams).periodo)

  const [
    resumo,
    auditoria,
    estatisticas,
    engajamento,
    serie,
    vagasEmDestaque,
    empresas,
    tecnologias,
    tags,
    origens,
    importacoes24h,
    cron,
  ] = await Promise.all([
    getDashboardSummary(),
    listRecentAudit(8),
    estatisticasDeImportacao(),
    resumoDeEngajamento(dias),
    serieDiaria(dias),
    topVagas(dias),
    topEmpresas(dias),
    topTecnologias(dias),
    topTags(),
    origemDeVisitantes(dias),
    importacoesDasUltimas24h(),
    ultimaExecucaoDoCron(),
  ])

  // O teto é opcional (doc 05): sem ele o painel continua mostrando consumo e
  // custo, e nada bloqueia.
  const orcamento = avaliarOrcamento({
    tokensIn: estatisticas.tokensInDoMes,
    tokensOut: estatisticas.tokensOutDoMes,
    teto: serverEnv().AI_MONTHLY_TOKEN_BUDGET ?? null,
  })

  const saude = avaliarSaude({
    importacoes: importacoes24h,
    sugestoesPendentes: resumo.suggestionsPending,
    orcamento,
    cron,
    agora: new Date(),
  })

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

      <section aria-labelledby="titulo-saude" className="flex flex-col gap-3">
        <h2 className="text-caption font-semibold" id="titulo-saude">
          Saúde
        </h2>
        <PainelDeSaude badges={saude} />
      </section>

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

      <section aria-labelledby="titulo-audiencia" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-caption font-semibold" id="titulo-audiencia">
            Audiência
          </h2>
          <SeletorDePeriodo atual={dias} base="/admin" />
        </div>

        <PainelDeEngajamento dias={dias} resumo={engajamento} />

        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-caption font-medium">
              Visualizações e cliques por dia
            </CardTitle>
            <AteQuandoAgrega ultimoDia={engajamento.ultimoDia} />
          </CardHeader>
          <CardContent>
            <SerieDeEngajamento pontos={serie} />
          </CardContent>
        </Card>

        <div className="grid gap-3 lg:grid-cols-2">
          <PainelDeTopVagas vagas={vagasEmDestaque} />
          <PainelDeTopEmpresas empresas={empresas} />
          <PainelDeTopTecnologias tecnologias={tecnologias} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:gap-3">
            <PainelDeOrigens origens={origens} />
            <PainelDeTags tags={tags} />
          </div>
        </div>
      </section>

      <section aria-labelledby="titulo-ia" className="flex flex-col gap-3">
        <h2 className="text-caption font-semibold" id="titulo-ia">
          Pipeline de IA
        </h2>

        <div className="grid gap-3 lg:grid-cols-3">
          <PainelDeOrcamento orcamento={orcamento} />
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-muted-foreground text-caption font-medium">
                  Como ler estes números
                </CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-muted-foreground flex flex-col gap-2">
                <p>
                  Falha por etapa diz onde investigar: <strong>busca</strong> costuma ser
                  o site fora do ar ou vaga removida; <strong>extração</strong>, página
                  que monta o conteúdo com JavaScript; <strong>classificação</strong>, a
                  IA indisponível ou o limite das chaves.
                </p>
                <p>
                  Falha na classificação é retomável: o conteúdo já buscado fica em cache
                  por 24 horas, e &ldquo;Tentar novamente&rdquo; vai direto à IA.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <PainelDeImportacoes estatisticas={estatisticas} />
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
