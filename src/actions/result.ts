/**
 * Retorno padrão das Server Actions (doc 06). Actions nunca lançam exceção para
 * o cliente: erro é dado, com código do catálogo e mensagem já em pt-BR.
 */

export type ActionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'duplicate_job'
  | 'fetch_failed'
  | 'page_requires_js'
  | 'ai_failed'
  | 'ai_low_confidence'
  | 'rate_limited'
  | 'budget_exceeded'

export type ActionError = {
  code: ActionErrorCode
  message: string
  /** Erros por campo do formulário, no formato que o Zod devolve. */
  fieldErrors?: Record<string, string[]>
}

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: ActionError }

export function actionOk(): ActionResult
export function actionOk<T>(data: T): ActionResult<T>
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data }
}

export function actionError(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error: { code, message, fieldErrors } }
}
