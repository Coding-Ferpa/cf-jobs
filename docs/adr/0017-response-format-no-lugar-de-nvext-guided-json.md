# ADR-0017 — `response_format: json_schema` no lugar de `nvext.guided_json`

- **Status:** aceita
- **Data:** 2026-07-29
- **Autores:** verificação com chaves reais do M6 (sub-passo j)

## Contexto

O [doc 05](../05-pipeline-ia.md) especifica que a chamada ao NIM restringe o decoding ao schema por **`nvext.guided_json`**, com a ressalva de que "o suporte varia por modelo: verificar empiricamente por modelo na primeira chamada real e registrar a flag; sem suporte → JSON mode simples + Zod".

A verificação empírica foi feita, com as chaves de produção, contra os três modelos da cascata. O resultado não é "varia por modelo": o campo **não existe** no endpoint.

```
FALHA z-ai/glm-5.2        nvext.guided_json  400  "Failed to deserialize the JSON body into the
                                                   target type: nvext.guided_json: unknown field
                                                   `guided_json`, expected one of `greed_sampling`,
                                                   `use_raw_prompt`, `annotations`, ..."
FALHA minimaxai/minimax-m3 nvext.guided_json 400  (mesma mensagem)
FALHA moonshotai/kimi-k2.6 (qualquer chamada) 404 Function não disponível para a conta
```

`nvext` continua sendo aceito como objeto — o que sumiu foi `guided_json` da lista de subcampos. A alternativa padrão da API OpenAI funciona nos dois modelos disponíveis:

```
OK z-ai/glm-5.2         response_format json_schema  44,0s  → JSON no formato do schema
OK minimaxai/minimax-m3 response_format json_schema  23,3s  → JSON no formato do schema
OK z-ai/glm-5.2         response_format json_object  38,8s  → {"vaga":{"titulo":...}}  (fora do schema)
OK minimaxai/minimax-m3 response_format json_object  16,5s  → {"cargo":...}            (fora do schema)
```

O `json_object` sozinho não serve: o modelo devolve JSON válido com **nomes de campo inventados**, que o Zod recusa e que custa a chamada de reparo. O `json_schema` devolve o formato certo — que é exatamente o efeito que o doc 05 queria do `guided_json`.

## Decisão

A restrição de decoding passa a ser enviada como `response_format: { type: 'json_schema', json_schema: { name, schema } }`, no corpo da requisição, pelo mesmo `providerOptions` que levava o `nvext`.

Tudo o mais do doc 05 continua valendo, e é o que faz esta troca ser segura:

- **A verificação empírica por modelo continua**, com a mesma flag em memória. Só mudou o recurso testado: agora é o `response_format`, não o `nvext.guided_json`.
- **A cascata de fallback continua**: modelo que recusa o `response_format` é chamado sem ele, e quem garante o formato é o Zod, com a chamada de reparo do doc 05.
- O JSON Schema continua saindo do Zod por `z.toJSONSchema()` — a fonte de verdade não muda.

## Consequências

- O doc 05 precisa trocar a linha da tabela de configuração da chamada. A intenção da linha permanece intacta; o nome do recurso é que envelheceu.
- **Fora do escopo desta ADR, e decisão do mantenedor:** `moonshotai/kimi-k2.6` responde 404 para esta conta. A cascata funciona com dois modelos, mas o segundo degrau está morto — vale trocar `AI_MODEL_SECONDARY` por um modelo habilitado.
- Também medido: mesmo com o `response_format` aceito, uma resposta leva de 23s a 44s. O orçamento de 55s do pipeline cabe **uma** chamada boa mais a descoberta; a cascata inteira não cabe. É o que motivou o corte de timeout por chamada em `nim.ts` — a falha vira retomável antes dos 55s, em vez de estourar a função.

## O que a verificação de ponta a ponta mediu

Uma vaga pública real de cada ATS, pelo mesmo `executarPipeline` do admin, com `minimaxai/minimax-m3` como primário:

| ATS | Vaga | Tokens in/out | Latência do pipeline | Confiança |
|---|---|---|---|---|
| Gupy | Gaudium — Desenvolvedor Backend | 3 219 / 226 | **28,7s** | 0,62 |
| Lever | CI&T — Senior Software Developer | 3 698 / 195 | 107,6s | 0,82 |
| Greenhouse | GitLab — Account Executive | 4 505 / 178 | 122,2s | 0,55 |
| Ashby | Ashby — Engineering Manager EU | 6 224 / 224 | 128,9s | 0,85 |

As quatro criaram vaga em `pending_review`, com empresa nova, junções e sugestões — nenhuma publicada. Repetir a Gupy caiu no dedup por `source_url_hash`, como esperado.

A latência **não** acompanha o tamanho do prompt: a Gupy respondeu em 28,7s com 3,2k tokens, e a Lever levou 107s com 3,7k. As três lentas são a mesma história — 45s de timeout no primeiro modelo, 45s no segundo, e o terceiro respondendo em ~17s. O tier gratuito do NIM enfileira, e a espera é imprevisível.

**Consequência para o doc 02:** a decisão de importar de forma síncrona ("cabe no `maxDuration: 60` de uma função Vercel") não se sustenta com estes modelos e este tier. Com 55s de orçamento, só a Gupy teria passado de primeira; as outras três dependeriam do "Tentar novamente", que retoma do cache mas continua sujeito à mesma loteria. As saídas são do mantenedor: modelo mais rápido, tier pago, prompt menor que os 20 000 caracteres do doc 05, ou antecipar a fila da Fase 2.
