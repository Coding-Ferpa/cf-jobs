import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Cobertura é exigida onde mora a lógica (doc 12); UI e rotas são cobertas por E2E.
      include: ['src/features/**', 'src/lib/**'],
      // Encanamento de sessão: são fábricas em volta de `@supabase/ssr` e
      // `next/headers`, sem decisão própria — testá-las seria testar o mock.
      // Quem cobre esse caminho é o E2E de autorização (spec 6 do doc 12).
      exclude: ['src/lib/supabase/**', 'src/lib/auth.ts'],
      thresholds: {
        'src/features/**': { lines: 80, branches: 80 },
        'src/lib/**': { lines: 80, branches: 80 },
      },
    },
  },
})
