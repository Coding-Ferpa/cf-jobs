import { z } from 'zod'

/**
 * O Zod do projeto, com o locale pt-BR já aplicado (doc 02).
 *
 * A UI é pt-BR por princípio (doc 00), mas as mensagens embutidas do Zod saem
 * em inglês — e elas aparecem em toda validação que não escreve a própria
 * mensagem: `z.uuid()`, `z.url()`, faixas numéricas. Antes disto, o campo de
 * ordenação do admin dizia "Too big: expected number to be <=100".
 *
 * **Por que aqui e não no `instrumentation.ts`**, como seria o natural para
 * uma configuração global: `z.config()` altera um registro de módulo, e o
 * Next compila `instrumentation.ts` em um bundle separado do das rotas — cada
 * um com a sua cópia do Zod. Verificado: o `register()` roda, e a rota
 * continua respondendo em inglês. Configurar no módulo que os schemas
 * importam é o que garante ser a mesma instância. Ver ADR-0016.
 *
 * Uma regra do ESLint recusa `import { z } from 'zod'` fora deste arquivo —
 * sem ela, um schema novo voltaria a falar inglês sem ninguém perceber.
 *
 * Mensagem manual continua valendo onde ela diz mais que o locale: "Escolha a
 * empresa." orienta, "Muito pequeno: esperado que string tivesse >=1
 * caracteres" apenas descreve.
 */
z.config(z.locales.pt())

export { z }
