'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { PontoDaSerie } from '@/db/queries/analytics'

/**
 * Série temporal de visualizações e cliques (doc 09).
 *
 * Único componente de cliente do painel, e o único lugar do projeto com
 * biblioteca de gráfico: as barras dos outros widgets são `div` com largura
 * proporcional, que basta para comparar cinco valores. Uma série de 90 pontos
 * com eixo, grade e tooltip não é a mesma tarefa.
 *
 * As cores vêm dos tokens do design system, que já são as do doc 09
 * (`--primary` é o `#8b5cf6` que ele pede) — assim o gráfico acompanha o tema
 * claro em vez de fixar valores de dark mode.
 *
 * O SVG é `aria-hidden` e existe uma tabela ao lado: uma árvore de `path` não
 * descreve uma série para quem usa leitor de tela, e quem quer o número exato
 * de um dia também não o tira de um gráfico.
 */

const CORES = {
  views: 'var(--color-primary)',
  clicks: 'var(--color-primary-muted)',
  grade: 'var(--color-border)',
  texto: 'var(--color-muted-foreground)',
}

/** `2026-07-29` → `29/07`: o ano é o mesmo em toda a série. */
function diaCurto(dia: string): string {
  const [, mes, diaDoMes] = dia.split('-')
  return `${diaDoMes}/${mes}`
}

export function SerieDeEngajamento({ pontos }: { pontos: PontoDaSerie[] }) {
  if (pontos.length === 0) {
    return (
      <p className="text-muted-foreground text-caption">
        Nenhum dia agregado no período.
      </p>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/*
        `min-w-0` e `overflow-hidden` não são enfeite. O `ResponsiveContainer`
        mede o container e desenha um SVG de tamanho fixo dentro de um `div`
        `width:0;height:0;overflow:visible` — sem a trava, num viewport estreito
        o SVG transborda a caixa e passa a interceptar o clique dos elementos
        vizinhos. Pego no E2E do projeto `mobile`: o link do seletor de período
        ficava embaixo do gráfico.
      */}
      <div className="h-64 w-full min-w-0 overflow-hidden">
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart
            aria-hidden="true"
            data={pontos}
            margin={{ left: -16, right: 8, top: 8 }}
          >
            <defs>
              <linearGradient id="gradiente-views" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={CORES.views} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CORES.views} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={CORES.grade} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="dia"
              interval="preserveStartEnd"
              minTickGap={24}
              stroke={CORES.texto}
              tickFormatter={diaCurto}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              allowDecimals={false}
              stroke={CORES.texto}
              tickLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-card)',
                border: `1px solid ${CORES.grade}`,
                borderRadius: 8,
                color: 'var(--color-foreground)',
                fontSize: 12,
              }}
              formatter={(valor, nome) => [
                valor,
                nome === 'views' ? 'Visualizações' : 'Cliques',
              ]}
              labelFormatter={(dia) => (typeof dia === 'string' ? diaCurto(dia) : dia)}
            />
            <Area
              dataKey="views"
              fill="url(#gradiente-views)"
              stroke={CORES.views}
              strokeWidth={2}
              type="monotone"
            />
            <Area
              dataKey="clicks"
              fill="transparent"
              stroke={CORES.clicks}
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Legenda cor={CORES.views} rotulo="Visualizações" />
        <Legenda cor={CORES.clicks} rotulo="Cliques" />
      </div>

      <details className="text-caption">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer transition duration-150">
          Ver os números da série
        </summary>

        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left">
            <caption className="sr-only">
              Visualizações e cliques por dia no período selecionado
            </caption>
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium" scope="col">
                  Dia
                </th>
                <th className="py-1 text-right font-medium" scope="col">
                  Visualizações
                </th>
                <th className="py-1 text-right font-medium" scope="col">
                  Cliques
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {pontos.map((ponto) => (
                <tr className="border-border border-t" key={ponto.dia}>
                  <th className="py-1 font-normal" scope="row">
                    {diaCurto(ponto.dia)}
                  </th>
                  <td className="py-1 text-right">{ponto.views}</td>
                  <td className="py-1 text-right">{ponto.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

function Legenda({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <span className="text-caption text-muted-foreground flex items-center gap-2">
      <span
        aria-hidden="true"
        className="block h-0.5 w-4 rounded-full"
        style={{ background: cor }}
      />
      {rotulo}
    </span>
  )
}
