# Política de Segurança

## Como reportar uma vulnerabilidade

**Não abra uma issue pública.** Issues são visíveis a todos e expõem o problema antes de existir correção.

Use o [relato privado de vulnerabilidade do GitHub](https://github.com/Coding-Ferpa/cf-jobs/security/advisories/new) (aba **Security** → _Report a vulnerability_). O relato fica visível apenas para você e para as pessoas mantenedoras.

Se não conseguir usar esse canal, procure uma pessoa mantenedora em privado pelo Discord da comunidade Coding Ferpa — sem detalhes técnicos na mensagem inicial.

## O que incluir no relato

- Onde está o problema (rota, arquivo, endpoint ou tela).
- Passos para reproduzir, com o mínimo necessário.
- Qual o impacto: o que uma pessoa mal-intencionada consegue ler, alterar ou derrubar.
- Versão/commit em que você reproduziu.

## O que esperar

| Etapa                          | Prazo alvo                                                               |
| ------------------------------ | ------------------------------------------------------------------------ |
| Confirmação de recebimento     | 3 dias úteis                                                             |
| Avaliação inicial e severidade | 7 dias corridos                                                          |
| Correção ou plano de mitigação | conforme severidade; críticas têm prioridade sobre qualquer outra tarefa |

Divulgamos a falha publicamente (advisory + release) somente depois da correção disponível. Quem reportar recebe crédito no advisory, salvo se preferir anonimato.

## Escopo

Interessa especialmente:

- Falhas de autorização e políticas RLS que permitam ler ou alterar dados além do papel do usuário.
- SSRF no pipeline de importação (`safe-fetch`) e injeção de prompt que escape do JSON estruturado.
- XSS via conteúdo de vaga (Markdown sanitizado), CSRF em Server Actions, vazamento de segredos.
- Escalonamento de privilégio via custom claims do JWT.

Fora de escopo: ataques que exijam acesso físico à máquina da vítima, engenharia social contra mantenedores, resultados de scanners automáticos sem prova de exploração e relatos de força bruta em endpoints já protegidos por rate limit.

## Versões suportadas

O projeto está em desenvolvimento inicial: correções são aplicadas na branch `main` e publicadas no próximo release. Não há suporte a versões anteriores.
