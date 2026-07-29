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

/** Botão de funil e painel de filtros que ele abre (doc 03). */
const botaoDeFiltros = (page: Page) => page.locator('details > summary')
const painelDeFiltros = (page: Page) => page.locator('details > div')
const opcaoDeFiltro = (page: Page, rotulo: string | RegExp) =>
  page.getByRole('checkbox', { name: rotulo })

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

    // Filtrar pelo painel: abre o funil, marca remoto e pleno.
    await page.goto('/')
    await botaoDeFiltros(page).click()
    await opcaoDeFiltro(page, /^Remoto/).check()
    await expect(page).toHaveURL(/work_mode=remoto/)
    await opcaoDeFiltro(page, /^Pleno/).check()
    await expect(page).toHaveURL(/seniority=pleno/)

    // A URL muda antes de a listagem re-renderizar no servidor: esperar a
    // grade encolher é o sinal de que o filtro chegou de fato aos resultados.
    await expect.poll(() => contarCards(page)).toBeLessThan(12)
    expect(await contarCards(page)).toBeGreaterThan(0)

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

  test('o painel abre pelo funil e Esc fecha devolvendo o foco', async ({ page }) => {
    await page.goto('/')

    const botao = botaoDeFiltros(page)
    const painel = painelDeFiltros(page)

    await expect(painel).toBeHidden()
    await botao.click()
    await expect(painel).toBeVisible()
    await expect(painel).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(painel).toBeHidden()
    await expect(botao).toBeFocused()
  })

  test('clicar fora fecha o painel', async ({ page, isMobile }) => {
    // No mobile o painel é de tela cheia: não existe "fora" para clicar, o
    // caminho de saída é o botão Fechar — coberto no teste seguinte.
    test.skip(isMobile, 'o painel ocupa a tela inteira no mobile')

    await page.goto('/')
    await botaoDeFiltros(page).click()
    await expect(painelDeFiltros(page)).toBeVisible()

    await page.getByRole('heading', { level: 1 }).click()
    await expect(painelDeFiltros(page)).toBeHidden()
  })

  test('no mobile o painel cobre a tela e fecha pelos próprios botões', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'o painel só é de tela cheia abaixo de 640px')

    await page.goto('/')
    await botaoDeFiltros(page).click()

    const painel = painelDeFiltros(page)
    await expect(painel).toBeVisible()

    const caixa = await painel.boundingBox()
    const viewport = page.viewportSize()
    expect(caixa?.width).toBe(viewport?.width)

    await page.getByRole('button', { name: 'Ver vagas' }).click()
    await expect(painel).toBeHidden()

    await botaoDeFiltros(page).click()
    await page.getByRole('button', { name: 'Fechar' }).click()
    await expect(painel).toBeHidden()
  })

  test('o badge do funil conta os filtros aplicados', async ({ page }) => {
    await page.goto('/')
    const botao = botaoDeFiltros(page)
    await expect(botao).toHaveText('Filtros')

    await page.goto('/?tech=react,typescript&work_mode=remoto')
    await expect(botao).toContainText('3')
    // O que está aplicado aparece fora do painel, sem precisar abri-lo.
    await expect(painelDeFiltros(page)).toBeHidden()
    await expect(page.getByRole('button', { name: /remover filtro/ })).toHaveCount(3)

    await page.getByRole('button', { name: 'Limpar tudo' }).click()
    await expect(botao).toHaveText('Filtros')
    await expect(page.getByRole('button', { name: /remover filtro/ })).toHaveCount(0)
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

  // O Next transmite a metadata por padrão e, quando a página renderiza
  // rápido, as tags saem depois do </head> — canonical no <body> é ignorado
  // pelo rastreador. Ver docs/adr/0013.
  for (const caminho of ['/', '/?tech=react', `/vagas/${VAGA_PUBLICADA}`]) {
    test(`a metadata de ${caminho} vem dentro do <head>`, async ({ request }) => {
      const html = await (await request.get(caminho)).text()
      const head = html.slice(0, html.indexOf('</head>'))

      expect(head).toContain('<title>')
      expect(head).toContain('name="description"')
      expect(head).toContain('rel="canonical"')
      expect(head).toContain('property="og:title"')
    })
  }

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
  async function violacoesGraves(page: Page) {
    const resultado = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    return resultado.violations.filter((violacao) =>
      ['serious', 'critical'].includes(violacao.impact ?? ''),
    )
  }

  const detalhar = (graves: Awaited<ReturnType<typeof violacoesGraves>>) => ({
    resumo: graves.map((v) => `${v.id}: ${v.nodes.length} ocorrência(s)`),
    contexto: JSON.stringify(
      graves.map((v) => ({ id: v.id, help: v.help })),
      null,
      2,
    ),
  })

  const paginas = [
    { nome: 'home', url: '/' },
    { nome: 'vaga', url: `/vagas/${VAGA_PUBLICADA}` },
    { nome: 'login', url: '/login' },
  ]

  for (const pagina of paginas) {
    test(`sem violações sérias em ${pagina.nome}`, async ({ page }) => {
      await page.goto(pagina.url)

      const { resumo, contexto } = detalhar(await violacoesGraves(page))
      expect(resumo, contexto).toEqual([])
    })
  }

  // O conteúdo de um <details> fechado sai da árvore de acessibilidade: sem
  // abrir o painel, o axe nunca veria os grupos de filtro.
  test('sem violações sérias com o painel de filtros aberto', async ({ page }) => {
    await page.goto('/')
    await botaoDeFiltros(page).click()
    await expect(painelDeFiltros(page)).toBeVisible()

    const { resumo, contexto } = detalhar(await violacoesGraves(page))
    expect(resumo, contexto).toEqual([])
  })
})
