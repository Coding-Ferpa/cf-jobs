/**
 * Teto de execução da importação e o orçamento que o pipeline recebe (doc 02,
 * revisado pós-M6).
 *
 * A importação roda **em segundo plano na mesma invocação**: a action grava a
 * fila, devolve o id e deixa o pipeline seguir por `after()`. Quem encerra a
 * função é a plataforma, no `maxDuration` da rota — daí o orçamento sair daqui
 * e não de um número escolhido à parte.
 *
 * A margem existe porque estourar o `maxDuration` mata a função no meio: sem
 * ela, a última coisa a acontecer seria o processo morrer com a vaga na mão e
 * a linha de `job_imports` parada em `classifying`. Com ela, o pipeline desiste
 * sozinho, grava `failed` e a retomada aproveita o conteúdo em cache.
 *
 * **A rota precisa declarar o mesmo número.** O `maxDuration` de um segmento
 * do Next tem que ser literal — não aceita constante importada —, então as
 * páginas que hospedam a action repetem o `300` com um comentário apontando
 * para cá, e `import-runtime.test.ts` falha se os dois divergirem.
 */

/** Segundos. Exige Fluid compute; disponível no plano Hobby da Vercel. */
export const MAX_DURATION_DA_IMPORTACAO = 300

/** Folga para o pipeline desistir antes de a plataforma encerrar a função. */
export const MARGEM_DE_ENCERRAMENTO_MS = 10_000

export const ORCAMENTO_DA_IMPORTACAO_MS =
  MAX_DURATION_DA_IMPORTACAO * 1_000 - MARGEM_DE_ENCERRAMENTO_MS

/**
 * Páginas cuja Server Action dispara o pipeline. Uma Server Action roda na
 * rota da página que a chamou, então é o `maxDuration` **dela** que vale.
 */
export const PAGINAS_QUE_IMPORTAM = [
  'src/app/admin/vagas/importar/page.tsx',
  'src/app/admin/importacoes/page.tsx',
] as const
