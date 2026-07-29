import Markdown from 'react-markdown'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

/**
 * Descrição da vaga em Markdown (doc 07).
 *
 * O conteúdo vem de página de terceiro e passou por um LLM: é dado não
 * confiável por definição. O `react-markdown` já não renderiza HTML bruto, e a
 * sanitização por allowlist entra como segunda camada — a mesma que roda antes
 * de persistir.
 */

const ESQUEMA = {
  ...defaultSchema,
  tagNames: [
    'p',
    'h2',
    'h3',
    'h4',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'code',
    'pre',
    'blockquote',
    'a',
    'br',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [['href'], ['title']],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
}

export function JobMarkdown({ conteudo }: { conteudo: string }) {
  return (
    <div className="prosa flex flex-col gap-4">
      <Markdown
        components={{
          // Link dentro da descrição é conteúdo de terceiro: sem passar
          // reputação e sem abrir acesso à janela de origem.
          a: ({ href, children }) => (
            <a
              className="text-primary underline"
              href={href}
              rel="noopener nofollow ugc"
              target="_blank"
            >
              {children}
            </a>
          ),
        }}
        rehypePlugins={[[rehypeSanitize, ESQUEMA]]}
        remarkPlugins={[remarkGfm]}
      >
        {conteudo}
      </Markdown>
    </div>
  )
}
