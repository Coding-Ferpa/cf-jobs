import { z } from '@/lib/zod'
import { createDocument } from 'zod-openapi'

import { LIMITE_MAXIMO, LIMITE_PADRAO } from '@/lib/cursor'

import { consultaDeVagas } from './jobs-query'
import { LIMITE_DE_EVENTOS, LIMITE_DE_LEITURA } from './rate-limit'
import {
  eventoSchema,
  listaDeVagasSchema,
  problemSchema,
  taxonomiasSchema,
  vagaDetalheSchema,
} from './schemas'

/**
 * Spec OpenAPI 3.1 da API pública (doc 06), montada a partir dos mesmos
 * schemas Zod que os handlers usam — o contrato nasce do código e não tem como
 * dessincronizar sem alguém ver.
 */

const DESCRICAO = `
API pública de leitura do CF Jobs — o mural de vagas da comunidade Coding Ferpa.

Aberta, sem chave e sem cadastro: os dados de vagas são públicos e divulgá-los é o objetivo.

- **Paginação por cursor.** Repasse \`page.next_cursor\` em \`?cursor=\`. Não há \`offset\`:
  ele relê tudo que já passou e ainda pula linha quando algo é publicado no meio da navegação.
- **Rate limit** de ${LIMITE_DE_LEITURA} req/min por IP nas leituras e ${LIMITE_DE_EVENTOS}/min no envio de eventos.
  Toda resposta traz \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\` e \`X-RateLimit-Reset\`; o 429 traz \`Retry-After\`.
- **Erros** no formato [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457), com \`content-type: application/problem+json\`.
- **Datas** em ISO 8601 UTC. **Corpo** em snake_case.

Quebras de contrato viram \`/api/v2\`; a v1 continua respondendo por 6 meses depois disso.
`.trim()

const PROBLEMA = {
  content: { 'application/problem+json': { schema: problemSchema } },
}

/** Cabeçalhos que toda leitura devolve — descritos uma vez, reusados em cada 200. */
const CABECALHOS_DE_LIMITE = {
  'X-RateLimit-Limit': {
    schema: { type: 'integer' as const },
    description: 'Teto de requisições da janela de um minuto.',
  },
  'X-RateLimit-Remaining': {
    schema: { type: 'integer' as const },
    description: 'Quantas ainda cabem na janela.',
  },
  'X-RateLimit-Reset': {
    schema: { type: 'integer' as const },
    description: 'Quando a janela abre espaço, em epoch de segundos.',
  },
}

const LIMITE_EXCEDIDO = {
  description: `Rate limit estourado. \`Retry-After\` diz quantos segundos esperar.`,
  ...PROBLEMA,
}

export function documentoOpenApi(siteUrl: string) {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'CF Jobs API',
      version: '1.0.0',
      description: DESCRICAO,
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: `${siteUrl}/api/v1`, description: 'Produção' }],
    tags: [
      { name: 'Vagas', description: 'Leitura do mural.' },
      { name: 'Taxonomias', description: 'Vocabulário dos filtros.' },
      { name: 'Eventos', description: 'Beacon de analytics do próprio site.' },
    ],
    paths: {
      '/jobs': {
        get: {
          tags: ['Vagas'],
          summary: 'Lista vagas',
          description:
            'Filtros combinam com AND entre parâmetros e OR entre valores do mesmo ' +
            'parâmetro — exceto `tech`, que é AND também entre valores: quem filtra ' +
            'React e TypeScript quer as duas. Listas aceitam CSV (`?tech=a,b`) ou o ' +
            'parâmetro repetido (`?tech=a&tech=b`), indiferentemente.',
          requestParams: { query: consultaDeVagas },
          responses: {
            '200': {
              description: `Página de até ${LIMITE_MAXIMO} vagas (${LIMITE_PADRAO} por padrão).`,
              headers: CABECALHOS_DE_LIMITE,
              content: { 'application/json': { schema: listaDeVagasSchema } },
            },
            '400': { description: 'Parâmetro de busca inválido.', ...PROBLEMA },
            '429': LIMITE_EXCEDIDO,
          },
        },
      },
      '/jobs/{slug}': {
        get: {
          tags: ['Vagas'],
          summary: 'Detalha uma vaga',
          description:
            'Vaga arquivada responde 200 com `status: "archived"`, de propósito: quem ' +
            'integrou uma vaga precisa saber que ela fechou, e um 404 seria ' +
            'indistinguível de slug errado.',
          requestParams: {
            path: z.object({
              slug: z.string().meta({
                description: 'O `slug` que veio na listagem.',
                example: 'pessoa-desenvolvedora-backend-nubank-a1b2c3',
              }),
            }),
          },
          responses: {
            '200': {
              description: 'A vaga, com descrição e contadores.',
              headers: CABECALHOS_DE_LIMITE,
              content: { 'application/json': { schema: vagaDetalheSchema } },
            },
            '404': { description: 'Não existe vaga com esse slug.', ...PROBLEMA },
            '429': LIMITE_EXCEDIDO,
          },
        },
      },
      '/taxonomies': {
        get: {
          tags: ['Taxonomias'],
          summary: 'Lista as taxonomias ativas',
          description:
            'O vocabulário aceito nos filtros de `/jobs`. Só o que está ativo sai: ' +
            'taxonomia desativada continua no banco por causa das vagas antigas, mas ' +
            'oferecê-la como filtro devolveria lista vazia.',
          responses: {
            '200': {
              description: 'Taxonomias agrupadas por tipo.',
              headers: CABECALHOS_DE_LIMITE,
              content: { 'application/json': { schema: taxonomiasSchema } },
            },
            '429': LIMITE_EXCEDIDO,
          },
        },
      },
      '/events': {
        post: {
          tags: ['Eventos'],
          summary: 'Registra um evento de vaga',
          description:
            'Aceita chamadas apenas do próprio site — existe para o beacon da ' +
            'interface, não para contagem de terceiros. Repetição do mesmo evento ' +
            'pelo mesmo visitante no mesmo dia é descartada pelo banco, então a ' +
            'resposta é 202 mesmo quando nada foi gravado.',
          requestBody: {
            content: { 'application/json': { schema: eventoSchema } },
          },
          responses: {
            '202': { description: 'Aceito. Sem corpo.' },
            '400': { description: 'Corpo inválido.', ...PROBLEMA },
            '403': { description: 'Origem não é o próprio site.', ...PROBLEMA },
            '429': LIMITE_EXCEDIDO,
            '503': { description: 'Analytics não configurado no ambiente.', ...PROBLEMA },
          },
        },
      },
    },
  })
}
