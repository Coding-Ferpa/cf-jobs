# ADR-0014 — `updateTag` no lugar de `revalidateTag` nas Server Actions

- **Status:** aceita
- **Data:** 2026-07-29
- **Autores:** implementação do M4.1 (upgrade para Next 16)

## Contexto

O [doc 02](../02-arquitetura.md) fecha o esqueleto de toda Server Action com `revalidateTag`, e o [doc 01](../01-stack.md) apoia o ISR da área pública em `revalidateTag('jobs')` disparado pelas mutations. O comportamento de que o admin depende é direto: publicar uma vaga e vê-la na home no mesmo passo — é o que o E2E do M4 afirma.

O Next 16 dividiu essa API em duas:

| Função | Semântica |
| --- | --- |
| `revalidateTag(tag, profile)` | **purga** a tag; a releitura acontece na requisição seguinte. O segundo argumento passou a ser obrigatório. |
| `updateTag(tag)` | invalida **e** relê dentro da própria Server Action — *read-your-own-writes*. Só pode ser chamada de uma Server Action. |

Mantido `revalidateTag`, o build quebra (falta o segundo argumento) e, mesmo corrigindo a assinatura, a garantia que o admin usa deixa de existir: a home poderia responder com a listagem antiga logo depois de publicar.

## Decisão

O `defineAction` passa a chamar `updateTag` para cada tag declarada em `revalidar`. `revalidateTag` continua sendo o certo para invalidação **fora** de Server Action — é o caso do endpoint `/api/internal/revalidate` chamado pelo `pg_cron` ([doc 06](../06-apis.md)), que entra no M7 e não precisa de leitura imediata.

## Consequências

- Positivas: o comportamento descrito nos docs 01 e 02 continua valendo por inteiro no Next 16, com a função que o framework passou a designar para ele. O E2E que publica e procura na home segue verde.
- Negativas / trade-offs aceitos: as menções a `revalidateTag` nos docs 01 e 02 passam a se referir ao conceito, não à função literal — quem lê o código encontra `updateTag`. O comentário no `defineAction` aponta para esta ADR.

## Alternativas consideradas

- **`revalidateTag(tag, 'max')` para satisfazer a nova assinatura** — rejeitada: compila, mas troca leitura imediata por leitura na próxima requisição. O admin publicaria e não veria a vaga, que é justamente o passo que o DoD do M4 exige.
- **Chamar as duas** — rejeitada: `updateTag` já invalida; somar `revalidateTag` seria trabalho repetido sem efeito observável.
