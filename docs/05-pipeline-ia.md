# 05 — Pipeline de Importação com IA (NVIDIA NIM)

## Visão geral

Entrada: **uma URL oficial de vaga**. Saída: **vaga classificada em `pending_review`** com taxonomias mapeadas e sugestões de termos novos na fila de revisão. Máquina de estados registrada em `job_imports.status`:

```
queued → fetching → extracting → classifying → mapping → review → completed
   └────────┴──────────┴─────────────┴────────────┴→ failed (error_step + error_message)
```

`review` = vaga criada aguardando revisão humana; `completed` = vaga publicada pelo admin.

## Etapa 1 — Validação e normalização da URL

1. **Sintaxe**: apenas `https:` (http é upgradado); rejeitar userinfo (`user@host`), portas não-padrão.
2. **Anti-SSRF** (obrigatório, ver [doc 07](07-seguranca.md)): resolver DNS e rejeitar IPs privados/loopback/link-local/metadata (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7); re-validar a cada redirect (máx. 3); bloquear respostas > 5 MB e content-types que não sejam HTML/JSON.
3. **Canonicalização**: remover parâmetros de tracking (`utm_*`, `gclid`, `fbclid`, `ref`, `src`), fragmentos e trailing slash; lowercase de host. `url_hash = sha256(url_canônica)`.
4. **Dedup**: se existir `jobs.source_url_hash` igual → retorna a vaga existente ("Vaga já cadastrada", com link). Se existir `job_imports` bem-sucedido nas últimas 24h → reutiliza `raw_content` (cache).

## Etapa 2 — Aquisição de conteúdo (adapters)

Detecção do adapter por padrão de host/URL. **Insight central: os principais ATSs expõem APIs JSON públicas — usar API elimina scraping frágil.**

| Adapter | Detecção | Estratégia |
|---|---|---|
| `greenhouse` | `boards.greenhouse.io/{org}/jobs/{id}`, `job-boards.greenhouse.io` | API pública `boards-api.greenhouse.io/v1/boards/{org}/jobs/{id}` → JSON com título, localização, conteúdo HTML |
| `lever` | `jobs.lever.co/{org}/{id}` | API pública `api.lever.co/v0/postings/{org}/{id}` → JSON estruturado |
| `ashby` | `jobs.ashbyhq.com/{org}/{id}` | Posting API pública (`api.ashbyhq.com/posting-api/job-board/{org}`) filtrando pelo id |
| `gupy` | `{org}.gupy.io/jobs/{id}` ou `{org}.gupy.io/job/...` | JSON embutido (`__NEXT_DATA__`) na página pública; fallback HTML genérico |
| `workday` | `*.myworkdayjobs.com` | Endpoint JSON interno da própria página (`.../wday/cxs/...` correspondente à URL); fallback genérico |
| `linkedin` | `linkedin.com/jobs/view/{id}` | **Somente** JSON-LD `JobPosting` da página pública quando acessível sem login; caso bloqueado, orientar o admin a usar o link do ATS de origem (mensagem específica na UI). Nunca burlar login/anti-bot — respeito a ToS |
| `generic` | qualquer outra | Pipeline em cascata (abaixo) |

**Adapter genérico (cascata, para na primeira que funcionar):**
1. **JSON-LD `JobPosting`** (`<script type="application/ld+json">`): Greenhouse, Ashby, Gupy e a maioria dos boards embutem — é a fonte mais confiável; campos estruturados já saem daqui e o texto vai para a IA apenas para complementar.
2. **Extração de conteúdo principal** com Mozilla Readability sobre o HTML (JSDOM/linkedom) → conversão a Markdown (Turndown) → normalização de espaços.
3. Se o HTML vier "vazio" (SPA client-side rendered, heurística: `<body>` com < 500 chars de texto): marcar `failed` no passo `fetching` com mensagem clara ("Página exige JavaScript; use o link direto do sistema de vagas da empresa"). **Decisão: sem headless browser no MVP** — Playwright em serverless é caro, lento e frágil; os adapters de ATS cobrem a imensa maioria dos casos reais. Reavaliar na Fase 2 com um serviço de render externo opcional (configurável por env).

Regras de fetch: timeout 15s, `User-Agent` identificado (`CFJobsBot/1.0 (+https://vagas.codingferpa.org/bot)`), respeitar `robots.txt` para o adapter genérico, 1 requisição por importação (sem crawling). Conteúdo final truncado em **20.000 caracteres** de Markdown (mantém início + seção de requisitos se detectável) antes da IA.

## Etapa 3 — Classificação com NVIDIA NIM

### Configuração da chamada

| Parâmetro | Valor | Racional |
|---|---|---|
| Endpoint | `https://integrate.api.nvidia.com/v1/chat/completions` | OpenAI-compatível |
| Modelo primário | `meta/llama-3.3-70b-instruct` | melhor custo/qualidade p/ extração; 128k ctx |
| Fallback 1 | `nvidia/llama-3.1-nemotron-70b-instruct` | reforço de instruction-following |
| Fallback 2 | `mistralai/mistral-small-24b-instruct` | barato/rápido, degradação graciosa |
| `temperature` | 0.1 | extração determinística |
| `max_tokens` | 2048 | JSON de resposta cabe com folga |
| `nvext.guided_json` | JSON Schema abaixo | decoding restrito ao schema (recurso NIM) — elimina JSON inválido na origem |
| Timeout | 45s por chamada | 70B pode demorar sob carga |

A chamada envia ao modelo: o system prompt, as **listas de taxonomias ativas** (slugs + labels, extraídas do banco no momento da chamada) e o conteúdo Markdown da vaga. Enviar as listas é o que permite ao modelo *selecionar* registros existentes em vez de inventar — requisito do projeto.

### System prompt (canônico — manter em `src/features/import/prompt.ts`)

```text
Você é um extrator de dados de vagas de emprego de tecnologia. Sua única função é
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
11. Datas no formato ISO 8601 (YYYY-MM-DD). posted_at null se não explícita.
```

### User prompt (template)

```text
LISTAS DE OPÇÕES VÁLIDAS (selecione apenas destes slugs):
work_modes: {{slugs}}
contract_types: {{slugs}}
seniority_levels: {{slugs}}
role_categories: {{slugs}}
technologies: {{slug — label (kind), ...}}   // inclui aliases
tags: {{slugs}}

URL DE ORIGEM: {{url}}
DADOS ESTRUTURADOS JÁ EXTRAÍDOS (JSON-LD/API, podem estar incompletos): {{jsonld_ou_null}}

CONTEÚDO DA VAGA (Markdown):
"""
{{conteudo}}
"""

Retorne o JSON conforme o schema.
```

### JSON Schema da resposta (usado em `guided_json` E espelhado em Zod)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["title", "company_name", "description_md", "summary", "confidence",
               "work_mode", "contract_type", "seniority", "role_category",
               "technologies", "tags", "unmatched_terms", "location", "salary"],
  "properties": {
    "title": { "type": "string", "minLength": 3, "maxLength": 200 },
    "company_name": { "type": "string", "minLength": 1, "maxLength": 120 },
    "summary": { "type": "string", "maxLength": 280 },
    "description_md": { "type": "string", "minLength": 100 },
    "work_mode": { "type": ["string", "null"] },
    "contract_type": { "type": ["string", "null"] },
    "seniority": { "type": ["string", "null"] },
    "role_category": { "type": ["string", "null"] },
    "technologies": { "type": "array", "maxItems": 20, "items": { "type": "string" } },
    "tags": { "type": "array", "maxItems": 10, "items": { "type": "string" } },
    "unmatched_terms": { "type": "array", "maxItems": 15, "items": {
      "type": "object", "required": ["kind", "label"],
      "properties": {
        "kind": { "enum": ["technology", "tag", "role_category"] },
        "label": { "type": "string", "maxLength": 60 },
        "context": { "type": "string", "maxLength": 200 } } } },
    "location": { "type": "object",
      "properties": {
        "city": { "type": ["string", "null"] },
        "state": { "type": ["string", "null"] },
        "country": { "type": ["string", "null"], "pattern": "^[A-Z]{2}$" } } },
    "salary": { "type": "object",
      "properties": {
        "min": { "type": ["number", "null"] },
        "max": { "type": ["number", "null"] },
        "currency": { "type": ["string", "null"], "pattern": "^[A-Z]{3}$" },
        "period": { "type": ["string", "null"], "enum": ["hour", "month", "year", null] } } },
    "benefits": { "type": "array", "maxItems": 25, "items": { "type": "string", "maxLength": 80 } },
    "keywords": { "type": "array", "maxItems": 15, "items": { "type": "string", "maxLength": 40 } },
    "language": { "type": "string", "pattern": "^[a-z]{2}(-[A-Z]{2})?$" },
    "posted_at": { "type": ["string", "null"], "format": "date" },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
  }
}
```

**Exemplo de resposta válida** (vaga Nubank sênior backend): `{"title":"Senior Software Engineer - Backend","company_name":"Nubank","summary":"Vaga sênior de backend no Nubank para atuar com Clojure e microsserviços, modelo híbrido em São Paulo.","description_md":"## About the role\n...","work_mode":"hybrid","contract_type":"clt","seniority":"senior","role_category":"backend","technologies":["clojure","kafka","aws","postgresql"],"tags":["fintech"],"unmatched_terms":[{"kind":"technology","label":"Datomic","context":"experience with Datomic databases"}],"location":{"city":"São Paulo","state":"SP","country":"BR"},"salary":{"min":null,"max":null,"currency":null,"period":null},"benefits":["Plano de saúde","Vale refeição"],"keywords":["clojure","backend","microservices"],"language":"en","posted_at":null,"confidence":0.92}`

### Validação em camadas (defesa em profundidade)

1. `guided_json` restringe o decoding (quando o modelo suporta; se o NIM retornar erro de suporte, repete sem `nvext` — flag registrada).
2. Parse + **Zod** com o mesmo schema (fonte de verdade: Zod; o JSON Schema é gerado dele via `z.toJSONSchema()` para nunca divergirem).
3. **Validação semântica pós-parse**: slugs retornados existem mesmo nas listas? `salary_min <= salary_max`? `description_md` não é cópia do prompt? `confidence >= 0.5` (abaixo disso a importação vai para `review` com alerta vermelho "baixa confiança" na UI).
4. Falha de parse/validação → **1 retry de reparo**: reenvia com a resposta inválida + erros do Zod anexados ("corrija e retorne apenas o JSON"). Persiste `attempt=2`.

## Etapa 4 — Mapeamento de taxonomias

Para cada slug retornado: lookup exato por `slug` → por `aliases` (GIN) → **fuzzy trigram** (`similarity(label, termo) > 0.85`) como rede de segurança para variações ("ReactJS" → react). Termos em `unmatched_terms` (e qualquer slug que ainda assim não resolver) viram `taxonomy_suggestions(status=pending)` — **a IA nunca cria taxonomia diretamente**.

**Fluxo de revisão humana de sugestões** (tela `admin/taxonomias/sugestoes`): moderador vê label sugerida + contexto + vaga de origem e escolhe: **Aprovar** (cria a taxonomia e vincula à vaga de origem), **Mesclar** (aponta para taxonomia existente e adiciona o termo aos `aliases` — o sistema aprende), **Rejeitar**. Tudo auditado.

## Etapa 5 — Persistência

Empresa: match por `lower(name)` → cria se nova (sem revisão: empresa é dado factual, não taxonomia). Vaga criada com `status=pending_review`, slug gerado, `source_site` do adapter. Transação única (vaga + junções + sugestões + update do import).

## Erros, retries, timeouts, fallback (matriz)

| Falha | Tratamento |
|---|---|
| Fetch da fonte (timeout/4xx/5xx) | 3 tentativas, backoff exponencial c/ jitter (1s, 3s, 9s); 404 não retenta (vaga removida); mensagem específica por classe de erro |
| Página exige JS | falha imediata com orientação ao admin (usar link do ATS) |
| NIM 429/5xx | 2 retries backoff; depois **fallback de modelo** (primário → fallback 1 → 2); tudo registrado em `job_imports.model` |
| NIM timeout (45s) | 1 retry no modelo fallback (mais rápido) |
| JSON inválido / Zod falha | 1 retry de reparo (acima); depois `failed` no passo `classifying` |
| Confiança < 0.5 | não falha: vaga criada com alerta de baixa confiança para revisão cuidadosa |
| Orçamento de tempo total do pipeline | 55s (margem sob maxDuration 60s); estouro → `failed` com passo atual preservado — **re-execução retoma do cache** de `raw_content` |

Reprocessar: botão "Tentar novamente" no admin cria novo `job_imports` (attempt+1) reutilizando cache de conteúdo quando < 24h — não refaz fetch, vai direto à IA.

## Cache

- `raw_content` por `url_hash`, TTL lógico de 24h (reuso em retries e reimportações); limpo fisicamente após 7 dias por cron.
- Listas de taxonomias para o prompt: cache em memória da função por 5 min (`unstable_cache`/`React.cache`), invalidado por tag nas mutations de taxonomia.
- **Não** cachear respostas da IA entre URLs diferentes (conteúdo sempre único).

## Custo e orçamento

**Tier contratado:** API key gratuita do build.nvidia.com com limite de **40 requisições/minuto** — muito acima da necessidade (1–2 chamadas por importação; importação em lote processa no máx. 5/min). O cliente NIM deve ainda assim tratar `429` com backoff (tabela acima) e a importação em lote deve manter o teto de 5 imports/min como throttle explícito, garantindo margem mesmo com retries e reparos.

Estimativa por importação com Llama 3.3 70B (preços NVIDIA ~US$0,20/M tokens in, ~US$0,60/M out, a confirmar no build.nvidia.com): prompt ~6k tokens (conteúdo 4-5k + listas 1k) + saída ~1,2k → **≈ US$ 0,002 por vaga**. 500 vagas/mês ≈ US$ 1. O free tier de créditos do build.nvidia.com cobre o MVP inteiro. Guard-rails: alerta no dashboard quando tokens do mês > limite configurável (`AI_MONTHLY_TOKEN_BUDGET`, soma de `tokens_in+tokens_out` em `job_imports`); bloqueio suave (aviso, exige confirmação) ao ultrapassar.

## Observabilidade do pipeline

Cada import registra: etapas com timestamps (latência por etapa derivável), modelo usado, tokens, tentativas, erro estruturado (`error_step` + `error_message`). O dashboard exibe: taxa de sucesso, falhas por etapa, latência média/P95, tokens/custo mensal, distribuição por adapter e por modelo (ver [doc 09](09-analytics-observabilidade.md)). Logs estruturados (JSON via `pino`) com `import_id` como correlation id nos logs da Vercel.

## Importação em lote (Fase 2 — desenho antecipado)

Colar N URLs → cria N `job_imports (queued)` → um **Vercel Cron a cada minuto** processa até 5 pendentes por execução (lock otimista via `UPDATE ... WHERE status='queued' ... FOR UPDATE SKIP LOCKED`). Mesmo pipeline, zero infra nova — a tabela já é a fila. Fontes RSS/APIs de boards podem alimentar a mesma fila.
