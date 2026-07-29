import { getCurrentUser } from '@/lib/auth'
import { hasRole } from '@/lib/roles'

export default async function AdminDashboardPage() {
  // O layout já garantiu sessão e papel mínimo; aqui só lemos para a saudação.
  const usuario = await getCurrentUser()

  const podeCurar = usuario ? hasRole(usuario.role, 'editor') : false

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h2 font-bold">Painel</h1>
        <p className="text-muted-foreground">
          {podeCurar
            ? 'Você pode importar, editar e publicar vagas.'
            : 'Seu acesso é de leitura e revisão de sugestões.'}
        </p>
      </header>

      <section className="border-border bg-card rounded-md border p-6">
        <h2 className="text-h3 font-semibold">Em construção</h2>
        <p className="text-muted-foreground mt-2">
          Os indicadores de vagas, importações e visitantes entram junto com o CRUD e o
          pipeline. Por enquanto o painel serve para confirmar que a autenticação e os
          papéis funcionam.
        </p>
      </section>
    </div>
  )
}
