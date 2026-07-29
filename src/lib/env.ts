import { z } from 'zod'

/**
 * Contrato de variáveis de ambiente (doc 01). `.env.example` precisa listar
 * exatamente as chaves destes schemas — `pnpm check:env` verifica isso no CI.
 *
 * Segredos ficam apenas no schema de servidor; o que é `NEXT_PUBLIC_` vai para o
 * bundle do navegador e nunca deve conter valor sensível.
 */

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

export const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  NVIDIA_API_KEY: z.string().min(1),
  AI_MODEL_PRIMARY: z.string().min(1).default('meta/llama-3.3-70b-instruct'),
  AI_MODEL_FALLBACK: z.string().min(1).default('mistralai/mistral-small-24b-instruct'),
  CRON_SECRET: z.string().min(16),

  // Opcionais: sem elas o login com GitHub simplesmente não é oferecido. Os
  // nomes são os que a CLI do Supabase lê em config.toml, então o mesmo par de
  // variáveis configura o provider local e a detecção do recurso no app.
  SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: z.string().min(1).optional(),
  SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET: z.string().min(1).optional(),
})

export type ClientEnv = z.infer<typeof clientEnvSchema>
export type ServerEnv = z.infer<typeof serverEnvSchema>

/**
 * `VARIAVEL=` em um arquivo .env significa "não informei", não "informei
 * vazio" — sem isso, deixar em branco uma variável com valor padrão ou
 * opcional quebraria a validação em vez de acionar o padrão.
 */
function semVazios(source: unknown): unknown {
  if (typeof source !== 'object' || source === null) return source

  return Object.fromEntries(
    Object.entries(source as Record<string, unknown>).map(([chave, valor]) => [
      chave,
      typeof valor === 'string' && valor.trim() === '' ? undefined : valor,
    ]),
  )
}

function parse<T extends z.ZodType>(schema: T, source: unknown, scope: string) {
  const result = schema.safeParse(semVazios(source))
  if (result.success) return result.data as z.infer<T>

  const details = result.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(
    `Variáveis de ambiente inválidas (${scope}):\n${details}\n` +
      'Copie .env.example para .env e preencha os valores.',
  )
}

export function parseClientEnv(source: unknown): ClientEnv {
  return parse(clientEnvSchema, source, 'cliente')
}

export function parseServerEnv(source: unknown): ServerEnv {
  return parse(serverEnvSchema, source, 'servidor')
}

// O Next só substitui `process.env.NEXT_PUBLIC_*` em build quando o acesso é
// estático — por isso a leitura explícita, chave por chave.
const rawClientEnv = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}

let cachedClientEnv: ClientEnv | undefined
let cachedServerEnv: ServerEnv | undefined

/** Variáveis públicas — seguras em qualquer runtime. */
export function clientEnv(): ClientEnv {
  cachedClientEnv ??= parseClientEnv(rawClientEnv)
  return cachedClientEnv
}

/**
 * O login com GitHub só aparece quando há credenciais configuradas — em
 * desenvolvimento a validação é por e-mail e senha, e o OAuth App é criado na
 * ida para produção (M8).
 */
export function isGithubOAuthEnabled(): boolean {
  return Boolean(serverEnv().SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID)
}

/** Variáveis de servidor, incluindo segredos. Nunca chamar em código de cliente. */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error(
      'serverEnv() só pode ser lido no servidor: use clientEnv() em código de navegador.',
    )
  }
  cachedServerEnv ??= parseServerEnv(process.env)
  return cachedServerEnv
}
