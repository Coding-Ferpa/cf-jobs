import { CONFIANCA_MINIMA, vagaClassificadaSchema, type VagaClassificada } from './schema'

/**
 * O que a tela de revisão precisa destacar (doc 08).
 *
 * A comparação é entre **o que a IA respondeu** (`job_imports.ai_response`) e
 * **o que virou vaga**. É a fonte honesta do "diff visual dos campos de baixa
 * confiança": nada aqui é inferido, tudo sai de dois registros persistidos.
 *
 * Por que não guardar os avisos do pipeline: eles seriam uma terceira cópia da
 * mesma informação, e cópias divergem. O modelo dizer `hybrid` e a vaga ficar
 * sem modalidade é observável nos dados — e continua observável depois de
 * alguém editar a vaga, que é quando a revisão importa.
 */

export type SituacaoDoCampo = 'nao_cadastrado' | 'ausente' | 'parcial'

export type DivergenciaDeRevisao = {
  campo: string
  rotulo: string
  /** O que a IA extraiu, quando extraiu alguma coisa. */
  extraido: string | null
  situacao: SituacaoDoCampo
  explicacao: string
}

export type ConferenciaDaRevisao = {
  /** `null` quando a importação não guardou resposta da IA (vaga manual). */
  confianca: number | null
  baixaConfianca: boolean
  divergencias: DivergenciaDeRevisao[]
}

export type VagaPersistidaParaRevisao = {
  roleCategoryId: string | null
  seniorityId: string | null
  workModeId: string | null
  contractTypeId: string | null
  technologyIds: string[]
  tagIds: string[]
  salaryMin: string | null
  locationCity: string | null
  locationCountry: string | null
}

type CampoEscalar = {
  campo: string
  rotulo: string
  extraido: string | null | undefined
  persistido: string | null
}

/** `ai_response` é `jsonb`: o que sai do banco é `unknown` até o Zod olhar. */
export function lerRespostaDaIa(bruto: unknown): VagaClassificada | null {
  if (!bruto || typeof bruto !== 'object') return null

  const validada = vagaClassificadaSchema.safeParse(bruto)
  return validada.success ? validada.data : null
}

export function conferirRevisao(entrada: {
  ia: VagaClassificada | null
  vaga: VagaPersistidaParaRevisao
}): ConferenciaDaRevisao {
  const { ia, vaga } = entrada

  if (!ia) return { confianca: null, baixaConfianca: false, divergencias: [] }

  const divergencias: DivergenciaDeRevisao[] = []

  const escalares: CampoEscalar[] = [
    {
      campo: 'roleCategoryId',
      rotulo: 'Cargo',
      extraido: ia.role_category,
      persistido: vaga.roleCategoryId,
    },
    {
      campo: 'seniorityId',
      rotulo: 'Senioridade',
      extraido: ia.seniority,
      persistido: vaga.seniorityId,
    },
    {
      campo: 'workModeId',
      rotulo: 'Modalidade',
      extraido: ia.work_mode,
      persistido: vaga.workModeId,
    },
    {
      campo: 'contractTypeId',
      rotulo: 'Contratação',
      extraido: ia.contract_type,
      persistido: vaga.contractTypeId,
    },
  ]

  for (const campo of escalares) {
    if (campo.persistido) continue

    divergencias.push(
      campo.extraido
        ? {
            campo: campo.campo,
            rotulo: campo.rotulo,
            extraido: campo.extraido,
            situacao: 'nao_cadastrado',
            explicacao: `A IA leu “${campo.extraido}”, que não existe no cadastro. Escolha à mão ou resolva a sugestão pendente.`,
          }
        : {
            campo: campo.campo,
            rotulo: campo.rotulo,
            extraido: null,
            situacao: 'ausente',
            explicacao: 'A vaga não deixava isso explícito. Confirme antes de publicar.',
          },
    )
  }

  const listas: { campo: string; rotulo: string; extraidas: string[]; ids: string[] }[] =
    [
      {
        campo: 'technologyIds',
        rotulo: 'Tecnologias',
        extraidas: ia.technologies,
        ids: vaga.technologyIds,
      },
      { campo: 'tagIds', rotulo: 'Tags', extraidas: ia.tags, ids: vaga.tagIds },
    ]

  for (const lista of listas) {
    if (lista.extraidas.length === 0 && lista.ids.length === 0) continue

    // Os ids podem ser mais que os termos citados: o mapeamento recupera do
    // `unmatched_terms` o que o catálogo conhece. Só a falta é divergência.
    if (lista.ids.length >= lista.extraidas.length) continue

    divergencias.push({
      campo: lista.campo,
      rotulo: lista.rotulo,
      extraido: lista.extraidas.join(', '),
      situacao: 'parcial',
      explicacao: `A IA citou ${lista.extraidas.length} e ${lista.ids.length} estão no cadastro. O resto virou sugestão.`,
    })
  }

  if (ia.salary.min !== null && ia.salary.min !== undefined && !vaga.salaryMin) {
    divergencias.push({
      campo: 'salaryMin',
      rotulo: 'Salário',
      extraido: String(ia.salary.min),
      situacao: 'nao_cadastrado',
      explicacao: 'A IA leu um valor que não foi gravado. Confira a faixa.',
    })
  }

  if (!ia.location.city && !ia.location.country) {
    divergencias.push({
      campo: 'locationCity',
      rotulo: 'Local',
      extraido: null,
      situacao: 'ausente',
      explicacao: 'Nenhum local explícito na vaga. Confirme se é remoto sem restrição.',
    })
  }

  return {
    confianca: ia.confidence,
    baixaConfianca: ia.confidence < CONFIANCA_MINIMA,
    divergencias,
  }
}
