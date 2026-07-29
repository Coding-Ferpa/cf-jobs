import { describe, expect, it } from 'vitest'

import { ipDaRequisicao, ipHash, visitorHash } from '@/lib/visitor'

const BASE = {
  ip: '203.0.113.10',
  userAgent: 'Mozilla/5.0',
  salt: 'sal-secreto-de-teste',
  agora: new Date('2026-07-28T12:00:00.000Z'),
}

describe('visitorHash', () => {
  it('é estável dentro do mesmo dia', () => {
    const manha = visitorHash({ ...BASE, agora: new Date('2026-07-28T08:00:00.000Z') })
    const noite = visitorHash({ ...BASE, agora: new Date('2026-07-28T23:00:00.000Z') })

    expect(manha).toBe(noite)
  })

  it('rotaciona na virada do dia — ninguém é seguido entre dias', () => {
    const hoje = visitorHash(BASE)
    const amanha = visitorHash({ ...BASE, agora: new Date('2026-07-29T12:00:00.000Z') })

    expect(hoje).not.toBe(amanha)
  })

  it('muda com o sal, então o hash não é reproduzível sem o segredo', () => {
    expect(visitorHash(BASE)).not.toBe(visitorHash({ ...BASE, salt: 'outro-sal' }))
  })

  it('separa visitantes diferentes', () => {
    expect(visitorHash(BASE)).not.toBe(visitorHash({ ...BASE, ip: '203.0.113.11' }))
    expect(visitorHash(BASE)).not.toBe(visitorHash({ ...BASE, userAgent: 'curl/8' }))
  })

  it('não deixa o IP recuperável a partir do resultado', () => {
    const hash = visitorHash(BASE)

    expect(hash).not.toContain('203.0.113.10')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('ipHash', () => {
  it('não guarda o IP em claro', () => {
    const hash = ipHash('203.0.113.7', 'sal-de-teste')

    expect(hash).not.toContain('203.0.113.7')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('é estável para o mesmo IP — o balde não pode zerar sozinho', () => {
    expect(ipHash('203.0.113.7', 'sal')).toBe(ipHash('203.0.113.7', 'sal'))
  })

  it('separa IPs diferentes', () => {
    expect(ipHash('203.0.113.7', 'sal')).not.toBe(ipHash('203.0.113.8', 'sal'))
  })

  it('muda com o sal, para um dump do banco não ser reversível por força bruta', () => {
    expect(ipHash('203.0.113.7', 'sal-a')).not.toBe(ipHash('203.0.113.7', 'sal-b'))
  })
})

describe('ipDaRequisicao', () => {
  it('usa o primeiro endereço de x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.10, 70.41.3.18' })

    expect(ipDaRequisicao(headers)).toBe('203.0.113.10')
  })

  it('cai para x-real-ip e depois para um marcador', () => {
    expect(ipDaRequisicao(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe(
      '203.0.113.9',
    )
    expect(ipDaRequisicao(new Headers())).toBe('desconhecido')
  })
})
