# ADR-0019 — `minimumReleaseAge` desligado

- **Status:** aceita
- **Data:** 2026-08-20
- **Autores:** decisão do mantenedor, na atualização de dependências pós-M8

## Contexto

O [doc 01](../01-stack.md) registrou, na adoção do pnpm 11 (M8), a política
`minimumReleaseAge: 1440` — o gerenciador recusa qualquer pacote publicado nas
últimas 24 horas. Ela foi aprovada como postura de supply chain, alinhada ao
[doc 07](../07-seguranca.md) (A08), e cobre um ataque específico: o pacote
comprometido que é publicado e retirado poucas horas depois, quando a
comunidade percebe. O intervalo é o tempo que essa percepção costuma levar.

Na primeira atualização de dependências depois do M8, oito pacotes lançados no
mesmo dia foram barrados:

```
@vitejs/plugin-react   6.1.0    02:49 UTC      ai                     7.0.71   20:07
vite                   8.2.2    04:14          @scalar/nextjs-api-ref 0.11.16  21:12
nuqs                   2.10.0   08:10          @scalar/openapi-parser 0.28.16  21:12
@ai-sdk/openai-compat  3.0.33   20:07          @scalar/api-reference  1.66.1   21:14
```

O comportamento foi o contratado: o pnpm caiu na versão anterior de cada uma. O
mantenedor optou por atualizá-las na hora e desligar a política.

## Decisão

`minimumReleaseAge: 0` em `pnpm-workspace.yaml`. Sem espera: qualquer versão
publicada entra na resolução assim que existe.

## Consequências

- **A proteção deixa de existir.** Um pacote comprometido publicado agora entra
  no lockfile sem resistência — é o cenário que o intervalo cobria, e ele passa
  a depender inteiramente do que vem depois: `pnpm audit --prod` bloqueante no
  CI (ADR-0011), lockfile commitado e revisão de PR de dependência.
- **O que melhora:** atualização de dependência deixa de ter espera embutida, e
  PR do Dependabot com pacote recém-lançado para de falhar o CI por 24 horas.
- **A linha do doc 01 muda de sentido:** ela descrevia a política como ativa e
  passa a descrevê-la como desligada, com o ponteiro para cá.
- **Voltar atrás é trocar um número.** Nada no projeto depende do valor ser
  zero; `minimumReleaseAge: 1440` restaura o comportamento anterior, e o custo
  de restaurar é o mesmo de antes — esperar as dependências novas envelhecerem.

## Alternativas consideradas

- **Manter 1440 e esperar** — foi a recomendação inicial: as oito estariam
  disponíveis em algumas horas. Rejeitada pelo mantenedor.
- **Instalação pontual com `--config.minimumReleaseAge=0`, mantendo a política
  no arquivo** — atualizaria as oito hoje sem desligar nada, mas deixaria no
  lockfile entradas que o CI recusaria até envelhecerem: troca um problema por
  outro, mais confuso.
- **Reduzir para um intervalo menor (ex.: 60 minutos)** — mantém alguma janela
  contra o pacote publicado e retirado em minutos. Não foi pedida; fica
  registrada como meio-termo se a decisão for revisitada.
