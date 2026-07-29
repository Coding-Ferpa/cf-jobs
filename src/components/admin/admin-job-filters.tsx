'use client'

import { Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Busca e filtro de status da tabela de vagas (doc 08). Escreve na URL como a
 * área pública: link compartilhável e botão voltar funcionando.
 *
 * Aqui não entra o nuqs — o admin não tem os parsers compartilhados da área
 * pública, e são dois parâmetros.
 */

const DEBOUNCE_MS = 300

const STATUS = [
  { valor: 'all', rotulo: 'Todos os status' },
  { valor: 'draft', rotulo: 'Rascunho' },
  { valor: 'pending_review', rotulo: 'Em revisão' },
  { valor: 'published', rotulo: 'Publicada' },
  { valor: 'archived', rotulo: 'Arquivada' },
  { valor: 'rejected', rotulo: 'Rejeitada' },
] as const

export function AdminJobFilters() {
  const router = useRouter()
  const parametros = useSearchParams()

  const qAtual = parametros.get('q') ?? ''
  const statusAtual = parametros.get('status') ?? 'all'

  const [texto, setTexto] = useState(qAtual)
  const primeiraRenderizacao = useRef(true)

  function navegar(mudancas: Record<string, string | null>) {
    const proximos = new URLSearchParams(parametros.toString())

    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === '') proximos.delete(chave)
      else proximos.set(chave, valor)
    }

    // Trocar filtro sempre volta para a primeira página.
    proximos.delete('pagina')

    const query = proximos.toString()
    router.push(query ? `/admin/vagas?${query}` : '/admin/vagas')
  }

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false
      return
    }

    const tempo = setTimeout(() => {
      if (texto !== qAtual) navegar({ q: texto || null })
    }, DEBOUNCE_MS)

    return () => clearTimeout(tempo)
    // `navegar` fecha sobre os parâmetros atuais; incluí-lo dispararia o efeito
    // a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, qAtual])

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-[240px] flex-1">
        <Label className="sr-only" htmlFor="busca-admin">
          Buscar por título ou empresa
        </Label>
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          autoComplete="off"
          className="pl-9"
          id="busca-admin"
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Buscar por título ou empresa…"
          type="search"
          value={texto}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="sr-only" htmlFor="status-admin">
          Filtrar por status
        </Label>
        <Select
          onValueChange={(valor) => navegar({ status: valor === 'all' ? null : valor })}
          value={statusAtual}
        >
          <SelectTrigger className="w-[180px]" id="status-admin">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS.map((opcao) => (
              <SelectItem key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
