import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  EmpresaEmDestaque,
  Origem,
  ResumoDeEngajamento,
  TagEmUso,
  TecnologiaEmDestaque,
  VagaEmDestaque,
} from '@/db/queries/analytics'
import { taxaDeCliques, type Badge as BadgeDeSaude } from '@/features/analytics/painel'
import { PERIODOS, type Periodo } from '@/lib/analytics-periodos'
import { cn } from '@/lib/cn'

/**
 * Widgets de produto do doc 09: saúde, engajamento, CTR, tops e origem.
 *
 * Componentes de servidor e sem estado: recebem o que a query devolveu e
 * desenham. Barras são `div` com largura proporcional — comparar cinco valores
 * não justifica biblioteca; a série temporal, que justifica, mora em
 * `analytics-chart.tsx`.
 */

function inteiro(valor: number): string {
  return valor.toLocaleString('pt-BR')
}

function porcentagem(fracao: number | null, casas = 1): string {
  if (fracao === null) return '—'
  return `${(fracao * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`
}

/** `2026-07-28` → `28/07/2026` sem passar por `Date`, que mudaria o fuso. */
function diaLegivel(dia: string): string {
  const [ano, mes, diaDoMes] = dia.split('-')
  return `${diaDoMes}/${mes}/${ano}`
}

const CLASSE_DO_ESTADO: Record<BadgeDeSaude['estado'], string> = {
  ok: 'border-success/40 text-success',
  alerta: 'border-destructive/50 text-destructive',
  indefinido: 'border-border text-muted-foreground',
}

const ROTULO_DO_ESTADO: Record<BadgeDeSaude['estado'], string> = {
  ok: 'tudo certo',
  alerta: 'precisa de atenção',
  indefinido: 'sem dados',
}

/**
 * O widget do topo do doc 09. Os quatro badges aparecem sempre, verdes
 * inclusive: badge que só existe quando há problema obriga a lembrar que ele
 * existia para notar que sumiu.
 */
export function PainelDeSaude({ badges }: { badges: BadgeDeSaude[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {badges.map((badge) => (
        <li
          className={cn(
            'flex flex-col gap-1 rounded-md border px-4 py-3',
            CLASSE_DO_ESTADO[badge.estado],
          )}
          key={badge.chave}
        >
          <span className="text-caption flex items-center gap-2 font-semibold">
            <span
              aria-hidden="true"
              className={cn(
                'size-2 shrink-0 rounded-full',
                badge.estado === 'ok'
                  ? 'bg-success'
                  : badge.estado === 'alerta'
                    ? 'bg-destructive'
                    : 'bg-muted-foreground',
              )}
            />
            {badge.rotulo}
            <span className="sr-only">: {ROTULO_DO_ESTADO[badge.estado]}.</span>
          </span>
          <span className="text-muted-foreground text-xs">{badge.detalhe}</span>
        </li>
      ))}
    </ul>
  )
}

/** Períodos como links: a escolha vira URL e pode ser compartilhada. */
export function SeletorDePeriodo({ atual, base }: { atual: Periodo; base: string }) {
  return (
    <nav aria-label="Período do painel" className="flex items-center gap-1">
      {PERIODOS.map((periodo) => (
        <Link
          aria-current={periodo === atual ? 'page' : undefined}
          className={cn(
            'text-caption rounded-md px-3 py-1.5 transition duration-150',
            periodo === atual
              ? 'bg-surface text-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground',
          )}
          href={`${base}?periodo=${periodo}`}
          key={periodo}
        >
          {periodo} dias
        </Link>
      ))}
    </nav>
  )
}

function Numero({
  titulo,
  valor,
  nota,
}: {
  titulo: string
  valor: string
  nota?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-caption font-medium">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-h2 font-bold tabular-nums">{valor}</p>
        {nota ? <p className="text-muted-foreground text-xs">{nota}</p> : null}
      </CardContent>
    </Card>
  )
}

export function PainelDeEngajamento({
  resumo,
  dias,
}: {
  resumo: ResumoDeEngajamento
  dias: Periodo
}) {
  const ctr = taxaDeCliques(resumo.views, resumo.clicks)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Numero
        nota={`Últimos ${dias} dias`}
        titulo="Visualizações"
        valor={inteiro(resumo.views)}
      />
      <Numero titulo="Cliques em candidatar-se" valor={inteiro(resumo.clicks)} />
      <Numero
        nota={
          ctr === null ? 'Sem visualização no período' : 'Cliques sobre visualizações'
        }
        titulo="CTR global"
        valor={porcentagem(ctr)}
      />
      <Numero titulo="Compartilhamentos" valor={inteiro(resumo.shares)} />
    </div>
  )
}

/**
 * De quando é o número. O agregado vai até o último dia que o rollup fechou, e
 * omitir isso faria a tela parecer em tempo real — o pior dos dois mundos:
 * quem confere não acha o clique de hoje e conclui que o beacon está quebrado.
 */
export function AteQuandoAgrega({ ultimoDia }: { ultimoDia: string | null }) {
  return (
    <p className="text-muted-foreground text-xs">
      {ultimoDia
        ? `Agregado até ${diaLegivel(ultimoDia)}. `
        : 'Nenhum dia agregado ainda. '}
      O rollup roda às 03:30 UTC, então o dia de hoje só entra amanhã.
    </p>
  )
}

type ItemDeLista = {
  chave: string
  rotulo: string
  detalhe?: string
  href?: string
  valor: number
  nota?: string
}

function Lista({
  titulo,
  descricao,
  itens,
  vazio,
}: {
  titulo: string
  descricao?: string
  itens: ItemDeLista[]
  vazio: string
}) {
  const maior = Math.max(...itens.map((item) => item.valor), 1)

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-muted-foreground text-caption font-medium">
          {titulo}
        </CardTitle>
        {descricao ? <p className="text-muted-foreground text-xs">{descricao}</p> : null}
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="text-muted-foreground text-caption">{vazio}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {itens.map((item) => (
              <li className="flex flex-col gap-1" key={item.chave}>
                <div className="text-caption flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate">
                    {item.href ? (
                      <Link
                        className="hover:text-primary underline-offset-4 transition duration-150 hover:underline"
                        href={item.href}
                      >
                        {item.rotulo}
                      </Link>
                    ) : (
                      item.rotulo
                    )}
                    {item.detalhe ? (
                      <span className="text-muted-foreground"> · {item.detalhe}</span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                    {inteiro(item.valor)}
                    {item.nota ? <span className="ml-2 text-xs">{item.nota}</span> : null}
                  </span>
                </div>
                <div aria-hidden="true" className="bg-surface h-1.5 w-full rounded-full">
                  <div
                    className="bg-primary h-1.5 rounded-full"
                    style={{ width: `${Math.max((item.valor / maior) * 100, 4)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export function PainelDeTopVagas({ vagas }: { vagas: VagaEmDestaque[] }) {
  return (
    <Lista
      descricao="Views no período, com o CTR de cada uma"
      itens={vagas.map((vaga) => ({
        chave: vaga.id,
        rotulo: vaga.title,
        detalhe: vaga.companyName,
        href: `/admin/vagas/${vaga.id}`,
        valor: vaga.views,
        nota: `CTR ${porcentagem(taxaDeCliques(vaga.views, vaga.clicks), 0)}`,
      }))}
      titulo="Vagas mais vistas"
      vazio="Nenhuma visualização agregada no período."
    />
  )
}

export function PainelDeTopEmpresas({ empresas }: { empresas: EmpresaEmDestaque[] }) {
  return (
    <Lista
      itens={empresas.map((empresa) => ({
        chave: empresa.slug,
        rotulo: empresa.name,
        detalhe: `${empresa.vagas} vaga(s)`,
        valor: empresa.views,
      }))}
      titulo="Empresas mais vistas"
      vazio="Nenhuma visualização agregada no período."
    />
  )
}

export function PainelDeTopTecnologias({
  tecnologias,
}: {
  tecnologias: TecnologiaEmDestaque[]
}) {
  return (
    <Lista
      descricao="Soma das views das vagas que citam a tecnologia — uma view conta para todas as dela, então o total não é uma fatia de bolo"
      itens={tecnologias.map((tecnologia) => ({
        chave: tecnologia.slug,
        rotulo: tecnologia.label,
        detalhe: `${tecnologia.vagas} vaga(s)`,
        valor: tecnologia.views,
      }))}
      titulo="Tecnologias procuradas"
      vazio="Nenhuma visualização agregada no período."
    />
  )
}

export function PainelDeTags({ tags }: { tags: TagEmUso[] }) {
  return (
    <Lista
      descricao="Contagem de vagas publicadas por tag"
      itens={tags.map((tag) => ({
        chave: tag.slug,
        rotulo: tag.label,
        valor: tag.vagas,
      }))}
      titulo="Tags mais usadas"
      vazio="Nenhuma vaga publicada com tag."
    />
  )
}

export function PainelDeOrigens({ origens }: { origens: Origem[] }) {
  return (
    <Lista
      descricao="utm_source quando existe; senão o site de onde vieram. Lido dos eventos crus, então inclui hoje"
      itens={origens.map((origem) => ({
        chave: origem.origem,
        rotulo: origem.origem,
        valor: origem.eventos,
      }))}
      titulo="Origem dos visitantes"
      vazio="Nenhum evento registrado no período."
    />
  )
}
