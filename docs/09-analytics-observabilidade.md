# 09 — Analytics e Observabilidade

## Estratégia em três camadas

| Camada | Ferramenta | O que responde | Custo |
|---|---|---|---|
| **Métricas de produto (first-party)** | Postgres (`job_events` → `job_stats_daily`) | visualizações, cliques, CTR, shares por vaga/empresa/tecnologia — alimenta o dashboard admin | zero |
| **Métricas de site** | **Vercel Analytics** (Web Analytics + Speed Insights) | pageviews agregados, países, devices, Core Web Vitals reais | zero (hobby) |
| **Comportamento avançado** (Fase 3) | **PostHog Cloud free tier** | funis (busca→vaga→clique), retenção, heatmap de filtros usados | zero até 1M eventos/mês |

**Por que first-party primeiro:** (1) o dashboard exige métricas por vaga cruzadas com dados do banco (tecnologias mais buscadas, CTR por empresa) — nenhuma ferramenta externa cruza isso sem exportação; (2) LGPD-friendly por construção (sem cookies, hash anônimo rotativo); (3) dados ficam no projeto open source — qualquer deploy da comunidade tem analytics sem contratar nada. **Plausible** foi rejeitado (pago); **Supabase Analytics/Logflare** serve para logs de infraestrutura, não produto; **PostHog** entra na Fase 3 quando houver perguntas de funil que justifiquem o SDK no cliente.

## Coleta first-party

- `view`: beacon `navigator.sendBeacon('/api/v1/events')` no mount da página da vaga (componente client mínimo, ~0.3 kB).
- `click_apply`: no clique do CTA (beacon antes do `window.open`).
- `share`: ao usar botões de compartilhar (com `channel` no payload futuro).
- Dedup: 1 evento por tipo/vaga/visitante/dia (unique parcial) — números honestos, imunes a F5.
- `referrer` + `utm_source` capturados → responde "origem dos visitantes" (Discord vs WhatsApp vs Google) sem ferramenta externa.
- Rollup noturno (`rollup_job_stats`) agrega em `job_stats_daily` e atualiza contadores denormalizados; `job_events` cru é podado após 90 dias (agregados são eternos).

## Dashboard administrativo (widgets e fonte)

| Widget | Fonte |
|---|---|
| Totais: vagas ativas / arquivadas / pendentes / rejeitadas | `v_dashboard_summary` |
| Visualizações e cliques (7/30 dias) + série temporal | `job_stats_daily` |
| **CTR global e por vaga** (cliques/views) | idem |
| Top 10 vagas por views; top empresas; top tecnologias procuradas (views somadas por tech das vagas vistas) | join stats × junções |
| Tags mais usadas | contagem `job_tags` |
| Origem dos visitantes (referrer/utm agrupados) | `job_events` |
| **Importações**: sucesso vs falha, falhas por etapa, por adapter | `job_imports` |
| **IA**: tempo médio/P95 de pipeline, tokens mês, custo estimado, uso por modelo, taxa de baixa confiança, sugestões pendentes | `job_imports` + `taxonomy_suggestions` |
| Orçamento IA: barra de progresso vs `AI_MONTHLY_TOKEN_BUDGET` | soma mensal tokens |

Gráficos com **Recharts** (leve, composable, tema custom violeta: séries em `#8b5cf6`, `#c4b5fd`, `#a855f7`, grid `#262626`). Períodos: 7/30/90 dias. Tudo Server Component + um client wrapper por gráfico.

## Logs e erros

- **Logs estruturados** com `pino` (JSON): toda importação loga por etapa com `import_id`; actions logam `action`, `actor`, `entity`. Visíveis no painel da Vercel (runtime logs); formato JSON permite Log Drain futuro sem retrabalho.
- **Erros de runtime**: **Sentry (free tier)** desde a Fase 1 — captura server/client, source maps no build, alertas por e-mail. Justificativa: bug silencioso em pipeline de IA é o risco nº 1 do produto; o custo de integração é meia hora. DSN opcional por env (deploys da comunidade funcionam sem).
  - **Estado no M7:** captura implementada nos dois lados (`instrumentation.ts` com `onRequestError` no servidor, `instrumentation-client.ts` no navegador). Sem `NEXT_PUBLIC_SENTRY_DSN` o SDK não é sequer baixado — o import é dinâmico. A origem do DSN entra em `connect-src`: sem isso a CSP do doc 07 barra o envio e a captura fica silenciosamente morta (medido contra um receptor local).
  - **Falta para o M8:** upload de source map no build. Ele exige `SENTRY_AUTH_TOKEN`, organização e projeto — credenciais que só existem quando a conta for criada na ida para produção — e `pnpm approve-builds` para o `@sentry/cli`. Até lá, o stack trace chega minificado.
- **Auditoria de negócio**: `audit_logs` ([doc 04](04-banco-de-dados.md)) — quem publicou/editou/aprovou o quê, com diff.
- **Uptime**: monitor externo gratuito (UptimeRobot/BetterStack free) em `/` e `/api/v1/jobs?limit=1` — documentado no runbook, fora do código.

## Alertas (MVP, sem infra nova)

- Sentry: erro novo em produção → e-mail.
- Widget "saúde" no topo do dashboard admin com badges vermelhos: falhas de importação > 30% nas últimas 24h · sugestões pendentes > 20 · orçamento IA > 80% · cron de arquivamento sem rodar há > 48h (checa `cron.job_run_details` do pg_cron).
