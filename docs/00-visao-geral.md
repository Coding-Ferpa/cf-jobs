# 00 — Visão Geral

## O que é o CF Jobs

Plataforma **open source** de vagas de tecnologia da comunidade [Coding Ferpa](https://codingferpa.org/) (Fernandópolis/SP — "Além do código"). Centraliza vagas de múltiplas fontes em um único lugar, com busca, filtros inteligentes e páginas individuais otimizadas para SEO e compartilhamento.

O diferencial central: **o administrador cadastra uma vaga colando apenas a URL oficial**. O sistema acessa a fonte, extrai o conteúdo e usa IA (NVIDIA NIM) para classificar e preencher todos os campos automaticamente.

## Missão do produto

Alinhada aos pilares da comunidade (democratizar conhecimento, conectar pessoas, fomentar crescimento):

1. **Reduzir fricção** — membro encontra vagas relevantes em segundos, sem garimpar dezenas de portais.
2. **Qualidade sobre quantidade** — vagas curadas, classificadas e com prazo de validade (30 dias), sem "cemitério de vagas".
3. **Ser vitrine técnica da comunidade** — código aberto, moderno e acessível para novos contribuidores aprenderem na prática.

## Personas

| Persona | Necessidade | Área do sistema |
|---|---|---|
| **Dev da comunidade** (visitante anônimo) | Encontrar vagas por tecnologia, senioridade, modalidade; compartilhar no WhatsApp/Discord | Área pública |
| **Curador/Admin** | Cadastrar vagas em segundos colando URL; revisar classificações da IA; acompanhar métricas | Área administrativa |
| **Moderador/Editor** | Revisar sugestões de taxonomia, editar vagas, arquivar manualmente | Área administrativa (permissões reduzidas) |
| **Recrutador** (futuro, Fase 5) | Publicar vagas diretamente | Área de recrutadores |
| **Contribuidor open source** | Entender o código rápido, rodar localmente em minutos, contribuir com PRs pequenos | Repositório |

## Escopo por área

### Área pública (sem login)
- Homepage com listagem, busca textual e filtros combináveis (tecnologia, linguagem, framework, empresa, cargo, senioridade, modalidade, tipo de contratação, localização, tags, status ativa/arquivada).
- Página individual de cada vaga com URL amigável, breadcrumbs, botão de candidatura (link oficial), compartilhamento.
- SEO completo: metatags, Open Graph com imagem gerada por vaga, JSON-LD `JobPosting` (elegível ao Google for Jobs), sitemap dinâmico.
- Vagas arquivadas continuam acessíveis (URL permanente) mas não aparecem na listagem padrão; exibem aviso "vaga expirada".

### Área administrativa (login via Supabase Auth)
- Dashboard com métricas (totais, visualizações, cliques, CTR, importações, falhas de IA, tempo de processamento, uso do modelo).
- Importação de vaga por URL (individual) com tela de revisão do resultado da IA antes de publicar.
- CRUD de vagas e das tabelas auxiliares (tecnologias, cargos, modalidades, tipos, senioridades, tags, empresas).
- Fila de revisão de sugestões de taxonomia geradas pela IA.
- Logs de importação com detalhes de cada etapa.

## Princípios de projeto (guiam toda decisão)

1. **Custo próximo de zero** — tudo deve rodar nos planos gratuitos de Vercel + Supabase + NVIDIA (dev tier). Nenhuma dependência paga obrigatória.
2. **Simplicidade antes de abstração** — sem microserviços, sem filas externas, sem Redis obrigatório. Postgres resolve fila, cache de importação, rate limit e analytics no MVP.
3. **O banco é a fonte de verdade de segurança** — RLS sempre ativo; o frontend nunca é a única barreira.
4. **SEO é requisito funcional, não acabamento** — renderização no servidor por padrão; toda vaga é uma página estática incrementalmente regenerada.
5. **Contribuidor-first** — setup local em ≤ 10 minutos (`pnpm install && supabase start && pnpm dev`), docs em português, issues marcadas com `good first issue`.
6. **A IA propõe, o humano dispõe** — nada gerado por IA vai ao ar sem revisão humana no MVP; taxonomias novas passam por fila de aprovação.

## Fora de escopo do MVP (ver [Roadmap](13-roadmap.md))

Perfis públicos de devs, cadastro direto por recrutadores, candidatura pela plataforma, recomendação personalizada, integrações Discord/LinkedIn, marketplace. A modelagem de dados já reserva espaço para essas evoluções (ex.: tabela `profiles` com papéis extensíveis), mas nenhuma tela ou API delas será construída no MVP.

## Nomes e domínio

- Nome do projeto/repositório: **cfjobs** (exibição: "CF Jobs" ou "Vagas | Coding Ferpa").
- Domínio sugerido: `vagas.codingferpa.org` (subdomínio do site institucional; configurável via env `NEXT_PUBLIC_SITE_URL`).
- Idioma da interface: **pt-BR** (vagas podem estar em inglês; o campo `language` da vaga registra isso).
