import { expect, test, type Page } from '@playwright/test'

/**
 * O painel de analytics do doc 09 renderizado de verdade.
 *
 * Existe por um motivo específico: a série temporal é o único gráfico do
 * projeto e o único componente de cliente do painel. `ResponsiveContainer` mede
 * o container antes de desenhar e não desenha nada quando a medida é zero — um
 * teste de unidade com jsdom passaria de qualquer jeito, porque lá nada tem
 * tamanho. Só um navegador de verdade responde se o gráfico apareceu.
 *
 * Os dados vêm do seed (eventos sintéticos já agregados), então as asserções
 * podem ser sobre estrutura e não sobre números que mudam a cada reset.
 */

const ADMIN = { email: 'admin@cfjobs.local', senha: 'cfjobs-local' }

/**
 * Clique fundo na página só no chromium. **Não é o produto:** medido na própria
 * emulação, `document.documentElement.clientWidth` é 412 mas `window.innerWidth`
 * é 949 no projeto `mobile` — o `boundingBox()` sai de um layout e o clique é
 * despachado no outro, então o ponteiro cai em outro elemento quanto mais fundo
 * o alvo está. Com o elemento centrado, `elementFromPoint` no meio dele devolve
 * o próprio elemento: não há sobreposição para corrigir.
 *
 * O que continua rodando no `mobile` são as specs de visibilidade, que é o que
 * interessa ali — se o painel cabe na tela estreita (doc 12).
 */
function apenasChromium() {
  test.skip(
    test.info().project.name !== 'chromium',
    'Clique fundo na página: a emulação mobile despacha o ponteiro em outro layout.',
  )
}

async function entrar(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(ADMIN.email)
  await page.getByLabel('Senha').fill(ADMIN.senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/(admin)?$/)
}

test.describe('painel de analytics', () => {
  test('mostra os quatro badges de saúde', async ({ page }) => {
    await entrar(page)
    await page.goto('/admin')

    const saude = page.getByRole('region', { name: 'Saúde' })

    for (const rotulo of [
      'Importações',
      'Fila de sugestões',
      'Orçamento de IA',
      'Arquivamento automático',
    ]) {
      await expect(saude.getByText(rotulo, { exact: false }).first()).toBeVisible()
    }

    // O estado de cada badge é anunciado por texto, não só por cor.
    await expect(
      saude.getByText(/tudo certo|precisa de atenção|sem dados/).first(),
    ).toBeAttached()
  })

  test('a série temporal desenha o gráfico e a tabela equivalente', async ({ page }) => {
    apenasChromium()
    await entrar(page)
    await page.goto('/admin?periodo=7')

    // O SVG do Recharts só existe se o container foi medido com tamanho.
    const grafico = page.locator('svg.recharts-surface')
    await expect(grafico).toBeVisible()
    await expect(grafico.locator('path.recharts-curve').first()).toBeAttached()

    // Sete dias pedidos, sete linhas na tabela: `generate_series` preenche o
    // dia sem evento em vez de omiti-lo.
    await page.getByText('Ver os números da série').click()
    const tabela = page.getByRole('table', {
      name: /Visualizações e cliques por dia/,
    })
    await expect(tabela.locator('tbody tr')).toHaveCount(7)
  })

  test('o período troca por link e vale para todos os widgets', async ({ page }) => {
    apenasChromium()
    await entrar(page)
    await page.goto('/admin')

    await expect(page.getByText('Últimos 30 dias')).toBeVisible()

    await page.getByRole('link', { name: '90 dias' }).click()

    await expect(page).toHaveURL(/\?periodo=90$/)
    await expect(page.getByText('Últimos 90 dias')).toBeVisible()
    await expect(page.getByRole('link', { name: '90 dias' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('os widgets de produto do doc 09 estão na tela', async ({ page }) => {
    await entrar(page)
    await page.goto('/admin')

    const audiencia = page.getByRole('region', { name: 'Audiência' })

    for (const titulo of [
      'CTR global',
      'Vagas mais vistas',
      'Empresas mais vistas',
      'Tecnologias procuradas',
      'Origem dos visitantes',
      'Tags mais usadas',
    ]) {
      await expect(audiencia.getByText(titulo, { exact: false }).first()).toBeVisible()
    }
  })
})
