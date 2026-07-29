import { describe, expect, it } from 'vitest'

import { USER_ROLES, type UserRole } from '@/lib/roles'

import { autorizar } from './authorize'

/**
 * Matriz papel × papel mínimo (doc 12). É a checagem que decide se uma
 * moderação consegue publicar vaga — vale ter escrita por extenso, não
 * derivada da mesma tabela que ela testa.
 */

const PERMITIDOS: Record<UserRole, UserRole[]> = {
  reader: ['reader'],
  moderator: ['reader', 'moderator'],
  editor: ['reader', 'moderator', 'editor'],
  admin: ['reader', 'moderator', 'editor', 'admin'],
}

describe('autorizar', () => {
  it('recusa quem não tem sessão, antes de olhar papel', () => {
    const resultado = autorizar(null, 'reader')

    expect(resultado?.ok).toBe(false)
    expect(resultado?.ok === false && resultado.error.code).toBe('unauthorized')
  })

  for (const papel of USER_ROLES) {
    for (const minimo of USER_ROLES) {
      const deveriaPassar = PERMITIDOS[papel].includes(minimo)

      it(`${papel} ${deveriaPassar ? 'passa' : 'não passa'} onde exigem ${minimo}`, () => {
        const resultado = autorizar({ role: papel }, minimo)

        if (deveriaPassar) {
          expect(resultado).toBeNull()
          return
        }

        expect(resultado?.ok).toBe(false)
        expect(resultado?.ok === false && resultado.error.code).toBe('forbidden')
      })
    }
  }

  it('separa sem sessão de sem permissão, para a UI reagir diferente', () => {
    const semSessao = autorizar(null, 'editor')
    const semPermissao = autorizar({ role: 'reader' }, 'editor')

    expect(semSessao?.ok === false && semSessao.error.code).toBe('unauthorized')
    expect(semPermissao?.ok === false && semPermissao.error.code).toBe('forbidden')
  })
})
