import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

/**
 * Copia o bundle da UI Scalar para `public/`, de onde ele é servido pela nossa
 * própria origem.
 *
 * O adaptador do Scalar aponta para um CDN por padrão. Servir o arquivo de
 * casa custa um passo de build e evita duas coisas que o doc 07 não quer:
 * executar código de terceiro carregado em tempo de execução (A08) e abrir a
 * CSP para um host externo. O arquivo é grande e derivado, então fica fora do
 * Git — é o `pnpm dev`/`pnpm build` que o coloca lá.
 */

const require = createRequire(import.meta.url)

// O pacote não exporta `./package.json` nem o bundle de navegador, então o
// caminho sai do entrypoint resolvido — que é `dist/index.js`.
const origem = path.join(
  path.dirname(require.resolve('@scalar/api-reference')),
  'browser',
  'standalone.js',
)

const destino = path.join(process.cwd(), 'public', 'scalar', 'api-reference.js')

mkdirSync(path.dirname(destino), { recursive: true })
copyFileSync(origem, destino)

console.log(`✔ UI do Scalar copiada para ${path.relative(process.cwd(), destino)}`)
