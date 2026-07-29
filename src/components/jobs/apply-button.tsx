'use client'

/**
 * CTA de candidatura. O evento sai antes de abrir a aba: se sair depois, a
 * troca de contexto pode cancelar a requisição e o clique some da contagem.
 */
export function ApplyButton({ slug, applyUrl }: { slug: string; applyUrl: string }) {
  function registrarClique() {
    try {
      navigator.sendBeacon?.(
        '/api/v1/events',
        new Blob([JSON.stringify({ job_slug: slug, event_type: 'click_apply' })], {
          type: 'application/json',
        }),
      )
    } catch {
      // O link continua funcionando mesmo sem registrar.
    }
  }

  return (
    <a
      className="bg-primary-solid hover:shadow-glow rounded-full px-6 py-3 text-center font-semibold text-white transition duration-150"
      href={applyUrl}
      onClick={registrarClique}
      rel="noopener nofollow"
      target="_blank"
    >
      Candidatar-se
    </a>
  )
}
