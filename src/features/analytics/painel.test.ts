import { describe, expect, it } from 'vitest'

import {
  ALERTA_DE_FALHAS,
  ALERTA_DE_SUGESTOES,
  avaliarSaude,
  HORAS_SEM_CRON,
  taxaDeCliques,
  type Badge,
  type EntradaDaSaude,
} from '@/features/analytics/painel'
import { avaliarOrcamento } from '@/features/import/budget'

const AGORA = new Date('2026-07-29T12:00:00Z')

function horasAtras(horas: number): Date {
  return new Date(AGORA.getTime() - horas * 3_600_000)
}

function entradaDe(sobrescritas: Partial<EntradaDaSaude> = {}): EntradaDaSaude {
  return {
    importacoes: { total: 10, falhas: 1 },
    sugestoesPendentes: 3,
    orcamento: avaliarOrcamento({ tokensIn: 1_000, tokensOut: 200, teto: 100_000 }),
    cron: { ultimaExecucao: horasAtras(6), ultimoStatus: 'succeeded' },
    agora: AGORA,
    ...sobrescritas,
  }
}

function badge(badges: Badge[], chave: Badge['chave']): Badge {
  const encontrado = badges.find((item) => item.chave === chave)
  expect(encontrado, `badge ${chave}`).toBeDefined()
  return encontrado!
}

describe('taxaDeCliques', () => {
  it('é cliques sobre visualizações', () => {
    expect(taxaDeCliques(200, 10)).toBeCloseTo(0.05, 6)
  })

  it('é nula sem visualização — não zero nem infinito', () => {
    expect(taxaDeCliques(0, 0)).toBeNull()
    // Clique sem view registrada acontece: o beacon de view pode ter falhado.
    // "∞%" no painel seria pior que "—".
    expect(taxaDeCliques(0, 3)).toBeNull()
  })
})

describe('avaliarSaude', () => {
  it('entrega os quatro badges do doc 09, sempre', () => {
    const badges = avaliarSaude(entradaDe())

    expect(badges.map((item) => item.chave)).toEqual([
      'importacoes',
      'sugestoes',
      'orcamento',
      'cron',
    ])
    expect(badges.every((item) => item.estado === 'ok')).toBe(true)
  })

  describe('importações', () => {
    it('alerta acima de 30% de falha em 24h', () => {
      const badges = avaliarSaude(entradaDe({ importacoes: { total: 10, falhas: 4 } }))

      expect(badge(badges, 'importacoes')).toMatchObject({ estado: 'alerta' })
      expect(badge(badges, 'importacoes').detalhe).toContain('40%')
    })

    it('exatamente no limiar ainda não é alerta', () => {
      // O doc 09 diz "> 30%": 3 de 10 é o limite e não passou dele.
      expect(ALERTA_DE_FALHAS).toBe(0.3)
      expect(
        badge(
          avaliarSaude(entradaDe({ importacoes: { total: 10, falhas: 3 } })),
          'importacoes',
        ).estado,
      ).toBe('ok')
    })

    it('sem tentativa nenhuma o estado é indefinido, não "ok"', () => {
      const item = badge(
        avaliarSaude(entradaDe({ importacoes: { total: 0, falhas: 0 } })),
        'importacoes',
      )

      expect(item.estado).toBe('indefinido')
      expect(item.detalhe).toContain('Nenhuma importação')
    })
  })

  describe('sugestões', () => {
    it('alerta acima de 20 pendentes', () => {
      expect(ALERTA_DE_SUGESTOES).toBe(20)
      expect(
        badge(avaliarSaude(entradaDe({ sugestoesPendentes: 21 })), 'sugestoes').estado,
      ).toBe('alerta')
      expect(
        badge(avaliarSaude(entradaDe({ sugestoesPendentes: 20 })), 'sugestoes').estado,
      ).toBe('ok')
    })
  })

  describe('orçamento', () => {
    it('alerta em 80% do teto', () => {
      const orcamento = avaliarOrcamento({
        tokensIn: 80_000,
        tokensOut: 0,
        teto: 100_000,
      })

      expect(badge(avaliarSaude(entradaDe({ orcamento })), 'orcamento')).toMatchObject({
        estado: 'alerta',
        detalhe: '80% do teto mensal consumido.',
      })
    })

    it('sem teto configurado não é alerta nem "ok"', () => {
      const orcamento = avaliarOrcamento({
        tokensIn: 9_000_000,
        tokensOut: 0,
        teto: null,
      })

      // O teto é opcional (doc 05): quem não configurou não está em risco de
      // nada, mas também não há o que declarar saudável.
      expect(badge(avaliarSaude(entradaDe({ orcamento })), 'orcamento').estado).toBe(
        'indefinido',
      )
    })
  })

  describe('cron', () => {
    it('alerta depois de 48h sem rodar', () => {
      expect(HORAS_SEM_CRON).toBe(48)

      const item = badge(
        avaliarSaude(
          entradaDe({
            cron: { ultimaExecucao: horasAtras(49), ultimoStatus: 'succeeded' },
          }),
        ),
        'cron',
      )

      expect(item.estado).toBe('alerta')
      expect(item.detalhe).toContain('49h')
    })

    it('não alerta dentro da janela', () => {
      expect(
        badge(
          avaliarSaude(
            entradaDe({
              cron: { ultimaExecucao: horasAtras(47), ultimoStatus: 'succeeded' },
            }),
          ),
          'cron',
        ).estado,
      ).toBe('ok')
    })

    it('execução recente que falhou também é alerta', () => {
      // Rodou há uma hora, então a conta de horas diria "ok" — e o job não fez
      // nada. O status importa tanto quanto a data.
      const item = badge(
        avaliarSaude(
          entradaDe({ cron: { ultimaExecucao: horasAtras(1), ultimoStatus: 'failed' } }),
        ),
        'cron',
      )

      expect(item.estado).toBe('alerta')
      expect(item.detalhe).toContain('failed')
    })

    it('nunca ter rodado é alerta, e diz isso', () => {
      const item = badge(
        avaliarSaude(entradaDe({ cron: { ultimaExecucao: null, ultimoStatus: null } })),
        'cron',
      )

      expect(item.estado).toBe('alerta')
      expect(item.detalhe).toContain('nunca rodou')
    })

    it('sem acesso ao histórico o estado é indefinido', () => {
      // Ler `cron.job_run_details` depende de permissão do papel do banco:
      // dizer "alerta" por não conseguir olhar seria alarme falso.
      expect(badge(avaliarSaude(entradaDe({ cron: null })), 'cron').estado).toBe(
        'indefinido',
      )
    })
  })
})
