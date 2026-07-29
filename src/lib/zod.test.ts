import { z } from '@/lib/zod'
import { describe, expect, it } from 'vitest'

/**
 * O locale é aplicado pelo setup do Vitest, como o app faz no bootstrap. Estes
 * testes cobrem justamente as validações que ninguém escreve mensagem: são
 * elas que vazavam inglês para a tela.
 */

const EM_INGLES = /expected|invalid|too big|too small|required/i

describe('locale pt-BR global do Zod', () => {
  it('traduz faixa numérica — o caso do campo de ordenação do admin', () => {
    const resultado = z.coerce.number().int().min(0).max(100).safeParse(999)

    expect(resultado.success).toBe(false)
    if (resultado.success) return
    expect(resultado.error.issues[0]?.message).not.toMatch(EM_INGLES)
    expect(resultado.error.issues[0]?.message).toContain('Muito grande')
  })

  it('traduz uuid e url, que aparecem sem mensagem em vários schemas', () => {
    expect(z.uuid().safeParse('x').error?.issues[0]?.message).not.toMatch(EM_INGLES)
    expect(z.url().safeParse('x').error?.issues[0]?.message).not.toMatch(EM_INGLES)
  })

  it('traduz campo obrigatório ausente', () => {
    const resultado = z.object({ nome: z.string() }).safeParse({})

    expect(resultado.error?.issues[0]?.message).not.toMatch(EM_INGLES)
  })

  it('não atropela mensagem escrita à mão', () => {
    const schema = z.string().min(3, 'O título precisa de pelo menos 3 caracteres.')

    expect(schema.safeParse('ab').error?.issues[0]?.message).toBe(
      'O título precisa de pelo menos 3 caracteres.',
    )
  })
})
