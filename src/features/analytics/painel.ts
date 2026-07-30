import type { Orcamento } from '@/features/import/budget'

/**
 * As contas do painel de analytics e os limites do widget de saúde (doc 09).
 *
 * Módulo puro de propósito: os limiares do doc 09 são regra de produto — "mais
 * de 30% de falha em 24h é problema" —, e regra de produto conferida dentro de
 * SQL ou de JSX não tem como ser testada em cada faixa.
 */

/** Doc 09: badge vermelho em falhas de importação acima disto nas últimas 24h. */
export const ALERTA_DE_FALHAS = 0.3

/** Doc 09: fila de sugestões acima disto pede curadoria. */
export const ALERTA_DE_SUGESTOES = 20

/** Doc 09: cron de arquivamento sem rodar há mais que isto é alerta. */
export const HORAS_SEM_CRON = 48

/**
 * `null` quando não houve visualização: dividir por zero devolveria `Infinity`
 * ou `NaN`, e o painel mostraria "∞%" de CTR numa vaga que ninguém viu.
 */
export function taxaDeCliques(views: number, clicks: number): number | null {
  if (views <= 0) return null
  return clicks / views
}

export type EstadoDaSaude = 'ok' | 'alerta' | 'indefinido'

export type Badge = {
  chave: 'importacoes' | 'sugestoes' | 'orcamento' | 'cron'
  rotulo: string
  estado: EstadoDaSaude
  detalhe: string
}

export type ExecucaoDeCron = {
  /** `null` = o cron nunca rodou neste banco. */
  ultimaExecucao: Date | null
  /** `succeeded`, `failed`… como o pg_cron grava. */
  ultimoStatus: string | null
}

export type EntradaDaSaude = {
  /** Últimas 24h; `total` zero não é sinal de nada. */
  importacoes: { total: number; falhas: number }
  sugestoesPendentes: number
  orcamento: Orcamento
  /** `null` quando não foi possível ler o `cron.job_run_details`. */
  cron: ExecucaoDeCron | null
  agora: Date
}

function porcentagem(fracao: number): string {
  return `${Math.round(fracao * 100)}%`
}

function saudeDasImportacoes(
  importacoes: EntradaDaSaude['importacoes'],
): Pick<Badge, 'estado' | 'detalhe'> {
  if (importacoes.total === 0) {
    // Sem tentativa não há taxa: "0% de falha" sugeriria que está tudo indo bem.
    return { estado: 'indefinido', detalhe: 'Nenhuma importação nas últimas 24h.' }
  }

  const fracao = importacoes.falhas / importacoes.total
  const resumo = `${importacoes.falhas} de ${importacoes.total} falharam nas últimas 24h (${porcentagem(fracao)}).`

  return fracao > ALERTA_DE_FALHAS
    ? { estado: 'alerta', detalhe: resumo }
    : { estado: 'ok', detalhe: resumo }
}

function saudeDoCron(
  cron: EntradaDaSaude['cron'],
  agora: Date,
): Pick<Badge, 'estado' | 'detalhe'> {
  if (!cron) {
    return {
      estado: 'indefinido',
      detalhe: 'Não foi possível ler o histórico do pg_cron.',
    }
  }

  if (!cron.ultimaExecucao) {
    return {
      estado: 'alerta',
      detalhe: 'O arquivamento nunca rodou neste banco, ou o job não está agendado.',
    }
  }

  const horas = (agora.getTime() - cron.ultimaExecucao.getTime()) / 3_600_000

  if (cron.ultimoStatus !== null && cron.ultimoStatus !== 'succeeded') {
    return {
      estado: 'alerta',
      detalhe: `A última execução terminou em "${cron.ultimoStatus}".`,
    }
  }

  const quando = `Última execução há ${Math.floor(horas)}h.`

  return horas > HORAS_SEM_CRON
    ? { estado: 'alerta', detalhe: `${quando} O esperado é uma por dia.` }
    : { estado: 'ok', detalhe: quando }
}

/**
 * Os quatro badges do doc 09, na ordem em que ele os lista. Sempre os quatro:
 * badge que desaparece quando está tudo bem obriga a lembrar de que ele existia
 * para notar a ausência.
 */
export function avaliarSaude(entrada: EntradaDaSaude): Badge[] {
  const importacoes = saudeDasImportacoes(entrada.importacoes)
  const cron = saudeDoCron(entrada.cron, entrada.agora)
  const { orcamento } = entrada

  return [
    { chave: 'importacoes', rotulo: 'Importações', ...importacoes },
    {
      chave: 'sugestoes',
      rotulo: 'Fila de sugestões',
      estado: entrada.sugestoesPendentes > ALERTA_DE_SUGESTOES ? 'alerta' : 'ok',
      detalhe:
        entrada.sugestoesPendentes === 0
          ? 'Nada esperando revisão.'
          : `${entrada.sugestoesPendentes} termo(s) esperando revisão.`,
    },
    {
      chave: 'orcamento',
      rotulo: 'Orçamento de IA',
      estado:
        orcamento.situacao === 'atencao' || orcamento.situacao === 'estourado'
          ? 'alerta'
          : orcamento.situacao === 'sem_teto'
            ? 'indefinido'
            : 'ok',
      detalhe:
        orcamento.fracao === null
          ? 'Sem teto configurado — o painel só acompanha o consumo.'
          : `${porcentagem(orcamento.fracao)} do teto mensal consumido.`,
    },
    { chave: 'cron', rotulo: 'Arquivamento automático', ...cron },
  ]
}
