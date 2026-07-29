# ADR-0016 — Locale do Zod no módulo `lib/zod`, não no bootstrap

- **Status:** aceita
- **Data:** 2026-07-29
- **Autores:** implementação do passo 0 pós-M5

## Contexto

O [doc 02](../02-arquitetura.md) decidiu, na tabela de decisões transversais, que as mensagens de validação seriam pt-BR em todo o app via **`z.config(z.locales.pt())` global no bootstrap**. A decisão em si não está em questão — as mensagens embutidas do Zod saem em inglês e apareciam em formulário do admin, o que contraria o doc 00 (produto em pt-BR).

O que não funciona é a palavra "bootstrap" na letra. `z.config()` grava em um registro do módulo Zod, e vale apenas para a instância que executou a chamada. O Next compila `instrumentation.ts` em um bundle separado do das rotas, cada um com a sua cópia do Zod.

Medido, com `next dev` (Turbopack) e `src/instrumentation.ts` chamando `register()`:

```
[instrumentation] register rodou em nodejs
GET /api/v1/jobs?status=rascunho
→ "Invalid option: expected one of "published"|"archived"|"all""
```

O `register()` roda — e a rota continua em inglês. Movendo a mesma chamada para um módulo que a rota importa, a resposta vira `"Opção inválida: esperada uma das ..."`. Ou seja: o problema não é o bootstrap não executar, é a instância não ser a mesma.

## Decisão

O locale é aplicado em **`src/lib/zod.ts`**, que configura e reexporta o `z`. Todo schema do projeto importa `z` de lá, e não de `zod`. Uma regra `no-restricted-imports` do ESLint recusa `import { z } from 'zod'` fora desse arquivo.

`instrumentation.ts` e `instrumentation-client.ts` foram removidos: existiam só para isso e não cumpriam o papel.

## Consequências

- Positivas: a instância configurada é, por construção, a mesma que cria os schemas — em servidor, navegador e testes, sem depender de ordem de carga. A regra do ESLint transforma "esqueceram o import" em erro de lint, e não em mensagem em inglês descoberta por um usuário. O setup do Vitest não precisa de nada: importar o schema já traz o locale.
- Negativas / trade-offs aceitos: uma indireção a mais (`@/lib/zod` em vez de `zod`) que não é a convenção que se encontra na documentação do Zod. Quem tropeça nela recebe a explicação na mensagem do lint e o porquê no cabeçalho de `lib/zod.ts`.
- Se um dia o Next passar a compartilhar uma instância de módulo entre `instrumentation` e rotas, dá para voltar ao bootstrap — mas não há ganho em fazê-lo: o módulo compartilhado é mais garantido, não menos.

## Alternativas consideradas

- **Importar `@/lib/zod-locale` por efeito colateral em cada módulo de schema** — rejeitada: funciona igual, mas um schema novo que esquecesse o import voltaria a falar inglês em silêncio. A reexportação com regra de lint fecha esse buraco.
- **Manter `instrumentation.ts` junto, "por garantia"** — rejeitada: código que não faz efeito, sugerindo que faz, é pior que código ausente.
- **Escrever mensagem manual em toda validação** — rejeitada: é o que já se fazia, e foi justamente o esquecimento em `z.uuid()`, `z.url()` e faixas numéricas que deixou inglês na tela.
