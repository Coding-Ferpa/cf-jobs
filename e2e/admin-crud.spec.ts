import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * DoD do M4: spec 6 do doc 12 (autorização por papel) e o caminho que importa
 * de verdade — publicar uma vaga manual e vê-la na home.
 *
 * Depende do Supabase local com o seed aplicado (`pnpm db:start`).
 */

const ADMIN = { email: 'admin@cfjobs.local', senha: 'cfjobs-local' }

async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/(admin)?$/)
}

async function criarConta(page: Page, email: string, senha: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click()
  await expect(page).toHaveURL('/')
}

/**
 * Encerra a sessão pelo cookie. O botão "Sair" mora no admin, e leitor não
 * chega lá — mas o teste precisa trocar de conta do mesmo jeito.
 */
async function encerrarSessao(page: Page) {
  await page.context().clearCookies()
}

test.describe('CRUD de vagas do admin', () => {
  test('publicar vaga manual faz ela aparecer na home', async ({ page }, testInfo) => {
    // Título e URL únicos por execução: o hash da URL de origem é chave única,
    // e os projetos rodam em paralelo.
    const carimbo = `${testInfo.project.name}-${Date.now()}`
    const titulo = `Pessoa Engenheira de Testes ${carimbo}`
    const urlDeOrigem = `https://exemplo.test/vagas/${carimbo}`

    await entrar(page, ADMIN.email, ADMIN.senha)

    await page.goto('/admin/vagas/nova')
    await page.getByLabel('Título').fill(titulo)

    await page.getByRole('combobox', { name: 'Empresa' }).click()
    await page.getByRole('option', { name: 'Aurora Pagamentos' }).click()

    await page.getByLabel('Resumo').fill('Vaga criada pelo teste end-to-end.')
    await page
      .getByLabel('Descrição')
      .fill(
        '## Sobre a vaga\n\nEsta vaga existe para o teste automatizado do CRUD do admin conferir o caminho completo até a home.',
      )
    await page.getByLabel('URL do anúncio original').fill(urlDeOrigem)
    await page.getByLabel('URL de candidatura').fill(`${urlDeOrigem}/candidatar`)

    await page.getByRole('button', { name: 'Criar rascunho' }).click()

    // Criar leva para a edição da vaga recém-criada.
    await expect(page).toHaveURL(/\/admin\/vagas\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(titulo)
    await expect(page.getByText('Rascunho')).toBeVisible()

    const urlDaEdicao = page.url()

    // Rascunho não vai para a área pública.
    await page.goto('/')
    await expect(page.getByRole('link', { name: new RegExp(titulo) })).toHaveCount(0)

    await page.goto(urlDaEdicao)
    await page.getByRole('button', { name: 'Publicar' }).click()
    await expect(page.getByText('Publicada')).toBeVisible()

    // O `revalidateTag('jobs')` da action derruba o cache da listagem.
    await page.goto('/')
    const naHome = page.getByRole('link', { name: new RegExp(titulo) })
    await expect(naHome).toBeVisible()

    await naHome.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(titulo)
    await expect(page.getByRole('link', { name: 'Candidatar-se' })).toBeVisible()

    // Limpeza: só rascunho e rejeitada podem ser excluídos, então volta antes.
    await page.goto(urlDaEdicao)
    await page.getByRole('button', { name: 'Voltar a rascunho' }).click()
    await expect(page.getByText('Rascunho')).toBeVisible()

    await page.getByRole('button', { name: 'Excluir' }).click()
    await page.getByRole('button', { name: 'Excluir', exact: true }).last().click()

    await page.goto('/admin/vagas')
    await page.getByLabel('Buscar por título ou empresa').fill(titulo)
    await expect(page.getByText('Nenhuma vaga com esses filtros.')).toBeVisible()
  })

  test('a mesma URL de origem não entra duas vezes', async ({ page }) => {
    await entrar(page, ADMIN.email, ADMIN.senha)
    await page.goto('/admin/vagas/nova')

    // A URL da vaga de SRE já está no seed, com parâmetro de campanha a mais
    // para conferir que a canonicalização entra na conta.
    await page.getByLabel('Título').fill('Tentativa duplicada')
    await page.getByRole('combobox', { name: 'Empresa' }).click()
    await page.getByRole('option', { name: 'Aurora Pagamentos' }).click()
    await page
      .getByLabel('Descrição')
      .fill(
        'Descrição longa o bastante para passar da validação mínima de cinquenta caracteres.',
      )
    await page
      .getByLabel('URL do anúncio original')
      .fill(
        'https://aurora-pagamentos.exemplo.test/vagas/sre-aurora-pagamentos-f6a7b8?utm_source=teste',
      )
    await page
      .getByLabel('URL de candidatura')
      .fill(
        'https://aurora-pagamentos.exemplo.test/vagas/sre-aurora-pagamentos-f6a7b8/candidatar',
      )

    await page.getByRole('button', { name: 'Criar rascunho' }).click()

    await expect(page.getByText(/já está cadastrada/)).toBeVisible()
    await expect(page).toHaveURL('/admin/vagas/nova')
  })
})

test.describe('autorização por papel', () => {
  test('leitor não alcança a lista de vagas do admin', async ({ page }, testInfo) => {
    const email = `leitor-vagas-${testInfo.project.name}-${Date.now()}@cfjobs.local`
    await criarConta(page, email, 'senha-de-teste')

    await page.goto('/admin/vagas')
    await expect(page).toHaveURL('/')

    await page.goto('/admin/usuarios')
    await expect(page).toHaveURL('/')
  })

  test('moderação vê o painel mas não publica vaga', async ({ page }, testInfo) => {
    const email = `moderacao-${testInfo.project.name}-${Date.now()}@cfjobs.local`
    const senha = 'senha-de-teste'

    await criarConta(page, email, senha)
    await encerrarSessao(page)

    // O papel vive no claim do JWT: promover exige entrar de novo para o token
    // ser emitido com o papel novo.
    await entrar(page, ADMIN.email, ADMIN.senha)
    await page.goto('/admin/usuarios')

    const linha = page.getByRole('row').filter({ hasText: email.split('@')[0] ?? email })
    await linha.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Moderação' }).click()
    await expect(linha.getByRole('combobox')).toContainText('Moderação')

    await encerrarSessao(page)
    await entrar(page, email, senha)

    // Moderação entra no painel…
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible()
    await expect(page.getByText('Seu acesso é de leitura')).toBeVisible()

    // …mas a tela onde se publica é de curadoria para cima.
    await page.goto('/admin/vagas')
    await expect(page).toHaveURL('/')
  })
})

// Spec 7 do doc 12 cobre a área pública; o admin entra aqui pelo mesmo motivo
// — quem cura também navega por teclado e leitor de tela.
test.describe('acessibilidade do admin', () => {
  const telas = [
    { nome: 'painel', url: '/admin' },
    { nome: 'vagas', url: '/admin/vagas' },
    { nome: 'nova vaga', url: '/admin/vagas/nova' },
    { nome: 'empresas', url: '/admin/empresas' },
    { nome: 'taxonomias', url: '/admin/taxonomias/technology' },
    { nome: 'usuários', url: '/admin/usuarios' },
  ]

  for (const tela of telas) {
    test(`sem violações sérias em ${tela.nome}`, async ({ page }) => {
      await entrar(page, ADMIN.email, ADMIN.senha)
      await page.goto(tela.url)

      const resultado = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      const graves = resultado.violations.filter((violacao) =>
        ['serious', 'critical'].includes(violacao.impact ?? ''),
      )

      expect(
        graves.map((v) => `${v.id}: ${v.nodes.length} ocorrência(s)`),
        JSON.stringify(
          graves.map((v) => ({ id: v.id, help: v.help, no: v.nodes[0]?.html })),
          null,
          2,
        ),
      ).toEqual([])
    })
  }
})
