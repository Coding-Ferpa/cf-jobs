/**
 * Problem Details (RFC 9457) — o formato único de erro da API v1 (doc 06).
 *
 * `type` fica em `about:blank`: a RFC reserva esse valor para quando o erro não
 * tem semântica além do próprio status, que é o caso de uma API de leitura —
 * quem integra distingue pelo status HTTP. Apontar para uma URL de catálogo que
 * ainda não existe seria pior que não apontar.
 *
 * `title` e `detail` vão em pt-BR, como o resto do produto.
 */

export type ProblemDetails = {
  type: string
  title: string
  status: number
  detail: string
  instance: string
}

export const TIPO_DE_CONTEUDO = 'application/problem+json'

const TIPO = 'about:blank'

export function problema(entrada: {
  status: number
  titulo: string
  detalhe: string
  instancia: string
  cabecalhos?: Record<string, string>
}): Response {
  const corpo: ProblemDetails = {
    type: TIPO,
    title: entrada.titulo,
    status: entrada.status,
    detail: entrada.detalhe,
    instance: entrada.instancia,
  }

  return new Response(JSON.stringify(corpo), {
    status: entrada.status,
    headers: { 'content-type': TIPO_DE_CONTEUDO, ...entrada.cabecalhos },
  })
}

export function entradaInvalida(instancia: string, detalhe: string): Response {
  return problema({ status: 400, titulo: 'Requisição inválida', detalhe, instancia })
}

export function naoAutorizado(instancia: string): Response {
  return problema({
    status: 401,
    titulo: 'Não autorizado',
    detalhe: 'Credencial ausente ou inválida.',
    instancia,
  })
}

export function proibido(instancia: string, detalhe: string): Response {
  return problema({ status: 403, titulo: 'Proibido', detalhe, instancia })
}

export function naoEncontrado(instancia: string, detalhe: string): Response {
  return problema({ status: 404, titulo: 'Não encontrado', detalhe, instancia })
}

export function limiteExcedido(
  instancia: string,
  cabecalhos: Record<string, string>,
): Response {
  return problema({
    status: 429,
    titulo: 'Muitas requisições',
    detalhe: 'Você passou do limite de requisições. Aguarde e tente de novo.',
    instancia,
    cabecalhos,
  })
}

export function erroInterno(instancia: string): Response {
  return problema({
    status: 500,
    titulo: 'Erro interno',
    detalhe: 'Algo falhou do nosso lado. Tente de novo em instantes.',
    instancia,
  })
}

export function indisponivel(instancia: string, detalhe: string): Response {
  return problema({ status: 503, titulo: 'Serviço indisponível', detalhe, instancia })
}
