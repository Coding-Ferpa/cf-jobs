# ADR-0020 — Adapter InHire e Fallback Manual para Páginas 100% JS

- **Status:** aceita
- **Data:** 2026-08-24
- **Autores:** @equipe-cf-jobs

## Contexto

A plataforma InHire (`*.inhire.app`) é amplamente utilizada no mercado brasileiro de tecnologia para divulgação de vagas. Suas páginas públicas são aplicações client-side (Next.js / SPA) com o conteúdo embutido em blocos `<script id="__NEXT_DATA__">` ou estruturas JSON de estado, o que gerava erro de extração (`pagina_exige_js`) quando processadas pelo fallback genérico via Mozilla Readability.

Além disso, existem páginas de vagas corporativas protegidas por autenticação, anti-bot ou renderizadas puramente no navegador sem scripts estáticos legíveis, onde requisições serverless HTTP simples não encontram o corpo textual da oportunidade.

## Decisão

1. **Adapter Nativo InHire (`src/features/import/adapters/inhire.ts`)**:
   Implementar adapter específico que detecta domínios `*.inhire.app` e `app.inhire.app`, extraindo os dados estruturados (`title`, `companyName`, `location`, `remote`, `salary`, `applyUrl`) e montando Markdown padronizado das seções (`Descrição`, `Responsabilidades`, `Requisitos`, `Desejáveis e Diferenciais`, `Benefícios`).

2. **Fallback Universal via Conteúdo Bruto (`conteudoBruto`)**:
   Adicionar suporte no pipeline (`EntradaDoPipeline.conteudoBruto`), Server Actions (`iniciarImportacaoSchema.conteudoBruto`) e interface admin (`ImportWizard`) para colar texto ou código HTML copiado da vaga. Quando fornecido, o pipeline pula o fetch de rede (`fetching`), processa o conteúdo como `sourceSite: 'manual'` na etapa `extracting` e avança diretamente para a classificação com o modelo de IA (NVIDIA NIM) usando o schema canônico do sistema (`vagaClassificadaSchema`).

## Consequências

- **Positivas:**
  - Suporte nativo e robusto ao ATS InHire sem raspagem frágil de HTML.
  - Rede de segurança universal: qualquer vaga (mesmo em SPAs fechadas ou páginas com login) pode ser importada colando o conteúdo na UI.
  - Mantém o princípio arquitetural de evitar navegadores headless (Playwright) em runtime serverless, economizando custos e tempo de execução.
  - Preserva a taxonomia e o contrato de dados canônicos (`vagaClassificadaSchema`) sem criar prompts isolados por ATS.
- **Negativas / trade-offs aceitos:**
  - Importação de SPAs não suportadas por adapter exige ação manual do administrador (copiar e colar o texto da vaga no formulário).

## Alternativas consideradas

- **Headless Browser (Playwright / Puppeteer no backend):** Rejeitado. Operar browsers headless em serverless/edge é caro, lento (latência > 10s extra), consome muita memória e quebra com facilidade por atualizações de dependências.
- **Prompt de IA isolado com schema em português (ex: `titulo_vaga`):** Rejeitado. Criar prompts com schemas diferentes por ATS duplicaria lógica de mapeamento e quebraria a validação de tipos e resolução de taxonomias do banco de dados (`map-taxonomies.ts`).
