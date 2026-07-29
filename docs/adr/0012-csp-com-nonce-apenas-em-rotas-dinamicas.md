# ADR-0012 — CSP com nonce apenas nas rotas dinâmicas

- **Status:** aceita
- **Data:** 2026-07-28
- **Autores:** implementação do M0

## Contexto

O [doc 07](../07-seguranca.md) pede CSP estrita com **nonce para scripts**. O [doc 08](../08-frontend-seo.md) pede que as páginas públicas sejam **estáticas com ISR** (homepage sem filtros e páginas de vaga), e o [doc 01](../01-stack.md) proíbe `force-dynamic` na área pública.

As duas exigências são incompatíveis na mesma rota. O nonce é gerado por requisição no middleware, e o Next só consegue carimbá-lo nas tags `<script>` quando renderiza aquela requisição; em HTML pré-renderizado as tags já existem sem nonce. Como `'strict-dynamic'` faz o navegador ignorar `'self'`, a política com nonce **bloqueia todo o JavaScript** de uma página estática.

Isso foi verificado no build de produção do M0: a home servia o HTML, mas `self.__next_f` ficava `undefined` — nenhum script executava e a página não hidratava.

## Decisão

A CSP passa a variar por área, escolhida no middleware:

- **Rotas dinâmicas** (`/admin/**`, `/login`): `script-src 'self' 'nonce-…' 'strict-dynamic'` — política estrita onde existe sessão autenticada e onde um XSS causaria mais dano.
- **Área pública** (estática/ISR): `script-src 'self' 'unsafe-inline'` — permite o bootstrap inline que o Next embute no HTML pré-renderizado.

Todas as demais diretivas (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`) permanecem iguais nas duas políticas, assim como os cabeçalhos fixos do doc 07.

## Consequências

- Positivas: o objetivo de SEO e performance do doc 08 é preservado sem abrir mão da CSP onde ela mais importa; o app funciona em produção (o que a política anterior impedia).
- Negativas / trade-offs aceitos: na área pública, `'unsafe-inline'` deixa de barrar um script inline injetado. O risco fica contido por outras camadas já previstas: nenhum HTML de terceiro é renderizado sem sanitização (`rehype-sanitize`, doc 07), não há `dangerouslySetInnerHTML` fora do renderer sanitizado e o conteúdo de vaga passa por revisão humana. Um teste E2E garante que a página pública continua hidratando, para que a política não volte a quebrar o JavaScript em silêncio.

## Alternativas consideradas

- **Tornar as páginas públicas dinâmicas para usar nonce** — rejeitada: contraria diretamente o doc 08 e o doc 01, e destrói a estratégia de cache que sustenta o SEO e o custo do projeto.
- **Hashes (`sha256-…`) em vez de nonce na área pública** — rejeitada: os scripts inline do Next mudam a cada build e dependem do conteúdo da página, o que exigiria gerar e injetar hashes por rota a cada build — muita máquina para pouca proteção adicional.
- **Manter a CSP com nonce em tudo e aceitar o site sem JavaScript** — rejeitada: quebra filtros, tema e beacon de analytics.
