import { createServer } from 'node:http'

/**
 * Dublê do NVIDIA NIM para o E2E (spec 4 do doc 12).
 *
 * O doc pede a IA "mockada por rota interceptada", mas a chamada sai do
 * servidor, não do navegador — interceptar no Playwright não a alcança. O
 * equivalente honesto é este processo: fala o mesmo protocolo
 * OpenAI-compatible, o app aponta para ele por `AI_BASE_URL`, e nenhuma
 * chamada de verdade é gasta.
 *
 * A resposta **é derivada do prompt recebido**: o teste planta um marcador no
 * conteúdo da vaga, e o dublê o devolve no título e no termo desconhecido. Sem
 * isso, execuções paralelas disputariam o índice único de sugestões pendentes.
 */

const PORTA = Number(process.env.NIM_STUB_PORT ?? 4599)

const MARCADOR = /CFJOBS-E2E-([A-Za-z0-9-]+)/

function vagaDe(carimbo: string) {
  return {
    title: `Pessoa Desenvolvedora Backend CFJOBS-E2E-${carimbo}`,
    company_name: `Empresa E2E ${carimbo}`,
    summary: 'Vaga montada pelo dublê do NIM para o teste de ponta a ponta.',
    description_md: `## Sobre a vaga\n\n${'Conteúdo suficiente para o schema aceitar a descrição. '.repeat(4)}\n\n## Requisitos\n\n- Go\n- PostgreSQL`,
    // `hybrid` de propósito: o slug cadastrado é \`hibrido\`, e só o alias
    // resolve. É o caminho que o mapeamento precisa exercitar.
    work_mode: 'hybrid',
    contract_type: 'clt',
    seniority: 'senior',
    role_category: 'backend',
    technologies: ['go', 'postgresql'],
    tags: [],
    unmatched_terms: [
      {
        kind: 'technology',
        label: `Datomic ${carimbo}`,
        context: 'experiência com Datomic é diferencial',
      },
    ],
    location: { city: 'Recife', state: 'PE', country: 'BR' },
    salary: { min: 12000, max: 18000, currency: 'BRL', period: 'month' },
    benefits: ['Plano de saúde'],
    keywords: ['go', 'backend'],
    language: 'pt-BR',
    posted_at: null,
    confidence: 0.91,
  }
}

const servidor = createServer((requisicao, resposta) => {
  console.log(`[dublê] ${requisicao.method} ${requisicao.url}`)

  if (!requisicao.url?.includes('/chat/completions')) {
    resposta.writeHead(404).end()
    return
  }

  const pedacos: Buffer[] = []
  requisicao.on('data', (pedaco: Buffer) => pedacos.push(pedaco))

  requisicao.on('end', () => {
    const corpo = Buffer.concat(pedacos).toString('utf8')
    const carimbo = corpo.match(MARCADOR)?.[1] ?? 'sem-marcador'

    resposta.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        id: 'chatcmpl-e2e',
        object: 'chat.completion',
        created: 0,
        model: 'dublê/e2e',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(vagaDe(carimbo)) },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 6200, completion_tokens: 950, total_tokens: 7150 },
      }),
    )
  })
})

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`dublê do NIM em http://127.0.0.1:${PORTA}/v1`)
})
