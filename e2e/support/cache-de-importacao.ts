import { createHash } from 'node:crypto'

import postgres from 'postgres'

/**
 * Planta conteúdo no cache de importação para o E2E não precisar buscar uma
 * página de verdade.
 *
 * Por que não subir um servidor com a vaga: o `safeFetch` recusa endereço
 * privado por construção (doc 07), e qualquer dublê local seria `127.0.0.1` ou
 * um IP interno do runner. Enfraquecer a trava para testar seria trocar o que
 * ela protege pelo teste que a testa.
 *
 * O que sobra é o caminho legítimo do próprio produto: `job_imports.raw_content`
 * vale 24h, e uma importação que encontra o cache pula o fetch. É o mesmo
 * caminho do "Tentar novamente" do admin.
 */

const PARAMETROS_DE_RASTREIO = ['gclid', 'fbclid', 'ref', 'src', 'source']
const PORTA_PADRAO: Record<string, string> = { 'http:': '80', 'https:': '443' }

/**
 * Cópia do `canonicalizarUrl` de `src/lib/source-url.ts`. Importar o original
 * puxaria o alias `@/` para dentro do Playwright; são 20 linhas estáveis, e o
 * teste falha alto se elas divergirem — o cache simplesmente não é encontrado.
 */
function canonicalizar(entrada: string): string {
  const url = new URL(entrada.trim())

  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  url.username = ''
  url.password = ''

  if (url.port === PORTA_PADRAO[url.protocol]) url.port = ''

  for (const chave of [...url.searchParams.keys()]) {
    const nome = chave.toLowerCase()
    if (nome.startsWith('utm_') || PARAMETROS_DE_RASTREIO.includes(nome)) {
      url.searchParams.delete(chave)
    }
  }

  url.searchParams.sort()

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '')
  }

  return url.toString()
}

function hashDaUrl(url: string): string {
  return createHash('sha256').update(canonicalizar(url)).digest('hex')
}

function conexao() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não está definida para o E2E.')
  return postgres(url, { prepare: false, max: 1 })
}

/** O `raw_content` é o `ConteudoExtraido` serializado — o mesmo que o pipeline grava. */
export async function plantarConteudoNoCache(entrada: {
  url: string
  markdown: string
  sourceSite?: string
}): Promise<void> {
  const sql = conexao()

  try {
    await sql`
      insert into public.job_imports (url, url_hash, status, source_site, raw_content)
      values (
        ${entrada.url},
        ${hashDaUrl(entrada.url)},
        'review',
        ${entrada.sourceSite ?? 'readability'},
        ${JSON.stringify({
          markdown: entrada.markdown,
          estruturado: null,
          origem: entrada.sourceSite ?? 'readability',
          truncado: false,
        })}
      )
    `
  } finally {
    await sql.end()
  }
}

/** Limpa o que o teste plantou, para uma execução não influenciar a seguinte. */
export async function limparImportacoesDe(url: string): Promise<void> {
  const sql = conexao()

  try {
    await sql`
      delete from public.job_imports where url_hash = ${hashDaUrl(url)}
    `
  } finally {
    await sql.end()
  }
}
