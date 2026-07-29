'use client'

import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { iniciarImportacao, repetirImportacao } from '@/actions/imports'
import type { ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/cn'
import { MAX_DURATION_DA_IMPORTACAO } from '@/lib/import-runtime'

/**
 * Importação por URL com barra de progresso (doc 08).
 *
 * A action devolve o id na hora e o pipeline segue em segundo plano, na mesma
 * invocação (doc 02). Com o id em mãos, esta tela pergunta o estado a cada
 * segundo e meio — o pipeline grava cada etapa fora de transação justamente
 * para que essa leitura veja o avanço.
 *
 * Nada aqui espera o processamento terminar: a importação medida leva de 28s a
 * mais de dois minutos, e é o banco que conta como ela terminou.
 */

const INTERVALO_DE_POLLING_MS = 1_500

/**
 * Além do teto da própria função não há mais o que esperar: ou a plataforma já
 * encerrou o processamento, ou ele gravou o desfecho. A folga cobre o atraso
 * entre o fim do pipeline e o próximo polling.
 */
const LIMITE_DE_ESPERA_MS = (MAX_DURATION_DA_IMPORTACAO + 15) * 1_000

type Etapa = { chave: string; rotulo: string; detalhe: string }

const ETAPAS: Etapa[] = [
  { chave: 'queued', rotulo: 'Na fila', detalhe: 'Preparando a importação.' },
  { chave: 'fetching', rotulo: 'Buscando', detalhe: 'Lendo a página da vaga.' },
  {
    chave: 'extracting',
    rotulo: 'Extraindo',
    detalhe: 'Separando o texto da vaga do resto da página.',
  },
  {
    chave: 'classifying',
    rotulo: 'Classificando',
    detalhe: 'A IA está lendo e estruturando a vaga. É a parte mais demorada.',
  },
  {
    chave: 'mapping',
    rotulo: 'Mapeando',
    detalhe: 'Casando tecnologias e cargos com o cadastro.',
  },
  { chave: 'review', rotulo: 'Pronta', detalhe: 'Vaga criada e aguardando revisão.' },
]

function posicaoDaEtapa(status: string): number {
  const indice = ETAPAS.findIndex((etapa) => etapa.chave === status)
  return indice === -1 ? 0 : indice
}

type Estado =
  | { fase: 'formulario' }
  | { fase: 'processando'; importId: string; status: string }
  | { fase: 'erro'; importId: string | null; mensagem: string; etapa: string | null }

export function ImportWizard() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [estado, setEstado] = useState<Estado>({ fase: 'formulario' })
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)
  // Bloqueio suave do orçamento (doc 05): o servidor recusa uma vez e explica;
  // o segundo envio vai com a confirmação.
  const [confirmarOrcamento, setConfirmarOrcamento] = useState(false)

  // Sem o ref, um efeito que ainda está no ar depois de a tela mudar continuaria
  // marcando estado de uma importação que já acabou.
  const ativo = useRef(true)
  useEffect(() => {
    ativo.current = true
    return () => {
      ativo.current = false
    }
  }, [])

  /**
   * O acompanhamento é um `fetch` e não uma Server Action: o Next enfileira as
   * actions de um mesmo cliente, e o processamento ocupa a invocação por
   * dezenas de segundos — uma action de leitura ficaria presa atrás dele e a
   * barra nunca sairia de "Na fila". Medido em campo, com o banco já em
   * `classifying`.
   */
  async function acompanhar(importId: string) {
    const comecou = Date.now()

    while (ativo.current && Date.now() - comecou < LIMITE_DE_ESPERA_MS) {
      await new Promise((resolve) => setTimeout(resolve, INTERVALO_DE_POLLING_MS))
      if (!ativo.current) return

      const resposta = await fetch(`/api/internal/imports/${importId}`, {
        cache: 'no-store',
      })
      if (!resposta.ok) continue

      const dados = (await resposta.json()) as {
        status: string
        jobId: string | null
        errorStep: string | null
        errorMessage: string | null
      }

      if (dados.status === 'failed') {
        setEstado({
          fase: 'erro',
          importId,
          etapa: dados.errorStep,
          mensagem: dados.errorMessage ?? 'A importação falhou.',
        })
        return
      }

      if (dados.status === 'review' || dados.status === 'completed') {
        if (dados.jobId) router.push(`/admin/vagas/${dados.jobId}/revisar`)
        return
      }

      setEstado({ fase: 'processando', importId, status: dados.status })
    }

    if (!ativo.current) return

    // Passou do teto da função sem desfecho no banco: a invocação morreu antes
    // de gravar. Repetir aproveita o cache do conteúdo já buscado.
    setEstado({
      fase: 'erro',
      importId,
      etapa: null,
      mensagem: 'A importação passou do tempo limite sem terminar.',
    })
  }

  async function importar(evento: React.FormEvent) {
    evento.preventDefault()
    setResultado(null)

    const aberta = await iniciarImportacao({ url, confirmarOrcamento })
    if (!aberta.ok) {
      setResultado(aberta)
      if (aberta.error.code === 'budget_exceeded') setConfirmarOrcamento(true)
      return
    }

    if (aberta.data.estado === 'duplicada') {
      setResultado({
        ok: false,
        error: {
          code: 'duplicate_job',
          message: `Essa vaga já está cadastrada: ${aberta.data.title}.`,
        },
      })
      return
    }

    const { importId } = aberta.data
    setEstado({ fase: 'processando', importId, status: 'queued' })
    await acompanhar(importId)
  }

  async function tentarDeNovo(importId: string) {
    const nova = await repetirImportacao({ importId })
    if (!nova.ok) {
      setResultado(nova)
      return
    }

    setEstado({ fase: 'processando', importId: nova.data.importId, status: 'queued' })
    await acompanhar(nova.data.importId)
  }

  if (estado.fase === 'processando') {
    return <Progresso status={estado.status} />
  }

  if (estado.fase === 'erro') {
    return (
      <div className="flex flex-col gap-4" data-testid="import-erro">
        <div
          className="border-destructive text-destructive flex items-start gap-3 rounded-md border px-4 py-3"
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">Não deu para importar</p>
            <p className="text-caption">{estado.mensagem}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {estado.importId ? (
            <Button onClick={() => void tentarDeNovo(estado.importId!)}>
              Tentar novamente
            </Button>
          ) : null}
          <Button onClick={() => setEstado({ fase: 'formulario' })} variant="outline">
            Usar outro endereço
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/vagas/nova">Cadastrar à mão</Link>
          </Button>
        </div>

        <p className="text-muted-foreground text-caption">
          O conteúdo já buscado fica em cache por 24 horas: tentar de novo não consulta a
          página outra vez.
        </p>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={importar}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="url-da-vaga">Endereço da vaga</Label>
        <Input
          autoComplete="off"
          id="url-da-vaga"
          inputMode="url"
          name="url"
          onChange={(evento) => setUrl(evento.target.value)}
          placeholder="https://boards.greenhouse.io/empresa/jobs/123"
          required
          value={url}
        />
        <p className="text-muted-foreground text-caption">
          Cole o link oficial do anúncio. Greenhouse, Lever, Ashby e Gupy são lidos pela
          API pública deles; os demais sites passam pela extração genérica.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">
          {confirmarOrcamento ? 'Importar mesmo assim' : 'Importar'}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/vagas/nova">Prefiro cadastrar à mão</Link>
        </Button>
      </div>

      <ActionFeedback resultado={resultado} />
    </form>
  )
}

function Progresso({ status }: { status: string }) {
  const atual = posicaoDaEtapa(status)

  return (
    <div className="flex flex-col gap-4" data-testid="import-progresso">
      <ol aria-live="polite" className="flex flex-col gap-3">
        {ETAPAS.map((etapa, indice) => {
          const concluida = indice < atual
          const emAndamento = indice === atual

          return (
            <li
              className={cn(
                'flex items-start gap-3 rounded-md px-3 py-2 transition duration-150',
                emAndamento ? 'bg-surface' : null,
              )}
              key={etapa.chave}
            >
              <span aria-hidden="true" className="mt-0.5">
                {concluida ? (
                  <CircleCheck className="text-success size-5" />
                ) : emAndamento ? (
                  <Loader2 className="text-primary size-5 animate-spin" />
                ) : (
                  <span className="border-border block size-5 rounded-full border" />
                )}
              </span>

              <div className="flex flex-col">
                <span
                  className={cn(
                    'text-caption',
                    emAndamento
                      ? 'text-foreground font-semibold'
                      : concluida
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/70',
                  )}
                >
                  {etapa.rotulo}
                  {emAndamento ? <span className="sr-only"> (em andamento)</span> : null}
                </span>
                {emAndamento ? (
                  <span className="text-muted-foreground text-xs">{etapa.detalhe}</span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>

      <p className="text-muted-foreground text-caption">
        Costuma levar de 30 segundos a 2 minutos — a espera é da fila da IA, não do
        tamanho da vaga. O processamento é do servidor: fechar a aba não o cancela, e o
        resultado aparece no log de importações.
      </p>
    </div>
  )
}
