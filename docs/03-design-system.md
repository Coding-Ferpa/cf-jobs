# 03 — Identidade Visual e Design System

## Fonte da identidade

Análise realizada diretamente no https://codingferpa.org/ (computed styles + variáveis CSS do `:root`, em 2026-07-28). O site oficial usa **tema escuro com acento violeta, tipografia Poppins e JetBrains Mono para código**. O CF Jobs **se inspira** nesses tokens para pertencer visualmente à comunidade, mas define sua própria hierarquia e componentes — não é uma cópia.

## Tokens extraídos do site oficial (referência canônica)

```css
/* Valores reais capturados do :root de codingferpa.org */
--color-bg-primary: #0d0d0d;      --color-bg-elevated: #161616;
--color-bg-surface: #1e1e1e;      --color-border: #262626;
--color-accent: #8b5cf6;          --color-accent-secondary: #a855f7;
--color-accent-muted: #c4b5fd;    --color-success: #22c55e;
--color-text-primary: #f5f5f5;    --color-text-secondary: #a3a3a3;
--color-text-muted: #737373;
--font-heading/body: Poppins;     mono: JetBrains Mono;
--radius-sm: .5rem; --radius-md: .75rem; --radius-lg: 1rem; --radius-full: 9999px;
--shadow-glow: 0 0 20px rgba(139,92,246,.4);
--container-max: 96rem; --header-height: 4.5rem;
/* Escala tipográfica: h1 3rem/1.1 · h2 2.25rem/1.2 · h3 1.5rem/1.3 · body 1.125rem/1.7 · caption .875rem/1.5 */
/* Espaçamento: .5 / 1 / 1.5 / 2 / 3 / 4 / 6 rem · Transições: 150ms/250ms ease */
```

Observações de linguagem visual do site: botões **pill** (radius full, peso 600, padding generoso ~10px 48px), cards em `bg-elevated` com borda `#262626`, glow violeta como destaque de marca, tom acolhedor ("Participe", "Além do código").

## Paleta do CF Jobs

O CF Jobs adota a paleta da comunidade e **acrescenta** o que um job board precisa (estados semânticos e um tema claro):

| Token | Dark (padrão) | Light | Uso |
|---|---|---|---|
| `background` | `#0d0d0d` | `#fafafa` | Fundo da página |
| `card` / `elevated` | `#161616` | `#ffffff` | Cards de vaga, painéis |
| `surface` | `#1e1e1e` | `#f4f4f5` | Inputs, chips, hover |
| `border` | `#262626` | `#e4e4e7` | Bordas e divisores |
| `primary` | `#8b5cf6` | `#7c3aed` | CTAs, links, foco, marca |
| `primary-muted` | `#c4b5fd` | `#a78bfa` | Hovers suaves, ícones ativos |
| `foreground` | `#f5f5f5` | `#18181b` | Texto principal |
| `muted-foreground` | `#a3a3a3` | `#52525b` | Texto secundário |
| `subtle-foreground` | `#737373` | `#71717a` | Metadados, timestamps |
| `success` | `#22c55e` | `#16a34a` | Vaga ativa, importação OK |
| `warning` | `#eab308` | `#ca8a04` | Pendente de revisão |
| `destructive` | `#ef4444` | `#dc2626` | Falhas, arquivada, remover |

- **Dark é o tema padrão** (identidade da comunidade); tema claro disponível via toggle (`prefers-color-scheme` respeitado, persistido em cookie para evitar flash).
- Contraste verificado: todos os pares texto/fundo acima atendem WCAG AA (≥ 4.5:1 para texto normal). `#737373` sobre `#0d0d0d` só é permitido em texto ≥ 18px ou bold (AA large).
- Implementação: tokens no `@theme` do Tailwind v4 mapeados para as variáveis padrão do shadcn/ui (`--background`, `--primary`...), de modo que componentes shadcn herdem a identidade sem retoque.

## Tipografia

| Papel | Fonte | Notas |
|---|---|---|
| Títulos e corpo | **Poppins** (`next/font/google`, subset latin, pesos 400/500/600/700) | Igual ao site da comunidade |
| Código/tecnologias | **JetBrains Mono** (400/500) | Chips de tecnologia e trechos técnicos usam mono — assinatura visual "dev" da marca |

Escala (herdada do site): display 3rem/1.1 (hero), h2 2.25rem/1.2, h3 1.5rem/1.3, corpo 1.125rem/1.7, caption 0.875rem/1.5. No mobile o display cai para 2.25rem.

## Componentes-chave (especificação de UX)

### JobCard (peça central da homepage)
- Container `card` com borda `border`, radius `--radius-md` (0.75rem), hover: borda `primary` + `shadow-glow` sutil + `translateY(-2px)` em 150ms — o glow violeta é o momento de marca.
- Anatomia (topo → base): **empresa** (logo 32px ou avatar de iniciais + nome em `muted-foreground`) · **título da vaga** (h3, 2 linhas máx, ellipsis) · linha de metadados com ícones (📍 localização ou "Remoto", senioridade, tipo de contratação) · **chips de tecnologia** (máx 4 + "+N", JetBrains Mono 12px, fundo `surface`, radius full) · rodapé: data relativa ("há 3 dias") + faixa salarial quando existir (em `success`, destaque discreto).
- Badge de status apenas quando não-padrão: "Encerra em 2 dias" (warning, quando `expires_at` < 3 dias), "Arquivada" (neutral).
- Card inteiro é um link (`<a>` único envolvendo, sem links aninhados); alvo de toque ≥ 44px.

### Filtros
- Desktop: sidebar fixa à esquerda (280px) com grupos colapsáveis (Tecnologia, Cargo, Senioridade, Modalidade, Contratação, Localização, Empresa, Tags, Status). Checkboxes com contagem por opção (facet counts).
- Mobile: botão "Filtrar (n)" abre `Sheet` (bottom drawer). Chips dos filtros ativos sempre visíveis acima da lista, removíveis individualmente + "Limpar tudo".
- Busca textual: input hero no topo com ícone, placeholder "Busque por cargo, tecnologia ou empresa…", debounce 300ms, atualiza a URL.

### Página da vaga
- Breadcrumb `Início / Vagas / {Título}`.
- Header: título h1, empresa com link, metadados em chips, CTA primário **"Candidatar-se"** (pill violeta, abre `apply_url` em nova aba com `rel="noopener nofollow"`) fixo em barra inferior no mobile.
- Corpo: descrição em Markdown renderizado com estilos de prosa (títulos, listas, código em JetBrains Mono).
- Sidebar (desktop): resumo estruturado (salário, modalidade, senioridade, contratação, publicada em, expira em, fonte) + botões de compartilhar (WhatsApp, LinkedIn, X, copiar link) + "vagas semelhantes" (mesma role/tech, 3 itens).
- Vaga arquivada: banner amarelo no topo "Esta vaga expirou em {data}", CTA desabilitado com link "ver vagas semelhantes".

### Botões
- Primário: pill (`radius-full`), fundo `primary`, texto branco, peso 600 — espelha o "Participe" do site.
- Secundário: outline com borda `border`, hover borda `primary-muted`.
- Foco: anel de 2px `primary` com offset — sempre visível (a11y).

### Admin
- Mesmo design system, densidade maior (tabelas compactas, radius `sm`), sem hero. Sidebar de navegação fixa. Gráficos com paleta derivada do violeta (ver [doc 09](09-analytics-observabilidade.md)).

## Voz e microcopy

Tom da comunidade: acolhedor, direto, sem corporativês. Exemplos canônicos:
- Empty state da busca: "Nenhuma vaga por aqui… ainda. Tente remover alguns filtros."
- Hero: "Vagas de tecnologia, direto ao ponto." + subtítulo "Curadas pela comunidade Coding Ferpa."
- Erros: linguagem humana ("Não conseguimos acessar essa URL. Verifique o link ou tente de novo em instantes.").

## Regras de uso

1. O glow violeta (`shadow-glow`) é reservado a: hover de JobCard, CTA primário do hero e estados de sucesso de importação. Não usar em tudo — é o tempero, não o prato.
2. Nunca introduzir cor fora dos tokens; novas cores exigem PR no design system com verificação de contraste.
3. Logos de empresas aparecem em container neutro (`surface`) para não brigar com o tema escuro.
4. Motion: transições 150–250ms ease; respeitar `prefers-reduced-motion` (desligar glow animado e translate).
