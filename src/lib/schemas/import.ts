import { z } from '@/lib/zod'

/**
 * Entrada das actions de importação (docs 05 e 06).
 *
 * A validação daqui é de forma, não de segurança: quem recusa endereço interno
 * e esquema estranho é o `safeFetch` (doc 07), que roda no servidor e não pode
 * ser contornado por quem chama a action direto. Aqui o objetivo é dar erro de
 * campo no formulário antes de gastar uma importação.
 */

export const urlDeVagaSchema = z
  .url({ protocol: /^https?$/, hostname: z.regexes.domain })
  .max(2000)
  .refine((valor) => !/@/.test(new URL(valor).host), {
    message: 'Não use endereços com usuário e senha.',
  })

export const iniciarImportacaoSchema = z.object({
  url: urlDeVagaSchema,
  /**
   * Confirmação do bloqueio suave (doc 05): com `AI_MONTHLY_TOKEN_BUDGET`
   * estourado, importar exige um "sim" explícito em vez de ser proibido — o
   * teto é um alerta de custo, não uma regra de negócio.
   */
  confirmarOrcamento: z.boolean().default(false),
})

/** "Tentar novamente": novo `job_imports` com attempt+1, reusando o cache. */
export const repetirImportacaoSchema = z.object({
  importId: z.uuid(),
})

export type IniciarImportacao = z.output<typeof iniciarImportacaoSchema>
