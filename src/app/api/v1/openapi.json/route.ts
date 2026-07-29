import { CACHE_DE_TAXONOMIAS, respostaDePreflight, respostaJson } from '@/lib/api/http'
import { documentoOpenApi } from '@/lib/api/openapi'
import { clientEnv } from '@/lib/env'

/**
 * `GET /api/v1/openapi.json` — o contrato da API v1 (doc 06).
 *
 * Sem rate limit: é um documento estático que a própria UI de `/api/v1/docs`
 * busca ao abrir, e limitá-lo faria a documentação falhar justamente para quem
 * está lendo várias páginas dela.
 */

export function GET() {
  return respostaJson(documentoOpenApi(clientEnv().NEXT_PUBLIC_SITE_URL), {
    cache: CACHE_DE_TAXONOMIAS,
  })
}

export function OPTIONS() {
  return respostaDePreflight()
}
