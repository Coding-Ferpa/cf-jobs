/**
 * Papéis e hierarquia (doc 07). Espelha a função SQL `authorize(min_role)`:
 * as duas precisam responder igual, porque a UI decide o que mostrar e a RLS
 * decide o que existe.
 *
 * Módulo puro — serve tanto ao servidor quanto a componentes de cliente.
 */

export const USER_ROLES = ['reader', 'moderator', 'editor', 'admin'] as const

export type UserRole = (typeof USER_ROLES)[number]

/** admin ⊃ editor ⊃ moderator ⊃ reader */
const RANK: Record<UserRole, number> = {
  reader: 1,
  moderator: 2,
  editor: 3,
  admin: 4,
}

export function isUserRole(value: unknown): value is UserRole {
  // `in` acharia 'constructor' e companhia na cadeia de protótipos — o que
  // transformaria um claim adulterado em papel válido.
  return typeof value === 'string' && Object.hasOwn(RANK, value)
}

/** Qualquer coisa inesperada vira `reader`: o papel de menor privilégio. */
export function parseUserRole(value: unknown): UserRole {
  return isUserRole(value) ? value : 'reader'
}

export function hasRole(role: UserRole, minimum: UserRole): boolean {
  return RANK[role] >= RANK[minimum]
}

/** Menor papel com acesso de leitura ao admin (doc 07). */
export const MIN_ADMIN_ROLE: UserRole = 'moderator'
