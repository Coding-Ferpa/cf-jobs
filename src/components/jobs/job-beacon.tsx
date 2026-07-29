'use client'

import { useEffect } from 'react'

/**
 * Registra a visualização da vaga (doc 09). Usa `sendBeacon` para não segurar a
 * navegação e falha em silêncio: analytics nunca pode atrapalhar quem só quer
 * ler a vaga.
 */
export function JobBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    const corpo = JSON.stringify({
      job_slug: slug,
      event_type: 'view',
      referrer: document.referrer || undefined,
      utm_source:
        new URLSearchParams(window.location.search).get('utm_source') ?? undefined,
    })

    try {
      const enviado = navigator.sendBeacon?.(
        '/api/v1/events',
        new Blob([corpo], { type: 'application/json' }),
      )

      if (!enviado) {
        void fetch('/api/v1/events', {
          method: 'POST',
          body: corpo,
          headers: { 'content-type': 'application/json' },
          keepalive: true,
        }).catch(() => {})
      }
    } catch {
      // Sem beacon, sem drama.
    }
  }, [slug])

  return null
}
