# CF Jobs

Plataforma **open source** de vagas de tecnologia da comunidade [Coding Ferpa](https://codingferpa.org/) — _Além do código_.

Centraliza vagas em um único lugar com busca, filtros inteligentes e páginas otimizadas para SEO. O cadastro é feito colando apenas a **URL oficial da vaga**: o sistema extrai o conteúdo e usa IA (NVIDIA NIM) para classificar e preencher tudo automaticamente, com revisão humana antes de publicar.

## Status

📐 **Fase de arquitetura concluída** — a especificação técnica completa está em [`docs/`](docs/README.md). A implementação seguirá o plano de execução do [doc 14](docs/14-prompt-de-execucao-opus-5.md).

## Stack (decidida — ver [docs/01](docs/01-stack.md))

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 + shadcn/ui · Drizzle ORM · Supabase (Postgres + Auth) · NVIDIA NIM · Vercel

## Documentação

|                                                                                                                                                       |                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Visão geral](docs/00-visao-geral.md) · [Stack](docs/01-stack.md) · [Arquitetura](docs/02-arquitetura.md) · [Design System](docs/03-design-system.md) | [Banco de dados](docs/04-banco-de-dados.md) · [Pipeline de IA](docs/05-pipeline-ia.md) · [APIs](docs/06-apis.md) · [Segurança](docs/07-seguranca.md) |
| [Frontend & SEO](docs/08-frontend-seo.md) · [Analytics](docs/09-analytics-observabilidade.md) · [Escalabilidade](docs/10-escalabilidade.md)           | [Open Source](docs/11-open-source.md) · [Qualidade](docs/12-qualidade.md) · [Roadmap](docs/13-roadmap.md)                                            |

## Licença

[MIT](docs/11-open-source.md) (arquivo LICENSE será adicionado no milestone M0 da implementação).
