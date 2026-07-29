import 'server-only'

import { sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { percentil } from '@/features/import/budget'

/**
 * Observabilidade do pipeline (doc 09): sucesso e falha, falhas por etapa, uso
 * por adapter e por modelo, latência média e P95, tokens do mês.
 *
 * Tudo sai de `job_imports` — o doc 04 é explícito: **todo dado de
 * observabilidade nasce no banco**, e o painel não depende de ferramenta
 * externa. O corolário é este arquivo: cinco consultas pequenas, nenhuma
 * dependência nova.
 */

export type ContagemPorChave = { chave: string; total: number }

export type EstatisticasDeImportacao = {
  /** Janela em dias considerada nas contagens. */
  dias: number
  total: number
  emRevisao: number
  falhas: number
  /** 0 a 1; `null` quando não houve importação na janela. */
  taxaDeSucesso: number | null
  falhasPorEtapa: ContagemPorChave[]
  porAdapter: ContagemPorChave[]
  porModelo: ContagemPorChave[]
  latenciaMediaMs: number | null
  latenciaP95Ms: number | null
  /** Do mês corrente, como o teto do doc 05. */
  tokensInDoMes: number
  tokensOutDoMes: number
  baixaConfianca: number
  comResposta: number
}

type LinhaDeContagem = { chave: string | null; total: number | string }

async function contarPor(coluna: string, filtro: string): Promise<ContagemPorChave[]> {
  // Nome de coluna vindo de literal do próprio arquivo — nunca de entrada.
  const linhas = await db.execute<LinhaDeContagem>(sql`
    select ${sql.raw(coluna)} as chave, count(*)::int as total
      from public.job_imports
     where created_at >= now() - interval '30 days'
       and ${sql.raw(filtro)}
     group by 1
     order by 2 desc
  `)

  return (linhas as unknown as LinhaDeContagem[])
    .filter((linha) => linha.chave !== null)
    .map((linha) => ({ chave: linha.chave!, total: Number(linha.total) }))
}

export async function estatisticasDeImportacao(
  dias = 30,
): Promise<EstatisticasDeImportacao> {
  const janela = sql`now() - make_interval(days => ${dias})`

  const [totais] = (await db.execute<{
    total: number
    em_revisao: number
    falhas: number
    latencia_media: number | null
    baixa_confianca: number
    com_resposta: number
  }>(sql`
    select
      count(*)::int as total,
      count(*) filter (where status in ('review', 'completed'))::int as em_revisao,
      count(*) filter (where status = 'failed')::int as falhas,
      avg(latency_ms) filter (where latency_ms is not null) as latencia_media,
      count(*) filter (
        where (ai_response ->> 'confidence')::numeric < 0.5
      )::int as baixa_confianca,
      count(*) filter (where ai_response is not null)::int as com_resposta
    from public.job_imports
    where created_at >= ${janela}
  `)) as unknown as {
    total: number
    em_revisao: number
    falhas: number
    latencia_media: number | null
    baixa_confianca: number
    com_resposta: number
  }[]

  // O P95 sai em JS e não em `percentile_disc`: são poucas linhas por janela, e
  // a definição fica no mesmo lugar que os testes que a cobrem.
  const latencias = (await db.execute<{ latency_ms: number }>(sql`
    select latency_ms from public.job_imports
     where created_at >= ${janela} and latency_ms is not null
  `)) as unknown as { latency_ms: number }[]

  const [tokens] = (await db.execute<{ entrada: number; saida: number }>(sql`
    select
      coalesce(sum(tokens_in), 0)::int as entrada,
      coalesce(sum(tokens_out), 0)::int as saida
    from public.job_imports
    where created_at >= date_trunc('month', now())
  `)) as unknown as { entrada: number; saida: number }[]

  const [falhasPorEtapa, porAdapter, porModelo] = await Promise.all([
    contarPor('error_step', "status = 'failed' and error_step is not null"),
    contarPor('source_site', 'source_site is not null'),
    contarPor('model', 'model is not null'),
  ])

  const total = Number(totais?.total ?? 0)
  const falhas = Number(totais?.falhas ?? 0)

  return {
    dias,
    total,
    emRevisao: Number(totais?.em_revisao ?? 0),
    falhas,
    taxaDeSucesso: total > 0 ? (total - falhas) / total : null,
    falhasPorEtapa,
    porAdapter,
    porModelo,
    latenciaMediaMs:
      totais?.latencia_media === null || totais?.latencia_media === undefined
        ? null
        : Math.round(Number(totais.latencia_media)),
    latenciaP95Ms: percentil(
      latencias.map((linha) => Number(linha.latency_ms)),
      0.95,
    ),
    tokensInDoMes: Number(tokens?.entrada ?? 0),
    tokensOutDoMes: Number(tokens?.saida ?? 0),
    baixaConfianca: Number(totais?.baixa_confianca ?? 0),
    comResposta: Number(totais?.com_resposta ?? 0),
  }
}

/** Só os tokens do mês — é o que o bloqueio suave precisa saber (doc 05). */
export async function tokensDoMes(): Promise<{ entrada: number; saida: number }> {
  const [linha] = (await db.execute<{ entrada: number; saida: number }>(sql`
    select
      coalesce(sum(tokens_in), 0)::int as entrada,
      coalesce(sum(tokens_out), 0)::int as saida
    from public.job_imports
    where created_at >= date_trunc('month', now())
  `)) as unknown as { entrada: number; saida: number }[]

  return { entrada: Number(linha?.entrada ?? 0), saida: Number(linha?.saida ?? 0) }
}
