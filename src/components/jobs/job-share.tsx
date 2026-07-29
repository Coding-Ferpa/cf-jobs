'use client'

import { useState } from 'react'

/**
 * Compartilhar com origem rastreável (doc 09): cada canal carrega seu
 * `utm_source`, o que responde "de onde vêm os visitantes" sem ferramenta
 * externa. No celular, usa a folha nativa quando existe.
 */

const CANAIS = [
  { id: 'whatsapp', rotulo: 'WhatsApp' },
  { id: 'linkedin', rotulo: 'LinkedIn' },
  { id: 'x', rotulo: 'X' },
] as const

type Canal = (typeof CANAIS)[number]['id']

function urlComOrigem(url: string, canal: string) {
  const alvo = new URL(url)
  alvo.searchParams.set('utm_source', `share_${canal}`)
  return alvo.toString()
}

function urlDoCanal(canal: Canal, url: string, titulo: string) {
  const compartilhada = encodeURIComponent(urlComOrigem(url, canal))
  const texto = encodeURIComponent(titulo)

  switch (canal) {
    case 'whatsapp':
      return `https://wa.me/?text=${texto}%20${compartilhada}`
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${compartilhada}`
    case 'x':
      return `https://twitter.com/intent/tweet?text=${texto}&url=${compartilhada}`
  }
}

export function JobShare({ url, titulo }: { url: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(urlComOrigem(url, 'copiar'))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissão de área de transferência: os links dos canais seguem lá.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-caption font-semibold">Compartilhar</h2>
      <ul className="flex flex-wrap gap-2">
        {CANAIS.map((canal) => (
          <li key={canal.id}>
            <a
              className="border-border hover:border-primary-muted text-caption rounded-full border px-3 py-1.5 transition duration-150"
              href={urlDoCanal(canal.id, url, titulo)}
              rel="noopener"
              target="_blank"
            >
              {canal.rotulo}
            </a>
          </li>
        ))}
        <li>
          <button
            className="border-border hover:border-primary-muted text-caption rounded-full border px-3 py-1.5 transition duration-150"
            onClick={copiar}
            type="button"
          >
            {copiado ? 'Link copiado' : 'Copiar link'}
          </button>
        </li>
      </ul>
      <p aria-live="polite" className="sr-only">
        {copiado ? 'Link copiado para a área de transferência' : ''}
      </p>
    </div>
  )
}
