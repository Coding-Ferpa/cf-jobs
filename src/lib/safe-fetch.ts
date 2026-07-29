import { isIP } from 'node:net'

/**
 * Único caminho de rede permitido para URL vinda de usuário (docs 05 e 07).
 *
 * O risco concreto: o formulário de importação recebe uma URL qualquer e o
 * servidor a busca. Sem as travas daqui, `http://169.254.169.254/` devolveria
 * as credenciais da instância, e `http://10.0.0.5/` alcançaria a rede interna
 * — usando o nosso servidor como procurador.
 *
 * A defesa é resolver o DNS e conferir o endereço **antes** de cada requisição,
 * inclusive a cada redirect, porque o destino do redirect é escolhido pelo
 * outro lado.
 *
 * Limite conhecido: entre a checagem e a conexão, o resolvedor poderia
 * devolver outro endereço (DNS rebinding). Fechar isso exige conectar no IP
 * validado com o Host original, o que o `fetch` não expõe. Como o conteúdo
 * buscado nunca volta cru para quem pediu — ele passa por extração e por um
 * modelo antes de virar rascunho de vaga — a janela não entrega resposta ao
 * atacante, e o custo de um cliente HTTP próprio não se paga aqui.
 */

export const MAXIMO_DE_REDIRECTS = 3
export const LIMITE_DE_BYTES = 5 * 1024 * 1024
export const TIMEOUT_PADRAO_MS = 15_000
export const USER_AGENT = 'CFJobsBot/1.0 (+https://vagas.codingferpa.org/bot)'

const TIPOS_ACEITOS = [
  'text/html',
  'application/xhtml+xml',
  'application/json',
  'application/ld+json',
]

export type MotivoDeFalha =
  | 'url_invalida'
  | 'esquema_nao_permitido'
  | 'credencial_na_url'
  | 'porta_nao_permitida'
  | 'dns_falhou'
  | 'host_privado'
  | 'redirects_demais'
  | 'tipo_nao_suportado'
  | 'resposta_grande_demais'
  | 'timeout'
  | 'status_http'
  | 'rede'

export class FalhaDeFetch extends Error {
  constructor(
    readonly motivo: MotivoDeFalha,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'FalhaDeFetch'
  }
}

// ---------------------------------------------------------------------------
// Endereços
// ---------------------------------------------------------------------------

function bytesV4(ip: string): number[] | null {
  const partes = ip.split('.')
  if (partes.length !== 4) return null

  const bytes = partes.map((parte) => Number(parte))
  return bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ? bytes
    : null
}

function bytesV6(ip: string): number[] | null {
  // Zona de interface (`fe80::1%eth0`) não participa da comparação.
  let texto = ip.split('%')[0] ?? ''

  // Cauda em notação IPv4 (`::ffff:127.0.0.1`) vira dois grupos hexadecimais,
  // que é o que ela representa — sem isso, um loopback disfarçado passaria.
  const comV4 = texto.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (comV4?.[1] && comV4.index !== undefined) {
    const v4 = bytesV4(comV4[1])
    if (!v4) return null
    const grupo = (alto: number, baixo: number) => ((alto << 8) | baixo).toString(16)
    texto =
      texto.slice(0, comV4.index) + grupo(v4[0]!, v4[1]!) + ':' + grupo(v4[2]!, v4[3]!)
  }

  const lados = texto.split('::')
  if (lados.length > 2) return null

  const separar = (parte?: string) => (parte ? parte.split(':').filter(Boolean) : [])
  const esquerda = separar(lados[0])
  const direita = lados.length === 2 ? separar(lados[1]) : []

  const grupos =
    lados.length === 2
      ? [
          ...esquerda,
          ...Array<string>(8 - esquerda.length - direita.length).fill('0'),
          ...direita,
        ]
      : esquerda

  if (grupos.length !== 8) return null

  const bytes: number[] = []
  for (const grupo of grupos) {
    const valor = Number.parseInt(grupo, 16)
    if (!Number.isInteger(valor) || valor < 0 || valor > 0xffff) return null
    bytes.push((valor >> 8) & 0xff, valor & 0xff)
  }

  return bytes
}

/**
 * Faixas que nunca são destino legítimo de uma vaga pública. As do doc 05 são
 * o mínimo; as demais entram pelo mesmo motivo — nenhuma delas leva a um board
 * de vagas, e todas levam a algum lugar que não queremos alcançar.
 */
const FAIXAS_BLOQUEADAS: [string, number][] = [
  ['0.0.0.0', 8], // "esta rede"
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, inclui o metadata da nuvem
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // atribuições do IETF
  ['192.0.2.0', 24], // documentação
  ['192.88.99.0', 24], // relay 6to4
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // benchmark
  ['198.51.100.0', 24], // documentação
  ['203.0.113.0', 24], // documentação
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservada, inclui o broadcast
  ['::', 128], // não especificado
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64
  ['2001:db8::', 32], // documentação
  ['fc00::', 7], // uso local (ULA)
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
]

function dentroDaFaixa(bytes: number[], faixa: number[], prefixo: number): boolean {
  if (bytes.length !== faixa.length) return false

  const inteiros = Math.floor(prefixo / 8)
  for (let i = 0; i < inteiros; i += 1) {
    if (bytes[i] !== faixa[i]) return false
  }

  const restantes = prefixo % 8
  if (restantes === 0) return true

  const mascara = 0xff << (8 - restantes)
  return (bytes[inteiros]! & mascara) === (faixa[inteiros]! & mascara)
}

function bytesDeIp(ip: string): number[] | null {
  const versao = isIP(ip)
  if (versao === 4) return bytesV4(ip)
  if (versao === 6) {
    const bytes = bytesV6(ip)
    if (!bytes) return null
    // IPv4 mapeado (`::ffff:x.x.x.x`) é comparado como IPv4: as faixas
    // privadas que importam estão listadas nessa forma.
    const prefixoMapeado = bytes.slice(0, 12)
    const ehMapeado =
      prefixoMapeado.slice(0, 10).every((byte) => byte === 0) &&
      prefixoMapeado[10] === 0xff &&
      prefixoMapeado[11] === 0xff
    return ehMapeado ? bytes.slice(12) : bytes
  }
  return null
}

export function ehEnderecoBloqueado(ip: string): boolean {
  const bytes = bytesDeIp(ip)
  // Endereço que não dá para interpretar é bloqueado: na dúvida, não sai.
  if (!bytes) return true

  return FAIXAS_BLOQUEADAS.some(([faixa, prefixo]) => {
    const bytesDaFaixa = bytesDeIp(faixa)
    return bytesDaFaixa ? dentroDaFaixa(bytes, bytesDaFaixa, prefixo) : false
  })
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

export function validarUrl(entrada: string): URL {
  let url: URL
  try {
    url = new URL(entrada)
  } catch {
    throw new FalhaDeFetch('url_invalida', 'Isso não parece uma URL.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new FalhaDeFetch(
      'esquema_nao_permitido',
      'Só aceitamos endereços http e https.',
    )
  }

  // Credencial na URL é quase sempre tentativa de disfarçar o host de destino:
  // em `https://boards.greenhouse.io@169.254.169.254/`, o host é o segundo.
  if (url.username !== '' || url.password !== '') {
    throw new FalhaDeFetch('credencial_na_url', 'A URL não pode conter usuário e senha.')
  }

  if (url.port !== '') {
    throw new FalhaDeFetch(
      'porta_nao_permitida',
      'A URL não pode apontar para uma porta fora do padrão.',
    )
  }

  if (url.hostname === '') {
    throw new FalhaDeFetch('url_invalida', 'A URL não tem endereço de servidor.')
  }

  // Board que ainda serve em http redireciona para https de qualquer forma;
  // subir aqui evita um salto e fecha a janela de leitura em texto claro.
  url.protocol = 'https:'

  return url
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export type ResolvedorDeDns = (host: string) => Promise<string[]>
export type Buscador = (url: string, init?: RequestInit) => Promise<Response>

export type OpcoesDeFetch = {
  resolver?: ResolvedorDeDns
  buscar?: Buscador
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
}

export type ResultadoDeFetch = {
  /** URL final, depois dos redirects — é ela que vale para canonicalizar. */
  url: string
  status: number
  contentType: string
  corpo: string
}

const resolverPadrao: ResolvedorDeDns = async (host) => {
  // Import dinâmico para o módulo não arrastar `node:dns` para nenhum bundle
  // que só precise das funções puras daqui.
  const { lookup } = await import('node:dns/promises')
  const enderecos = await lookup(host, { all: true })
  return enderecos.map((endereco) => endereco.address)
}

async function garantirHostPublico(host: string, resolver: ResolvedorDeDns) {
  let enderecos: string[]
  try {
    enderecos = await resolver(host)
  } catch {
    throw new FalhaDeFetch('dns_falhou', `Não conseguimos resolver o endereço ${host}.`)
  }

  if (enderecos.length === 0) {
    throw new FalhaDeFetch('dns_falhou', `O endereço ${host} não resolveu para nada.`)
  }

  // Basta um endereço bloqueado para recusar: se o host responde por dois IPs,
  // não temos como escolher qual será usado na conexão.
  if (enderecos.some(ehEnderecoBloqueado)) {
    throw new FalhaDeFetch(
      'host_privado',
      `O endereço ${host} aponta para a rede interna e não pode ser buscado.`,
    )
  }
}

function garantirTipoAceito(contentType: string) {
  const tipo = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  const aceito = TIPOS_ACEITOS.includes(tipo) || tipo.endsWith('+json')

  if (!aceito) {
    throw new FalhaDeFetch(
      'tipo_nao_suportado',
      `A página respondeu ${tipo || 'sem tipo'}; só lemos HTML e JSON.`,
    )
  }
}

async function lerComTeto(resposta: Response, teto: number): Promise<string> {
  const declarado = Number(resposta.headers.get('content-length'))
  if (Number.isFinite(declarado) && declarado > teto) {
    throw new FalhaDeFetch('resposta_grande_demais', 'A página é grande demais.')
  }

  const corpo = resposta.body
  if (!corpo) return ''

  const leitor = corpo.getReader()
  const pedacos: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    if (!value) continue

    total += value.byteLength
    if (total > teto) {
      await leitor.cancel()
      throw new FalhaDeFetch('resposta_grande_demais', 'A página é grande demais.')
    }
    pedacos.push(value)
  }

  return new TextDecoder().decode(Buffer.concat(pedacos))
}

const REDIRECIONAMENTOS = new Set([301, 302, 303, 307, 308])

export async function safeFetch(
  entrada: string,
  opcoes: OpcoesDeFetch = {},
): Promise<ResultadoDeFetch> {
  const {
    resolver = resolverPadrao,
    buscar = fetch,
    timeoutMs = TIMEOUT_PADRAO_MS,
    maxBytes = LIMITE_DE_BYTES,
    maxRedirects = MAXIMO_DE_REDIRECTS,
  } = opcoes

  let url = validarUrl(entrada)

  for (let salto = 0; salto <= maxRedirects; salto += 1) {
    await garantirHostPublico(url.hostname, resolver)

    const controle = new AbortController()
    const relogio = setTimeout(() => controle.abort(), timeoutMs)

    let resposta: Response
    try {
      resposta = await buscar(url.toString(), {
        headers: { 'user-agent': USER_AGENT, accept: TIPOS_ACEITOS.join(', ') },
        // Seguimos os redirects à mão: é a única forma de revalidar o destino
        // de cada salto antes de segui-lo.
        redirect: 'manual',
        signal: controle.signal,
      })
    } catch (erro) {
      if (erro instanceof Error && erro.name === 'AbortError') {
        throw new FalhaDeFetch('timeout', 'A página demorou demais para responder.')
      }
      throw new FalhaDeFetch('rede', 'Não conseguimos alcançar a página.')
    } finally {
      clearTimeout(relogio)
    }

    if (REDIRECIONAMENTOS.has(resposta.status)) {
      const destino = resposta.headers.get('location')
      if (!destino) {
        throw new FalhaDeFetch('rede', 'A página redirecionou para lugar nenhum.')
      }
      if (salto === maxRedirects) {
        throw new FalhaDeFetch('redirects_demais', 'A página redirecionou vezes demais.')
      }

      url = validarUrl(new URL(destino, url).toString())
      continue
    }

    if (!resposta.ok) {
      throw new FalhaDeFetch(
        'status_http',
        `A página respondeu ${resposta.status}.`,
        resposta.status,
      )
    }

    const contentType = resposta.headers.get('content-type') ?? ''
    garantirTipoAceito(contentType)

    return {
      url: url.toString(),
      status: resposta.status,
      contentType,
      corpo: await lerComTeto(resposta, maxBytes),
    }
  }

  throw new FalhaDeFetch('redirects_demais', 'A página redirecionou vezes demais.')
}
