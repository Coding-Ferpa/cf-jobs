import nextPlugin from '@next/eslint-plugin-next'
import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'out/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // `any` desliga a checagem de tipos: só passa com justificativa explícita.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  {
    files: ['**/*.{jsx,tsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },

  // Regras de fronteira entre camadas (doc 02).
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      // A regra do doc 02 é sobre acesso ao banco, não sobre tipos: tipar props
      // com o retorno de uma query é exatamente o fluxo desejado, e
      // `import type` some no build.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/db', '@/db/*', '**/db/queries', '**/db/schema'],
              allowTypeImports: true,
              message:
                'Componentes não acessam o banco: recebam dados por props de Server Components (doc 02).',
            },
          ],
        },
      ],
    },
  },
  // O shadcn/ui (e o Radix junto) é do admin, onde a interatividade justifica o
  // bundle. A área pública roda com HTML nativo e precisa continuar assim para
  // caber no orçamento de JS do doc 12.
  {
    files: ['src/app/(public)/**/*.tsx', 'src/components/jobs/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/components/ui/*', 'radix-ui', 'radix-ui/*', 'lucide-react'],
              message:
                'shadcn/ui e Radix ficam no admin (doc 02): a área pública usa HTML nativo para respeitar o orçamento de JS do doc 12.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['src/features/import/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Use `safeFetch` de @/lib/safe-fetch — é o único caminho permitido para URLs externas (doc 07).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['next', 'next/*'],
              message:
                'O pipeline de importação não conhece o Next.js: mantenha funções puras e testáveis (doc 02).',
            },
          ],
        },
      ],
    },
  },

  // Testes e scripts de build rodam fora do app.
  {
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  prettierConfig,
)
