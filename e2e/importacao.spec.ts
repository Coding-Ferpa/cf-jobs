import { expect, test, type Page } from '@playwright/test'

import { plantarConteudoNoCache } from './support/cache-de-importacao'

/**
 * Specs 4 e 5 do doc 12: importar uma vaga com o NIM dublado, revisar,
 * publicar — e resolver a sugestão que a importação deixou na fila.
 *
 * O dublê do NIM é um processo à parte (`e2e/support/nim-stub.ts`), apontado
 * por `AI_BASE_URL`. O conteúdo da vaga é plantado no cache de importação, e
 * não servido por um site local, porque o `safeFetch` recusa endereço privado
 * — enfraquecer essa trava para testá-la seria trocar o que ela protege pelo
 * teste que a testa.
 *
 * Entra como **editor**, e não como admin: é o menor papel que importa (doc
 * 04), e o que o fluxo exige de verdade.
 */

const EDITOR = { email: 'editor@cfjobs.local', senha: 'cfjobs-local' }

// A importação é uma action longa (o pipeline se dá 55s antes de desistir):
// o padrão de 30s do Playwright derrubaria o teste antes do produto.
test.setTimeout(120_000)

/**
 * Em série, e com duas importações para as três specs. O motivo é o throttle
 * de 5 por minuto por pessoa (doc 05): uma spec por importação estouraria o
 * balde e passaria a testar o limite em vez do fluxo.
 */
test.describe.configure({ mode: 'serial' })

async function entrar(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(EDITOR.email)
  await page.getByLabel('Senha').fill(EDITOR.senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/(admin)?$/)
}

/** O dublê ecoa este marcador no título e no termo desconhecido. */
function carimboDe(prefixo: string): string {
  return `${prefixo}-${Date.now()}`.replace(/[^A-Za-z0-9-]/g, '')
}

async function importar(page: Page, carimbo: string) {
  const url = `https://vagas-e2e.test/vagas/${carimbo}`

  await plantarConteudoNoCache({
    url,
    markdown: `# Pessoa Desenvolvedora Backend CFJOBS-E2E-${carimbo}\n\nVaga de exemplo do teste de ponta a ponta, com Go e PostgreSQL.`,
  })

  await page.goto('/admin/vagas/importar')
  await page.getByLabel('Endereço da vaga').fill(url)
  await page.getByRole('button', { name: 'Importar' }).click()
}

const primeira = carimboDe('e2e')
const segunda = carimboDe('e2e-merge')

test.describe('importação por URL', () => {
  test.beforeEach(() => {
    // Só no chromium: o balde de importações é por pessoa, e rodar o mesmo
    // fluxo em dois projetos o esgotaria. O layout do admin em telas pequenas
    // é coberto pelas specs de CRUD.
    test.skip(
      test.info().project.name !== 'chromium',
      'Teto de 5 importações por minuto: um projeto por vez.',
    )
  })

  test('importa, revisa e publica — e a vaga aparece na home', async ({ page }) => {
    await entrar(page)
    await importar(page, primeira)

    // Progresso enquanto a action longa roda.
    await expect(page.getByTestId('import-progresso')).toBeVisible()

    // Termina na tela de revisão, com os campos já preenchidos.
    await expect(page).toHaveURL(/\/admin\/vagas\/[0-9a-f-]{36}\/revisar$/, {
      timeout: 60_000,
    })

    await expect(page.getByRole('heading', { level: 1 })).toContainText(primeira)
    await expect(page.getByText('Em revisão').first()).toBeVisible()

    // O formulário chegou preenchido pela IA.
    await expect(page.getByLabel('Título')).toHaveValue(new RegExp(primeira))
    await expect(page.getByLabel('Cidade')).toHaveValue('Recife')
    await expect(page.getByLabel('Piso')).toHaveValue('12000.00')

    // Painel lateral: origem, uso e a sugestão que o mapeamento não resolveu.
    const painel = page.getByRole('complementary', { name: 'Revisão da importação' })
    await expect(painel.getByRole('link', { name: new RegExp(primeira) })).toBeVisible()
    await expect(painel.getByText(`Datomic ${primeira}`)).toBeVisible()

    // `hybrid` só chega a `hibrido` pelo alias: se o mapeamento tivesse
    // descartado o termo, a modalidade estaria vazia.
    await expect(page.getByRole('combobox', { name: 'Modalidade' })).toContainText(
      'Híbrido',
    )

    await page.getByRole('button', { name: 'Publicar' }).click()
    await expect(page.getByText('Publicada').first()).toBeVisible({ timeout: 15_000 })

    await page.goto(`/?q=${encodeURIComponent(primeira)}`)
    await expect(page.getByRole('heading', { name: new RegExp(primeira) })).toBeVisible()
  })

  test('aprovar sugestão cria a taxonomia e vincula à vaga', async ({ page }) => {
    await entrar(page)
    await page.goto('/admin/taxonomias/sugestoes')

    const sugestao = page
      .getByTestId('sugestao')
      .filter({ hasText: `Datomic ${primeira}` })
    await expect(sugestao).toBeVisible()

    await sugestao.getByRole('button', { name: 'Aprovar' }).click()
    await expect(sugestao).toBeHidden({ timeout: 15_000 })

    // A taxonomia nova existe no CRUD de tecnologias, com o termo original
    // guardado como alias.
    await page.goto('/admin/taxonomias/technology')
    await expect(
      page.getByRole('cell', { name: `Datomic ${primeira}`, exact: true }),
    ).toBeVisible()
  })

  test('mesclar sugestão vira alias da taxonomia escolhida', async ({ page }) => {
    await entrar(page)
    await importar(page, segunda)
    await expect(page).toHaveURL(/\/revisar$/, { timeout: 60_000 })

    await page.goto('/admin/taxonomias/sugestoes')

    const sugestao = page
      .getByTestId('sugestao')
      .filter({ hasText: `Datomic ${segunda}` })
    await expect(sugestao).toBeVisible()

    await sugestao.getByRole('combobox', { name: /^Mesclar Datomic/ }).click()
    await page.getByRole('option', { name: 'PostgreSQL', exact: true }).click()
    await sugestao.getByRole('button', { name: 'Mesclar' }).click()

    await expect(sugestao).toBeHidden({ timeout: 15_000 })

    // O termo virou alias do PostgreSQL: é assim que a próxima importação
    // acerta sozinha, sem passar pela fila.
    await page.goto('/admin/taxonomias/technology')
    await expect(
      page.getByRole('row', { name: /PostgreSQL/ }).getByText(`datomic-${segunda}`, {
        exact: false,
      }),
    ).toBeVisible()
  })
})
