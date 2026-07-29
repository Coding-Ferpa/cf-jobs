# ADR-0015 — Build com webpack no Next 16, até o Turbopack caber no budget

- **Status:** aceita (provisória — ver "Consequências")
- **Data:** 2026-07-29
- **Autores:** implementação do M4.1 (upgrade para Next 16)

## Contexto

O Next 16 passou a usar o **Turbopack como bundler padrão do build**. O [doc 12](../12-qualidade.md) fixa **LCP < 2,5 s (lab)** como budget bloqueante de CI.

Medido nesta máquina, três execuções do Lighthouse por bundler, mesmo commit e mesmo servidor de produção:

| Bundler | LCP (3 medições) | JS transferido na home |
| --- | --- | --- |
| webpack | 2477 / 2475 / 2471 ms | 147 kB |
| Turbopack | 2630 / 2771 / 2773 ms | 163 kB |

A diferença é consistente, não ruído: o Turbopack entrega ~16 kB a mais em mais arquivos e estoura o budget de LCP em todas as medições. Os demais budgets (performance ≥ 0,9, acessibilidade, SEO, CLS, JS < 250 kB) passam nos dois.

Para referência, no Next 15 a mesma página media 2333 ms e 127 kB — parte do custo é do próprio Next 16 e aparece nos dois bundlers.

## Decisão

O script `build` passa a chamar `next build --webpack` explicitamente, até que o Turbopack caiba no budget do doc 12 ou o budget seja revisto pelo mantenedor com dados de campo.

Relaxar o budget para acomodar a ferramenta não é opção desta ADR: o número do doc 12 é decisão de arquitetura, e mexer nele é do mantenedor.

## Consequências

- Positivas: o gate de performance continua medindo performance, e a comparação com as medições do M3 segue válida.
- Negativas / trade-offs aceitos: o webpack está **descontinuado** no Next 16 e deve sair no 17 — isto é uma ponte, não um destino. Perde-se também a velocidade de build do Turbopack. Enquanto durar, o `--experimental-analyze` (que só funciona com Turbopack) fica indisponível.
- **Esta ADR precisa ser revisitada antes do Next 17.** Os caminhos são: reduzir o JS da home (o painel de filtros hidrata 133 checkboxes de tecnologia, candidato natural), ou rever o budget com dados reais de usuário em vez de laboratório.

## Alternativas consideradas

- **Aceitar o Turbopack e afrouxar o budget de LCP** — rejeitada: baixar o gate para caber na ferramenta inverte o propósito do gate, e o número é do doc 12.
- **Ficar no Next 15** — rejeitada: o upgrade foi pedido, tudo o mais passa, e adiar só aumenta a distância até o 17.
- **Otimizar a home agora para caber com Turbopack** — rejeitada neste lote: é mudança de produto (o que hidrata na home) no meio de um lote de manutenção, e merece medição própria.
