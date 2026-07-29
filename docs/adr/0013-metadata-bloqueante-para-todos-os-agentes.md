# ADR-0013 — Metadata bloqueante para todos os agentes

- **Status:** aceita
- **Data:** 2026-07-29
- **Autores:** implementação do M3.1

## Contexto

O [doc 08](../08-frontend-seo.md) exige `<title>`, `description`, `canonical` e Open Graph em todas as páginas públicas, e o [doc 12](../12-qualidade.md) fixa **score de SEO igual a 1,0** como budget de CI.

O Next 15 transmite a metadata em vez de segurar o shell: as tags de `metadata`/`generateMetadata` viajam em um limite de Suspense e só entram no `<head>` se resolverem **antes** do primeiro flush. Quando a página renderiza rápido — o que acontece justamente no caminho feliz, com a listagem servida do `unstable_cache` — o shell sai primeiro e as tags são emitidas depois do `</head>`, dentro do `<body>`.

Verificado no build de produção do M3:

| Rota | `<title>` no `<head>` |
| --- | --- |
| `/` | não |
| `/?q=react` (sem cache, render mais lento) | sim |
| `/vagas/{slug}` | varia entre requisições |

Depois da hidratação as tags **continuam no `<body>`**: o React adota o nó existente onde ele está em vez de içá-lo. O `htmlLimitedBots` padrão do Next não inclui o Googlebot, na premissa de que quem executa JavaScript resolve isso sozinho — o que não se confirmou aqui.

Consequências observadas: `canonical` dentro do `<body>` é ignorado pelo Google, as tags de Open Graph ficam fora do alcance de quem só lê o `<head>`, e a auditoria `meta-description` do Lighthouse falha de forma intermitente — o budget de SEO do doc 12 vira um teste instável em vez de um gate.

## Decisão

`htmlLimitedBots: /.*/` no `next.config.ts`: todo user agent recebe metadata **bloqueante**, emitida no `<head>` do shell.

## Consequências

- Positivas: `<head>` completo e determinístico em toda requisição, em qualquer rota; o budget de SEO do doc 12 volta a medir SEO em vez de medir uma corrida.
- Negativas / trade-offs aceitos: o shell só é enviado depois que a metadata resolve, perdendo alguns milissegundos de streaming. O custo real é baixo porque a metadata depende dos mesmos dados que a página já precisa — na página de vaga, `generateMetadata` e o componente compartilham a mesma leitura memoizada por `unstable_cache`. Medido após a mudança: LCP e performance dentro dos budgets do doc 12.

## Alternativas consideradas

- **Listar só os rastreadores conhecidos em `htmlLimitedBots`** — rejeitada: transforma SEO em uma lista de user agents para manter à mão, e todo agente novo (ou que não se identifique) volta a receber o `<head>` vazio.
- **Deixar como está e afrouxar o budget de SEO do doc 12** — rejeitada: baixar o gate para esconder um defeito real inverte o propósito do budget, e o doc 08 pede as tags de verdade, não um score.
- **Renderizar as tags à mão no layout, fora da API de metadata** — rejeitada: duplica o que o Next já faz, quebra a herança de `metadataBase`/`template` e a geração de Open Graph por rota.
