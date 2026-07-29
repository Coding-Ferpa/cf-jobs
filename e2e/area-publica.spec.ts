import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Specs 1, 2, 3, 7 e 8 do doc 12. Dependem do Supabase local com o seed
 * aplicado (`pnpm db:start`).
 */

const VAGA_PUBLICADA = 'sre-aurora-pagamentos-f6a7b8'
const VAGA_ARQUIVADA = 'suporte-tecnico-bandeira-games-c5d6e7'

async function contarCards(page: Page) {
  return page.locator('a[href^="/vagas/"]').count()
}

test.describe('busca e filtros', () => {
  test('visitante busca, filtra, abre a vaga e se candidata', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Vagas de tecnologia',
    )
    expect(await contarCards(page)).toBeGreaterThan(5)

    // Busca textual (o input tem debounce de 300ms).
    await page.getByLabel('Buscar vagas').fill('react')
    await expect(page).toHaveURL(/q=react/, { timeout: 5000 })
    await expect(page.getByRole('link', { name: /Frontend/ })).toBeVisible()

    // Filtrar estreita e some com o resultado anterior.
    await page.goto('/?work_mode=remoto&seniority=pleno')
    const filtradas = await contarCards(page)
    expect(filtradas).toBeGreaterThan(0)
    expect(filtradas).toBeLessThan(12)

    await page.goto(`/vagas/${VAGA_PUBLICADA}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Site Reliability Engineering',
    )

    // O beacon de visualização sai sozinho; o clique abre em nova aba.
    const candidatar = page.getByRole('link', { name: 'Candidatar-se' })
    await expect(candidatar).toHaveAttribute('target', '_blank')
    await expect(candidatar).toHaveAttribute('rel', /noopener/)

    // O domínio da vaga é fictício e não resolve: interceptar mantém o teste
    // offline e determinístico, sem deixar de exercitar a navegação real.
    await context.route('https://*.exemplo.test/**', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<h1>Candidatura</h1>',
      }),
    )

    const [novaAba] = await Promise.all([
      context.waitForEvent('page'),
      candidatar.click(),
    ])
    await novaAba.waitForLoadState()
    expect(novaAba.url()).toContain('candidatar')
    await novaAba.close()
  })

  test('o beacon registra a visualização', async ({ page }) => {
    const eventos: string[] = []
    page.on('request', (requisicao) => {
      if (requisicao.url().includes('/api/v1/events')) eventos.push(requisicao.method())
    })

    await page.goto(`/vagas/${VAGA_PUBLICADA}`)
    await expect.poll(() => eventos.length, { timeout: 5000 }).toBeGreaterThan(0)
    expect(eventos[0]).toBe('POST')
  })

  test('filtro sem resultado mostra o estado vazio', async ({ page }) => {
    await page.goto('/?q=engenharia-de-foguetes-espaciais')

    await expect(page.getByText('Nenhuma vaga por aqui… ainda.')).toBeVisible()
    expect(await contarCards(page)).toBe(0)
  })
})

test.describe('compartilhamento', () => {
  test('a página compartilhada abre com as tags de Open Graph', async ({ page }) => {
    await page.goto(`/vagas/${VAGA_PUBLICADA}`)

    const ogTitle = page.locator('meta[property="og:title"]')
    await expect(ogTitle).toHaveAttribute('content', /Site Reliability Engineering/)
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`/vagas/${VAGA_PUBLICADA}$`),
    )

    // Os canais de compartilhamento carregam a origem para o analytics — a URL
    // da vaga vai percent-encoded dentro do parâmetro do WhatsApp.
    const whatsapp = page.getByRole('link', { name: 'WhatsApp' })
    const href = await whatsapp.getAttribute('href')
    expect(decodeURIComponent(href ?? '')).toContain('utm_source=share_whatsapp')
  })
})

test.describe('vaga arquivada', () => {
  test('continua acessível por URL, com aviso e sem CTA', async ({ page }) => {
    await page.goto(`/vagas/${VAGA_ARQUIVADA}`)

    await expect(page.getByText(/Esta vaga expirou/)).toBeVisible()
    await expect(page.getByText('Candidaturas encerradas')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Candidatar-se' })).toHaveCount(0)
  })

  test('fica fora da listagem padrão e aparece com o filtro', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(`a[href="/vagas/${VAGA_ARQUIVADA}"]`)).toHaveCount(0)

    await page.goto('/?status=archived')
    await expect(page.locator(`a[href="/vagas/${VAGA_ARQUIVADA}"]`)).toHaveCount(1)
  })
})

test.describe('SEO', () => {
  test('a vaga publica JSON-LD válido de JobPosting', async ({ page }) => {
    await page.goto(`/vagas/${VAGA_PUBLICADA}`)

    const blocos = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents()
    const dados = blocos.map((bloco) => JSON.parse(bloco))

    const vaga = dados.find((item) => item['@type'] === 'JobPosting')
    expect(vaga).toBeDefined()
    for (const campo of ['title', 'description', 'datePosted', 'hiringOrganization']) {
      expect(vaga[campo]).toBeTruthy()
    }
    expect(vaga.validThrough).toBeTruthy()
    expect(vaga.directApply).toBe(false)

    const trilha = dados.find((item) => item['@type'] === 'BreadcrumbList')
    expect(trilha.itemListElement).toHaveLength(3)
  })

  test('o sitemap inclui publicada e exclui arquivada', async ({ request }) => {
    const resposta = await request.get('/sitemap.xml')
    expect(resposta.status()).toBe(200)

    const xml = await resposta.text()
    expect(xml).toContain(`/vagas/${VAGA_PUBLICADA}`)
    expect(xml).not.toContain(`/vagas/${VAGA_ARQUIVADA}`)
  })

  test('o robots.txt bloqueia admin e aponta o sitemap', async ({ request }) => {
    const resposta = await request.get('/robots.txt')
    const texto = await resposta.text()

    expect(texto).toContain('Disallow: /admin')
    expect(texto).toContain('Sitemap:')
  })
})

test.describe('acessibilidade', () => {
  const paginas = [
    { nome: 'home', url: '/' },
    { nome: 'vaga', url: `/vagas/${VAGA_PUBLICADA}` },
    { nome: 'login', url: '/login' },
  ]

  for (const pagina of paginas) {
    test(`sem violações sérias em ${pagina.nome}`, async ({ page }) => {
      await page.goto(pagina.url)

      const resultado = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      const graves = resultado.violations.filter((violacao) =>
        ['serious', 'critical'].includes(violacao.impact ?? ''),
      )

      expect(
        graves.map((v) => `${v.id}: ${v.nodes.length} ocorrência(s)`),
        JSON.stringify(
          graves.map((v) => ({ id: v.id, help: v.help })),
          null,
          2,
        ),
      ).toEqual([])
    })
  }
})
