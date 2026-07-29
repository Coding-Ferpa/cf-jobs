const TECNOLOGIAS = ['TypeScript', 'Next.js', 'Postgres', 'Tailwind']

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 py-24 text-center">
      <section className="flex flex-col items-center gap-4">
        <h1 className="sm:text-display max-w-3xl text-[2.25rem] leading-tight font-bold">
          Vagas de tecnologia, direto ao ponto.
        </h1>
        <p className="text-body text-muted-foreground max-w-xl">
          Curadas pela comunidade Coding Ferpa.
        </p>
      </section>

      <article className="border-border bg-card hover:border-primary hover:shadow-glow w-full max-w-md rounded-md border p-6 text-left transition duration-150 hover:-translate-y-0.5">
        <p className="text-caption text-subtle-foreground">Em construção</p>
        <h2 className="text-h3 mt-1 font-semibold">
          A plataforma está sendo construída em público
        </h2>
        <p className="text-muted-foreground text-caption mt-3 leading-relaxed">
          Esta é a fundação do projeto: identidade visual, testes e integração contínua.
          As vagas chegam nos próximos passos.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {TECNOLOGIAS.map((tecnologia) => (
            <li
              key={tecnologia}
              className="bg-surface text-subtle-foreground rounded-full px-3 py-1 font-mono text-xs"
            >
              {tecnologia}
            </li>
          ))}
        </ul>
      </article>

      <a
        className="bg-primary hover:shadow-glow rounded-full px-12 py-2.5 font-semibold text-white transition duration-150"
        href="https://github.com/Coding-Ferpa/cf-jobs"
        rel="noopener"
        target="_blank"
      >
        Acompanhar no GitHub
      </a>
    </div>
  )
}
