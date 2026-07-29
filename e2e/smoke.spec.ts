import { expect, test } from '@playwright/test'

test.describe('fundação do app', () => {
  test('a homepage responde e exibe o título principal', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { name: 'Vagas de tecnologia, direto ao ponto.' }),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  })

  test('as respostas trazem os cabeçalhos de segurança', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers() ?? {}

    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy']).toContain("default-src 'self'")
  })

  test('o JavaScript da página não é bloqueado pela CSP', async ({ page }) => {
    const violacoes: string[] = []
    page.on('console', (message) => {
      if (message.text().includes('Content Security Policy')) {
        violacoes.push(message.text())
      }
    })

    await page.goto('/')

    // O bootstrap do Next define `__next_f`; sem ele a página não hidrata.
    await expect
      .poll(() => page.evaluate(() => typeof self.__next_f))
      .not.toBe('undefined')
    expect(violacoes).toEqual([])
  })
})

declare global {
  interface Window {
    __next_f?: unknown
  }
}
