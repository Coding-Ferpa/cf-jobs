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
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/db', '@/db/*', '**/db/queries', '**/db/schema'],
              message:
                'Componentes não acessam o banco: recebam dados por props de Server Components (doc 02).',
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
