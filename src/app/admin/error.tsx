'use client'

/**
 * Boundary do segmento do admin (doc 02). Erro aqui costuma ser banco ou serviço
 * de auth fora do ar — a pessoa precisa de linguagem humana e de um botão, não
 * de um stack trace.
 */
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="border-destructive flex flex-col items-start gap-4 rounded-md border p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h3 font-semibold">Algo saiu do lugar por aqui</h1>
        <p className="text-muted-foreground">
          Não conseguimos carregar esta tela do admin. Pode ser instabilidade momentânea —
          tente de novo em instantes.
        </p>
      </div>

      <button
        className="bg-primary-solid rounded-full px-6 py-2.5 font-semibold text-white transition duration-150"
        onClick={reset}
        type="button"
      >
        Tentar de novo
      </button>
    </div>
  )
}
