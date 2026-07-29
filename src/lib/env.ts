import { z } from '@/lib/zod'

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
  // Opcional no boot (doc 01): quem contribui com UI ou banco não precisa de
  // chave da NVIDIA para rodar o projeto. Quem valida é `requireAiEnv()`, no
  // ponto de uso.
  NVIDIA_API_KEY: z.string().min(1).optional(),
  AI_MODEL_PRIMARY: z.string().min(1).default('meta/llama-3.3-70b-instruct'),
  AI_MODEL_FALLBACK: z.string().min(1).default('mistralai/mistral-small-24b-instruct'),
  CRON_SECRET: z.string().min(16),

  // Sal do visitor_hash (doc 07). Opcional no boot pelo mesmo motivo da chave
  // da NVIDIA: quem contribui com UI não precisa dele para o app subir. Quem
  // exige é o endpoint de eventos, no ponto de uso.
  ANALYTICS_SALT: z.string().min(16).optional(),

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

export type AiEnv = {
  apiKey: string
  primaryModel: string
  fallbackModel: string
}

export function resolveAiEnv(env: ServerEnv): AiEnv {
  if (!env.NVIDIA_API_KEY) {
    throw new Error(
      'NVIDIA_API_KEY não está definida e a importação por IA depende dela. ' +
        'Crie uma chave em build.nvidia.com e adicione ao .env — o resto do ' +
        'projeto funciona sem.',
    )
  }

  return {
    apiKey: env.NVIDIA_API_KEY,
    primaryModel: env.AI_MODEL_PRIMARY,
    fallbackModel: env.AI_MODEL_FALLBACK,
  }
}

/**
 * Configuração da NVIDIA NIM, exigida só onde é usada: o pipeline de
 * importação. Falha aqui é erro de configuração de quem vai importar, não
 * motivo para o app inteiro não subir (doc 01).
 */
export function requireAiEnv(): AiEnv {
  return resolveAiEnv(serverEnv())
}

export function resolveAnalyticsSalt(env: ServerEnv): string {
  if (!env.ANALYTICS_SALT) {
    throw new Error(
      'ANALYTICS_SALT não está definida e o registro de eventos depende dela ' +
        'para anonimizar o visitante. Gere um valor aleatório longo e adicione ao .env.',
    )
  }

  return env.ANALYTICS_SALT
}

export function requireAnalyticsSalt(): string {
  return resolveAnalyticsSalt(serverEnv())
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
