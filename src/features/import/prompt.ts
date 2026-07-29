/**
 * Prompts canônicos da classificação (doc 05). **Este arquivo é o texto do
 * doc, não uma paráfrase dele** — mudar uma regra aqui sem mudar no doc 05
 * (ou o contrário) é o começo de uma divergência difícil de perceber, porque
 * a saída continua parecendo certa.
 *
 * A regra 3 é a que sustenta o projeto inteiro: o modelo *seleciona* de listas
 * que mandamos, em vez de inventar taxonomia. Termo novo vai para a fila de
 * sugestões e passa por gente.
 */

export const SYSTEM_PROMPT = `Você é um extrator de dados de vagas de emprego de tecnologia. Sua única função é
ler o conteúdo bruto de uma vaga e retornar um objeto JSON válido conforme o schema
fornecido. REGRAS ABSOLUTAS:

1. Responda APENAS com o objeto JSON. Sem markdown, sem cercas de código, sem
   explicações, sem texto antes ou depois.
2. NUNCA invente informações. Se um dado não estiver explícito ou claramente
   inferível do texto, use null (campos escalares) ou [] (listas).
3. Para os campos com lista de opções fornecida (work_mode, contract_type,
   seniority, role_category, technologies), escolha SOMENTE slugs presentes nas
   listas fornecidas na mensagem do usuário. Se identificar uma tecnologia ou tag
   relevante que NÃO está nas listas, NÃO a inclua no campo principal — adicione-a
   em "unmatched_terms" com o tipo correspondente.
4. Senioridade: se a vaga aceita múltiplos níveis, escolha o mínimo exigido.
   "Pleno/Sênior" → "pleno". Se não houver indicação, null.
5. Modalidade: "remote" apenas se explicitamente remoto. Híbrido → "hybrid".
   Se só há endereço do escritório sem menção a remoto → "onsite".
6. Salário: extraia apenas valores explícitos. "R$ 8.000 a R$ 12.000" →
   min 8000, max 12000, currency BRL. "Salário competitivo" → todos null.
   Valor único → min = max. Identifique o período (month/year/hour).
7. Localização: cidade/estado/país da vaga (não da sede da empresa, se diferirem).
   country em ISO 3166-1 alpha-2 (BR, US, PT...). Vaga 100% remota sem restrição →
   city/state null, country apenas se houver restrição ("remoto Brasil" → BR).
8. summary: 1-2 frases em português (máx 280 caracteres) resumindo a vaga de forma
   neutra e informativa. Sempre em português, mesmo que a vaga esteja em inglês.
9. description_md: o texto COMPLETO da vaga em Markdown limpo (títulos, listas),
   no idioma original, removendo navegação, rodapés, textos legais repetitivos e
   formulários. NÃO resuma a descrição.
10. confidence: sua confiança global na extração, 0.0 a 1.0. Extração de página
    incompleta ou ambígua deve rebaixar a confiança.
11. Datas no formato ISO 8601 (YYYY-MM-DD). posted_at null se não explícita.`

export type OpcaoDeTaxonomia = {
  slug: string
  label: string
  kind?: string | null
  aliases?: string[]
}

export type ListasDeOpcoes = {
  work_modes: OpcaoDeTaxonomia[]
  contract_types: OpcaoDeTaxonomia[]
  seniority_levels: OpcaoDeTaxonomia[]
  role_categories: OpcaoDeTaxonomia[]
  technologies: OpcaoDeTaxonomia[]
  tags: OpcaoDeTaxonomia[]
}

function apenasSlugs(opcoes: OpcaoDeTaxonomia[]): string {
  return opcoes.map((opcao) => opcao.slug).join(', ')
}

/**
 * Tecnologias vão com rótulo, tipo e aliases: é o que faz o modelo reconhecer
 * "ReactJS" como `react` sem precisar do passo de fuzzy depois.
 */
function tecnologias(opcoes: OpcaoDeTaxonomia[]): string {
  return opcoes
    .map((opcao) => {
      const tipo = opcao.kind ? ` (${opcao.kind})` : ''
      const sinonimos =
        opcao.aliases && opcao.aliases.length > 0 ? ` [${opcao.aliases.join(', ')}]` : ''
      return `${opcao.slug} — ${opcao.label}${tipo}${sinonimos}`
    })
    .join('\n')
}

export function montarUserPrompt(entrada: {
  url: string
  conteudo: string
  listas: ListasDeOpcoes
  estruturado?: unknown
}): string {
  const { url, conteudo, listas, estruturado } = entrada

  return `LISTAS DE OPÇÕES VÁLIDAS (selecione apenas destes slugs):
work_modes: ${apenasSlugs(listas.work_modes)}
contract_types: ${apenasSlugs(listas.contract_types)}
seniority_levels: ${apenasSlugs(listas.seniority_levels)}
role_categories: ${apenasSlugs(listas.role_categories)}
technologies:
${tecnologias(listas.technologies)}
tags: ${apenasSlugs(listas.tags)}

URL DE ORIGEM: ${url}
DADOS ESTRUTURADOS JÁ EXTRAÍDOS (JSON-LD/API, podem estar incompletos): ${
    estruturado ? JSON.stringify(estruturado) : 'null'
  }

CONTEÚDO DA VAGA (Markdown):
"""
${conteudo}
"""

Retorne o JSON conforme o schema.`
}

/**
 * Prompt do retry de reparo (doc 05): devolve ao modelo a própria resposta
 * inválida e o que o Zod reclamou. Corrigir o que ele mesmo escreveu custa
 * menos que refazer a extração do zero.
 */
export function montarPromptDeReparo(entrada: {
  respostaInvalida: string
  erros: string
}): string {
  return `A resposta anterior não passou na validação do schema.

RESPOSTA ANTERIOR:
"""
${entrada.respostaInvalida}
"""

ERROS DE VALIDAÇÃO:
${entrada.erros}

Corrija e retorne APENAS o objeto JSON válido, sem explicações.`
}
