import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  ContagemPorChave,
  EstatisticasDeImportacao,
} from '@/db/queries/import-stats'
import type { Orcamento } from '@/features/import/budget'
import { cn } from '@/lib/cn'

/**
 * Widgets de importação e de IA do doc 09.
 *
 * Sem biblioteca de gráfico: o que o doc pede aqui são contagens, taxas e uma
 * barra de progresso. Séries temporais entram com as métricas de visitação, e
 * é lá que a dependência se paga.
 */

const ROTULO_DA_ETAPA: Record<string, string> = {
  fetching: 'Busca',
  extracting: 'Extração',
  classifying: 'Classificação',
  mapping: 'Mapeamento',
  persisting: 'Gravação',
  cancelled: 'Cancelada',
}

function porcentagem(fracao: number): string {
  return `${Math.round(fracao * 100)}%`
}

/** Abaixo de um segundo, "0,0s" esconde a diferença entre 40ms e 900ms. */
export function duracao(ms: number | null): string {
  if (ms === null) return '—'
  return ms < 1_000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

function Barras({
  itens,
  vazio,
  rotular,
}: {
  itens: ContagemPorChave[]
  vazio: string
  rotular?: (chave: string) => string
}) {
  if (itens.length === 0) {
    return <p className="text-muted-foreground text-caption">{vazio}</p>
  }

  const maior = Math.max(...itens.map((item) => item.total))

  return (
    <ul className="flex flex-col gap-2">
      {itens.map((item) => (
        <li className="flex flex-col gap-1" key={item.chave}>
          <div className="text-caption flex items-baseline justify-between gap-2">
            <span className="truncate">{rotular?.(item.chave) ?? item.chave}</span>
            <span className="text-muted-foreground tabular-nums">{item.total}</span>
          </div>
          {/* Barra decorativa: o número ao lado já diz tudo a quem não a vê. */}
          <div aria-hidden="true" className="bg-surface h-1.5 w-full rounded-full">
            <div
              className="bg-primary h-1.5 rounded-full"
              style={{ width: `${Math.max((item.total / maior) * 100, 4)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function PainelDeOrcamento({ orcamento }: { orcamento: Orcamento }) {
  const custo = orcamento.custoEstimadoUsd.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const cor =
    orcamento.situacao === 'estourado'
      ? 'bg-destructive'
      : orcamento.situacao === 'atencao'
        ? 'bg-warning'
        : 'bg-primary'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-muted-foreground text-caption font-medium">
          Tokens do mês
        </CardTitle>
        {orcamento.situacao === 'estourado' ? (
          <Badge className="border-destructive text-destructive" variant="outline">
            teto estourado
          </Badge>
        ) : orcamento.situacao === 'atencao' ? (
          <Badge className="border-warning text-warning" variant="outline">
            perto do teto
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <p className="text-h2 font-bold tabular-nums">
          {orcamento.tokensDoMes.toLocaleString('pt-BR')}
        </p>

        {orcamento.teto === null ? (
          <p className="text-muted-foreground text-caption">
            Sem teto configurado — o painel acompanha o consumo, e não há bloqueio. Defina{' '}
            <code>AI_MONTHLY_TOKEN_BUDGET</code> para ativá-lo.
          </p>
        ) : (
          <>
            <div
              aria-label={`${porcentagem(orcamento.fracao ?? 0)} do teto mensal`}
              className="bg-surface h-2 w-full rounded-full"
              role="img"
            >
              <div
                className={cn('h-2 rounded-full', cor)}
                style={{ width: `${Math.min((orcamento.fracao ?? 0) * 100, 100)}%` }}
              />
            </div>
            <p className="text-muted-foreground text-caption">
              {porcentagem(orcamento.fracao ?? 0)} de{' '}
              {orcamento.teto.toLocaleString('pt-BR')} tokens
            </p>
          </>
        )}

        <p className="text-muted-foreground text-caption">
          Custo estimado: <strong className="text-foreground">{custo}</strong> aos preços
          de referência do doc 05. O tier contratado é gratuito.
        </p>
      </CardContent>
    </Card>
  )
}

export function PainelDeImportacoes({
  estatisticas,
}: {
  estatisticas: EstatisticasDeImportacao
}) {
  const taxaDeBaixaConfianca =
    estatisticas.comResposta > 0
      ? estatisticas.baixaConfianca / estatisticas.comResposta
      : null

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground text-caption font-medium">
            Importações ({estatisticas.dias} dias)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-h2 font-bold tabular-nums">
            {estatisticas.taxaDeSucesso === null
              ? '—'
              : porcentagem(estatisticas.taxaDeSucesso)}
          </p>
          <p className="text-muted-foreground text-caption">
            {estatisticas.total === 0
              ? 'Nenhuma importação na janela.'
              : `${estatisticas.total - estatisticas.falhas} de ${estatisticas.total} chegaram à revisão.`}
          </p>

          <dl className="text-caption grid grid-cols-2 gap-y-1">
            <dt className="text-muted-foreground">Latência média</dt>
            <dd className="tabular-nums">{duracao(estatisticas.latenciaMediaMs)}</dd>
            <dt className="text-muted-foreground">P95</dt>
            <dd className="tabular-nums">{duracao(estatisticas.latenciaP95Ms)}</dd>
            <dt className="text-muted-foreground">Baixa confiança</dt>
            <dd className="tabular-nums">
              {taxaDeBaixaConfianca === null ? '—' : porcentagem(taxaDeBaixaConfianca)}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground text-caption font-medium">
            Falhas por etapa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Barras
            itens={estatisticas.falhasPorEtapa}
            rotular={(chave) => ROTULO_DA_ETAPA[chave] ?? chave}
            vazio="Nenhuma falha na janela."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground text-caption font-medium">
            Por adapter e por modelo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Barras itens={estatisticas.porAdapter} vazio="Sem adapter registrado." />
          <Barras itens={estatisticas.porModelo} vazio="Nenhum modelo respondeu ainda." />
        </CardContent>
      </Card>
    </div>
  )
}
