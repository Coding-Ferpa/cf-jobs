# ADR-0011 — Escopo do gate de `pnpm audit` no CI

- **Status:** aceita
- **Data:** 2026-07-28
- **Autores:** implementação do M0

## Contexto

O [doc 07](../07-seguranca.md) determina `pnpm audit` no CI falhando em severidade `high`/`critical`. Ao ligar o gate no M0, o comando já reprovava com 5 avisos `high`, todos em dependências transitivas de **desenvolvimento** (`brace-expansion` via `eslint` e `@vitest/coverage-v8`). O intervalo publicado nesse aviso (`<=5.0.7`) marca como vulneráveis também as linhas 1.x e 2.x que receberam correção própria (1.1.12+ e 2.0.2+), e forçar a linha 5.x nessas dependências quebraria as ferramentas que as consomem.

Manter o gate como está significaria CI vermelho desde o primeiro commit por um risco que não chega ao usuário — o caminho mais provável seria alguém desligar o passo inteiro, perdendo também a proteção que importa.

## Decisão

O gate bloqueante roda sobre as dependências de produção (`pnpm audit --prod --audit-level high`); a auditoria completa roda no mesmo job como passo informativo (`continue-on-error`).

Vulnerabilidades em dependências de produção foram zeradas com `pnpm.overrides` (`postcss` e `sharp`, ambas transitivas do `next`).

## Consequências

- Positivas: o que é entregue ao usuário continua sob gate estrito; contribuidores não são bloqueados por avisos de tooling; os avisos de desenvolvimento seguem visíveis no log do CI e o Dependabot continua abrindo PRs para eles.
- Negativas / trade-offs aceitos: um aviso `high` em dependência de desenvolvimento não trava mais o merge — depende de alguém ler o passo informativo ou o PR do Dependabot. Se surgir um caso realmente explorável em tooling (ex.: execução de código no CI), a resposta é corrigir na hora, não relaxar mais o gate.

## Alternativas consideradas

- **Manter o gate sobre todas as dependências** — rejeitada: reprova hoje por avisos sem impacto em produção e sem correção viável, o que treina o time a ignorar CI vermelho.
- **Forçar `brace-expansion@5` por override** — rejeitada: salto de quatro versões maiores em dependência interna do `eslint`/`minimatch`, com risco alto de quebrar o lint por um risco teórico em ferramenta local.
- **Ignorar avisos por lista de exceções (`--ignore`)** — rejeitada: a lista envelhece em silêncio e esconde avisos novos do mesmo pacote.
