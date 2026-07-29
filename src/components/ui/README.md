# Componentes do shadcn/ui

Gerados pela CLI (`npx shadcn@latest add <componente>`) e **editáveis** — é o
modelo do shadcn/ui: o código é seu, não uma dependência. A configuração está
em `components.json`.

## Onde podem ser usados

Apenas no **admin** (`src/app/admin/**` e `src/components/admin/**`). A área
pública é construída com HTML nativo para caber no orçamento de JS do
[doc 12](../../../docs/12-qualidade.md); uma regra do ESLint bloqueia o import
de `@/components/ui/*`, `radix-ui` e `lucide-react` fora do admin.

## Edições locais sobre o que a CLI gera

Ao regerar um componente (`--overwrite`), reaplique:

1. **`bg-primary` → `bg-primary-solid` em superfícies preenchidas** (Button,
   Badge, Checkbox marcado, seleção de texto). O `--primary` do
   [doc 03](../../../docs/03-design-system.md) é acento e rende ~4,2:1 com
   texto branco; `--primary-solid` rende 5,7:1 e é o token que o doc manda usar
   em controle preenchido. Bordas e anel de foco continuam em `--primary`.
2. Nada mais. Os apelidos de token que o shadcn espera (`--ring`, `--input`,
   `--popover`…) são declarados em `src/app/globals.css` apontando para os
   tokens do doc 03, e a variante `dark:` é redefinida ali para seguir o
   `data-theme` em vez do `prefers-color-scheme`.
