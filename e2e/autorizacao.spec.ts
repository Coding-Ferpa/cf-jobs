import { expect, test, type Page } from '@playwright/test'

/**
 * Spec 6 do doc 12: quem não tem papel suficiente não entra no admin.
 * Depende do Supabase local com o seed aplicado (`pnpm db:start`).
 */

const ADMIN = { email: 'admin@cfjobs.local', senha: 'cfjobs-local' }

async function entrar(
  page: Page,
  email: string,
  senha: string,
  acao: 'Entrar' | 'Criar conta' = 'Entrar',
) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: acao, exact: true }).click()
}

test.describe('autorização do admin', () => {
  test('visitante sem sessão é levado ao login', async ({ page }) => {
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/login\?proximo=%2Fadmin/)
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  })

  test('admin entra e alcança o painel', async ({ page }) => {
    await entrar(page, ADMIN.email, ADMIN.senha)

    await expect(page).toHaveURL('/admin')
    await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible()
    await expect(page.getByText(ADMIN.email)).toBeVisible()
  })

  test('conta nova nasce leitora e não alcança o painel', async ({ page }, testInfo) => {
    // E-mail único por execução e por projeto: os testes rodam em paralelo.
    const email = `leitor-${testInfo.project.name}-${Date.now()}@cfjobs.local`
    await entrar(page, email, 'senha-de-teste', 'Criar conta')

    // Cadastro leva para a área pública, não para o admin.
    await expect(page).toHaveURL('/')

    await page.goto('/admin')

    // Tem sessão, então não volta para o login — o guard de papel manda para casa.
    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', { name: 'Vagas de tecnologia, direto ao ponto.' }),
    ).toBeVisible()
  })

  test('sair encerra a sessão', async ({ page }) => {
    await entrar(page, ADMIN.email, ADMIN.senha)
    await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible()

    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL('/')

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('sem credenciais de OAuth o login não oferece o GitHub', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('button', { name: /GitHub/ })).toHaveCount(0)
  })

  test('credenciais erradas mostram mensagem sem revelar se o e-mail existe', async ({
    page,
  }) => {
    await entrar(page, ADMIN.email, 'senha-errada-mesmo')

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })
})
