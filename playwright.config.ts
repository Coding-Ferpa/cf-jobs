import { existsSync } from 'node:fs'

import { defineConfig, devices } from '@playwright/test'

// O Next carrega o `.env` sozinho; o runner do Playwright não. A spec de
// importação precisa dele para plantar conteúdo no cache pelo banco.
if (existsSync('.env')) process.loadEnvFile('.env')

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const portaDoDuble = Number(process.env.NIM_STUB_PORT ?? 4599)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Viewports do doc 12; navegadores extras rodam semanalmente, fora do PR.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // Dublê do NIM (spec 4 do doc 12). Sobe antes do app porque o app lê
      // `AI_BASE_URL` no primeiro uso — e porque uma importação que encontrasse
      // a porta fechada falharia por rede, não por regra de negócio.
      command: 'tsx e2e/support/nim-stub.ts',
      url: `http://127.0.0.1:${portaDoDuble}/v1/chat/completions`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
    },
    {
      command: 'pnpm build && pnpm start',
      url: baseURL,
      // Nunca reaproveita: um servidor já de pé não teria o `AI_BASE_URL` do
      // dublê, e a importação sairia chamando o NIM de verdade.
      reuseExistingServer: false,
      timeout: 180_000,
      // O pipeline loga cada falha de importação; sem isso, um E2E que trava
      // na barra de progresso não diz por quê.
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        AI_BASE_URL: `http://127.0.0.1:${portaDoDuble}/v1`,
        // O cliente exige chave; o dublê não confere nenhuma.
        NVIDIA_API_KEY: 'chave-do-duble-e2e',
        NVIDIA_API_KEY_FALLBACK: '',
      },
    },
  ],
})
