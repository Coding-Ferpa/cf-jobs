# 08 — Frontend, Páginas e SEO

## Mapa de rotas

| Rota | Renderização | Cache |
|---|---|---|
| `/` (homepage = busca + listagem) | RSC dinâmico com `searchParams`; **sem filtros** serve versão ISR (60s) | CDN + tag `jobs` |
| `/vagas/[slug]` | **SSG + ISR** (`generateStaticParams` p/ recentes; on-demand p/ resto) | revalidate 1h + tag `job:{slug}` |
| `/empresas/[slug]` (Fase 2) | ISR | tag `jobs` |
| `/sobre`, `/privacidade`, `/bot` | estático puro | build |
| `/login` | dinâmico | — |
| `/admin/**` | dinâmico, sem cache, `noindex` | — |
| `/sitemap.xml`, `/robots.txt` | rotas geradas (`sitemap.ts`/`robots.ts`) | 1h |
| `/vagas/[slug]/opengraph-image` | ImageResponse na edge | imutável por deploy |

Decisão de fundo: **a homepage com filtros é dinâmica** (combinações infinitas não são cacheáveis), mas a resposta é rápida porque a query é indexada e o HTML é streamado (Suspense na lista, filtros renderizam imediatamente). A versão sem query params — a mais acessada e a indexada — é servida de cache ISR.

## Homepage — composição

1. **Hero compacto** (título "Vagas de tecnologia, direto ao ponto." + busca) — encolhe após primeira interação de scroll.
2. **Barra de filtros ativos** (chips removíveis) + ordenação (Recentes | Relevância) + contagem de resultados.
3. **Grid de JobCards** ([spec no doc 03](03-design-system.md)) — lista virtual não é necessária no MVP; paginação **"Carregar mais"** (botão) em vez de infinite scroll automático. Racional: infinite scroll puro prejudica footer, SEO e a sensação de controle; o botão dá o mesmo fluxo com URL atualizada (`?cursor=`) e permanece indexável via link `rel="next"`. Reavaliar na Fase 3 com dados de uso.
4. **Sidebar de filtros** (desktop) / Sheet (mobile) com facet counts.
5. Footer com links da comunidade (site, Discord, GitHub do projeto, Instagram).

Estados: skeletons nos cards durante transição de filtros (`useTransition`), empty state ilustrado, error boundary com retry.

## Página da vaga — SEO máximo

- `generateMetadata`: `title` = `"{Título} — {Empresa} | Vagas Coding Ferpa"`; `description` = `summary`; canonical = URL própria; `og:image` gerada; `article:published_time`.
- **JSON-LD `JobPosting`** completo (requisito para Google for Jobs): `title`, `description` (HTML sanitizado), `datePosted`, `validThrough` (= expires_at), `employmentType` mapeado (CLT→FULL_TIME etc.), `hiringOrganization`, `jobLocation`/`jobLocationType: TELECOMMUTE` quando remoto, `applicantLocationRequirements` quando remoto com restrição de país, `baseSalary` quando existir, `directApply: false`. Vaga arquivada mantém o JSON-LD com `validThrough` no passado (sinal correto de expiração ao Google).
- **BreadcrumbList** JSON-LD + breadcrumb visual.
- Vagas arquivadas: página permanece (200), banner de expirada, `<meta name="robots" content="noindex">` **não** é usado — em vez disso o sitemap as remove e o `validThrough` expira; links internos "vagas semelhantes" mantêm o link juice.
- Compartilhamento: Web Share API no mobile; botões WhatsApp/LinkedIn/X/copiar no desktop; UTM `?utm_source=share_{canal}` para medir origem ([doc 09](09-analytics-observabilidade.md)).

## SEO global

- `sitemap.ts` dinâmico: homepage, páginas estáticas e **apenas vagas publicadas** (lastmod = updated_at), pagindo em chunks de 1.000; ping automático dispensável (Google usa sitemap do robots).
- `robots.ts`: allow geral, `disallow: /admin, /api`, aponta sitemap.
- Open Graph de listagem: imagem estática da marca; de vaga: `ImageResponse` com fundo `#0d0d0d`, glow violeta, título, empresa, chips de senioridade/modalidade e wordmark "CF Jobs" — Poppins embutida.
- Core Web Vitals: imagens com `next/image` (logos com `sizes` fixos), fontes `next/font` (zero CLS), zero JS de terceiros no caminho crítico (analytics via beacon próprio), streaming SSR (TTFB baixo). Orçamento: LCP < 2.0s (4G), CLS < 0.05, INP < 200ms — verificado por Lighthouse CI ([doc 12](12-qualidade.md)).
- URLs canônicas de filtro: filtros geram querystring (não paths); apenas a homepage limpa e páginas de vaga são canônicas indexáveis — evita explosão de URLs de conteúdo duplicado (`rel="canonical"` das filtradas → `/`).

## Admin — telas

| Tela | Conteúdo principal |
|---|---|
| `/admin` (dashboard) | cards de KPI + gráficos ([doc 09](09-analytics-observabilidade.md)) |
| `/admin/vagas` | tabela com busca/filtro por status, ações rápidas (publicar, arquivar, editar) |
| `/admin/vagas/importar` | input de URL → stepper de progresso (etapas do pipeline em tempo quase real via polling do `job_imports`) → redireciona à revisão |
| `/admin/vagas/[id]/revisar` | **tela mais importante do admin**: formulário pré-preenchido pela IA com badges de confiança, diff visual dos campos de baixa confiança, painel lateral com a página original (link) e sugestões de taxonomia pendentes desta vaga; botões Publicar / Salvar rascunho / Rejeitar |
| `/admin/taxonomias/[kind]` | CRUD com contagem de uso, merge de aliases |
| `/admin/taxonomias/sugestoes` | fila de revisão (aprovar/mesclar/rejeitar) |
| `/admin/importacoes` | log com filtros por status/adapter/modelo, retry |
| `/admin/usuarios` (admin) | gestão de papéis |

Formulários com `react-hook-form` + resolvers Zod (mesmos schemas das actions — validação idêntica client/server).

## Acessibilidade (requisito, não extra)

Navegação 100% por teclado (foco visível violeta), landmarks semânticos, `aria-live` na contagem de resultados ao filtrar, labels em todos os inputs, contraste AA garantido pelos tokens ([doc 03](03-design-system.md)), `prefers-reduced-motion` respeitado, testes automáticos com axe no Playwright + eslint-plugin-jsx-a11y no CI. Meta: Lighthouse a11y ≥ 95.
