import { describe, expect, it, vi } from 'vitest'

import {
  ehEnderecoBloqueado,
  FalhaDeFetch,
  LIMITE_DE_BYTES,
  MAXIMO_DE_REDIRECTS,
  safeFetch,
  validarUrl,
} from './safe-fetch'

/**
 * A tabela de URLs maliciosas do doc 12: **todas devem falhar**. Um SSRF aqui
 * daria a qualquer pessoa com acesso ao formulário de importação uma janela
 * para a rede interna e para o endpoint de metadados da nuvem.
 */

const RESOLVEDOR_PUBLICO = () => Promise.resolve(['93.184.216.34'])

function resposta(
  corpo: string,
  { status = 200, tipo = 'text/html', headers = {} as Record<string, string> } = {},
) {
  return new Response(corpo, {
    status,
    headers: { 'content-type': tipo, ...headers },
  })
}

function redirect(para: string, status = 302) {
  return new Response(null, { status, headers: { location: para } })
}

describe('validarUrl', () => {
  it('aceita https', () => {
    expect(validarUrl('https://boards.greenhouse.io/org/jobs/1').protocol).toBe('https:')
  })

  it('promove http a https em vez de recusar — quase todo board redireciona mesmo', () => {
    expect(validarUrl('http://boards.greenhouse.io/org/jobs/1').protocol).toBe('https:')
  })

  const recusados: [string, string][] = [
    ['esquema de arquivo', 'file:///etc/passwd'],
    ['esquema de dados', 'data:text/html,<script>alert(1)</script>'],
    ['esquema javascript', 'javascript:alert(1)'],
    ['ftp', 'ftp://exemplo.test/vaga'],
    ['userinfo disfarçando o host', 'https://boards.greenhouse.io@169.254.169.254/'],
    ['userinfo com senha', 'https://user:senha@exemplo.test/'],
    ['porta fora do padrão', 'https://exemplo.test:8080/vaga'],
    ['porta de administração', 'https://exemplo.test:22/'],
    ['sem host', 'https://'],
    ['texto que não é URL', 'não é uma url'],
  ]

  it.each(recusados)('recusa %s', (_nome, url) => {
    expect(() => validarUrl(url)).toThrow(FalhaDeFetch)
  })

  it('aceita as portas padrão escritas à mão', () => {
    expect(validarUrl('https://exemplo.test:443/vaga').hostname).toBe('exemplo.test')
  })
})

describe('ehEnderecoBloqueado', () => {
  const bloqueados = [
    ['loopback v4', '127.0.0.1'],
    ['loopback fora do .1', '127.99.12.7'],
    ['rede privada 10/8', '10.0.0.1'],
    ['rede privada 172.16/12', '172.20.10.5'],
    ['rede privada 192.168/16', '192.168.1.1'],
    ['metadata da nuvem', '169.254.169.254'],
    ['link-local v4', '169.254.0.1'],
    ['CGNAT', '100.64.0.1'],
    ['rede zero', '0.0.0.0'],
    ['multicast', '224.0.0.1'],
    ['broadcast', '255.255.255.255'],
    ['loopback v6', '::1'],
    ['não especificado v6', '::'],
    ['ULA v6', 'fd00::1'],
    ['link-local v6', 'fe80::1'],
    ['multicast v6', 'ff02::1'],
    ['v4 mapeado em v6 escondendo loopback', '::ffff:127.0.0.1'],
    ['v4 mapeado em v6 escondendo metadata', '::ffff:169.254.169.254'],
  ] as const

  it.each(bloqueados)('bloqueia %s', (_nome, ip) => {
    expect(ehEnderecoBloqueado(ip)).toBe(true)
  })

  const liberados = [
    ['IP público v4', '93.184.216.34'],
    ['IP público v4 vizinho de faixa privada', '172.32.0.1'],
    ['IP público v4 vizinho de CGNAT', '100.128.0.1'],
    ['IP público v6', '2606:2800:220:1:248:1893:25c8:1946'],
  ] as const

  it.each(liberados)('libera %s', (_nome, ip) => {
    expect(ehEnderecoBloqueado(ip)).toBe(false)
  })
})

describe('safeFetch', () => {
  it('busca e devolve corpo, tipo e URL final', async () => {
    const buscar = vi.fn().mockResolvedValue(resposta('<html>vaga</html>'))

    const resultado = await safeFetch('https://exemplo.test/vaga', {
      resolver: RESOLVEDOR_PUBLICO,
      buscar,
    })

    expect(resultado.corpo).toBe('<html>vaga</html>')
    expect(resultado.contentType).toContain('text/html')
    expect(resultado.url).toBe('https://exemplo.test/vaga')
  })

  it('identifica o bot no User-Agent, como o doc 05 exige', async () => {
    const buscar = vi.fn().mockResolvedValue(resposta('<html></html>'))

    await safeFetch('https://exemplo.test/vaga', {
      resolver: RESOLVEDOR_PUBLICO,
      buscar,
    })

    const cabecalhos = new Headers(buscar.mock.calls[0]?.[1]?.headers)
    expect(cabecalhos.get('user-agent')).toContain('CFJobsBot')
  })

  it('recusa host que resolve para IP privado', async () => {
    const buscar = vi.fn()

    await expect(
      safeFetch('https://interno.exemplo.test/vaga', {
        resolver: () => Promise.resolve(['10.1.2.3']),
        buscar,
      }),
    ).rejects.toMatchObject({ motivo: 'host_privado' })

    // O ponto do teste: nem chegou a bater na rede.
    expect(buscar).not.toHaveBeenCalled()
  })

  it('recusa host com um IP público e outro privado', async () => {
    await expect(
      safeFetch('https://misto.exemplo.test/vaga', {
        resolver: () => Promise.resolve(['93.184.216.34', '127.0.0.1']),
        buscar: vi.fn(),
      }),
    ).rejects.toMatchObject({ motivo: 'host_privado' })
  })

  it('revalida o destino a cada redirect — o caso clássico de SSRF', async () => {
    const buscar = vi.fn().mockResolvedValue(redirect('https://metadata.exemplo.test/'))
    const resolver = (host: string) =>
      Promise.resolve(
        host === 'metadata.exemplo.test' ? ['169.254.169.254'] : ['93.184.216.34'],
      )

    await expect(
      safeFetch('https://inocente.exemplo.test/vaga', { resolver, buscar }),
    ).rejects.toMatchObject({ motivo: 'host_privado' })
  })

  it('segue redirect legítimo e devolve a URL final', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(redirect('https://exemplo.test/vaga-nova'))
      .mockResolvedValueOnce(resposta('<html>nova</html>'))

    const resultado = await safeFetch('https://exemplo.test/vaga', {
      resolver: RESOLVEDOR_PUBLICO,
      buscar,
    })

    expect(resultado.url).toBe('https://exemplo.test/vaga-nova')
    expect(resultado.corpo).toBe('<html>nova</html>')
  })

  it('para no limite de redirects em vez de girar para sempre', async () => {
    const buscar = vi.fn().mockResolvedValue(redirect('https://exemplo.test/de-novo'))

    await expect(
      safeFetch('https://exemplo.test/vaga', { resolver: RESOLVEDOR_PUBLICO, buscar }),
    ).rejects.toMatchObject({ motivo: 'redirects_demais' })

    expect(buscar).toHaveBeenCalledTimes(MAXIMO_DE_REDIRECTS + 1)
  })

  it('recusa redirect para esquema não-http', async () => {
    const buscar = vi.fn().mockResolvedValue(redirect('file:///etc/passwd'))

    await expect(
      safeFetch('https://exemplo.test/vaga', { resolver: RESOLVEDOR_PUBLICO, buscar }),
    ).rejects.toThrow(FalhaDeFetch)
  })

  it('recusa content-type que não é HTML nem JSON', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValue(resposta('%PDF-1.4', { tipo: 'application/pdf' }))

    await expect(
      safeFetch('https://exemplo.test/vaga.pdf', {
        resolver: RESOLVEDOR_PUBLICO,
        buscar,
      }),
    ).rejects.toMatchObject({ motivo: 'tipo_nao_suportado' })
  })

  it('aceita JSON, que é o que as APIs dos ATSs devolvem', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValue(resposta('{"title":"x"}', { tipo: 'application/json' }))

    const resultado = await safeFetch('https://api.lever.co/v0/postings/org/1', {
      resolver: RESOLVEDOR_PUBLICO,
      buscar,
    })

    expect(resultado.corpo).toBe('{"title":"x"}')
  })

  it('recusa resposta grande demais pelo Content-Length, sem baixá-la', async () => {
    const buscar = vi.fn().mockResolvedValue(
      resposta('x', {
        headers: { 'content-length': String(LIMITE_DE_BYTES + 1) },
      }),
    )

    await expect(
      safeFetch('https://exemplo.test/gigante', {
        resolver: RESOLVEDOR_PUBLICO,
        buscar,
      }),
    ).rejects.toMatchObject({ motivo: 'resposta_grande_demais' })
  })

  it('recusa resposta grande demais mesmo sem Content-Length', async () => {
    const buscar = vi.fn().mockResolvedValue(resposta('x'.repeat(LIMITE_DE_BYTES + 10)))

    await expect(
      safeFetch('https://exemplo.test/gigante', {
        resolver: RESOLVEDOR_PUBLICO,
        buscar,
      }),
    ).rejects.toMatchObject({ motivo: 'resposta_grande_demais' })
  })

  it('trata erro de DNS como falha explicada, não como exceção crua', async () => {
    await expect(
      safeFetch('https://nao-existe.exemplo.test/vaga', {
        resolver: () => Promise.reject(new Error('ENOTFOUND')),
        buscar: vi.fn(),
      }),
    ).rejects.toMatchObject({ motivo: 'dns_falhou' })
  })

  it('trata host sem endereço nenhum como falha de DNS', async () => {
    await expect(
      safeFetch('https://vazio.exemplo.test/vaga', {
        resolver: () => Promise.resolve([]),
        buscar: vi.fn(),
      }),
    ).rejects.toMatchObject({ motivo: 'dns_falhou' })
  })

  it('preserva o status HTTP na falha, para o pipeline decidir se retenta', async () => {
    const buscar = vi.fn().mockResolvedValue(resposta('não existe', { status: 404 }))

    await expect(
      safeFetch('https://exemplo.test/vaga', { resolver: RESOLVEDOR_PUBLICO, buscar }),
    ).rejects.toMatchObject({ motivo: 'status_http', status: 404 })
  })

  it('aborta no timeout', async () => {
    const buscar = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_, rejeitar) => {
        init?.signal?.addEventListener('abort', () => {
          rejeitar(Object.assign(new Error('abortado'), { name: 'AbortError' }))
        })
      })
    })

    await expect(
      safeFetch('https://lenta.exemplo.test/vaga', {
        resolver: RESOLVEDOR_PUBLICO,
        buscar,
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ motivo: 'timeout' })
  })
})
