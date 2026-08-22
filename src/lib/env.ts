import { z } from '@/lib/zod'

/**
 * Contrato de variáveis de ambiente (doc 01). `.env.example` precisa listar
 * exatamente as chaves destes schemas — `pnpm check:env` verifica isso no CI.
 *
 * Segredos ficam apenas no schema de servidor; o que é `NEXT_PUBLIC_` vai para o
 * bundle do navegador e nunca deve conter valor sensível.
 */

/**
 * Endereço local: o que existe na máquina de quem desenvolve e **não existe
 * dentro de um contêiner da Vercel**.
 */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

function hostDe(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

/**
 * `VERCEL` é definida pela plataforma no build e no runtime, e por mais ninguém
 * — nem local, nem no CI, que constroem contra o Supabase local de propósito.
 */
function naVercel(): boolean {
  return Boolean(process.env.VERCEL)
}

/**
 * Recusa endereço local quando o código roda na Vercel.
 *
 * Existe por um episódio concreto: as variáveis do `.env` de desenvolvimento
 * foram coladas no painel, e o build morreu em `prerendering /sitemap.xml` com
 * `ECONNREFUSED 127.0.0.1:54322` — um erro que não diz qual variável está
 * errada nem por quê, seis passos depois da causa. Aqui ele vira uma frase.
 */
function recusarEnderecoLocal(
  chave: string,
  valor: string | undefined,
  ctx: z.RefinementCtx,
  comoCorrigir: string,
): void {
  if (!naVercel()) return

  const host = hostDe(valor)
  if (!host || !HOSTS_LOCAIS.has(host)) return

  ctx.addIssue({
    code: 'custom',
    path: [chave],
    message:
      `aponta para ${host}, que não existe dentro da Vercel — ` +
      `é o valor do ambiente de desenvolvimento. ${comoCorrigir}`,
  })
}

export const clientEnvSchema = z
  .object({
    NEXT_PUBLIC_SITE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

    // Sentry (doc 09). Opcional: sem ela o SDK não é nem carregado, e um deploy
    // da comunidade sobe sem conta em serviço nenhum. O DSN é público por
    // construção — serve para enviar evento, não para ler nada.
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    recusarEnderecoLocal(
      'NEXT_PUBLIC_SITE_URL',
      env.NEXT_PUBLIC_SITE_URL,
      ctx,
      'Use a URL pública do deploy — o domínio final, ou o *.vercel.app do ' +
        'projeto enquanto ele não existe. É o que vai no sitemap, no canonical ' +
        'e no Open Graph.',
    )
    recusarEnderecoLocal(
      'NEXT_PUBLIC_SUPABASE_URL',
      env.NEXT_PUBLIC_SUPABASE_URL,
      ctx,
      'Use a Project URL do painel do Supabase.',
    )
  })

export const serverEnvSchema = z
  .object({
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    // Opcionais no boot (doc 01): quem contribui com UI ou banco não precisa de
    // chave da NVIDIA para rodar o projeto. Quem valida é `requireAiEnv()`, no
    // ponto de uso.
    //
    // São duas chaves porque elas se revezam a cada chamada (doc 05): cada conta
    // gratuita tem 40 req/min, e alternar dobra a folga sem custo. A segunda é
    // opcional — com uma só, a rotação simplesmente não acontece.
    NVIDIA_API_KEY: z.string().min(1).optional(),
    NVIDIA_API_KEY_FALLBACK: z.string().min(1).optional(),

    // Endpoint compatível com a API OpenAI. O padrão é o NIM da NVIDIA (doc 05);
    // existe como variável porque um deploy da comunidade pode apontar para
    // outro provedor compatível — e porque é assim que o E2E fala com um dublê
    // local em vez de gastar chamada de verdade.
    AI_BASE_URL: z.url().optional(),

    // Cascata de modelos, tentados nesta ordem (doc 05). Os três foram sondados
    // com chave real antes de virarem padrão (`scripts/sondar-modelos.ts`): todos
    // existem para a conta e aceitam `response_format: json_schema` (ADR-0017).
    // O anterior segundo degrau, `moonshotai/kimi-k2.6`, respondia 404 — padrão
    // que não existe é degrau a menos na cascata, e ninguém percebe.
    AI_MODEL_PRIMARY: z.string().min(1).default('z-ai/glm-5.2'),
    AI_MODEL_SECONDARY: z.string().min(1).default('minimaxai/minimax-m3'),
    AI_MODEL_FALLBACK: z.string().min(1).default('meta/llama-3.3-70b-instruct'),

    // Sem esta variável o painel de tokens continua existindo, só não há
    // bloqueio suave (doc 05): o tier gratuito confirmado já dá folga.
    AI_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().positive().optional(),
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

    // --- WhatsApp Business Cloud API (Disparo em Grupos) ---
    // Opcionais no boot: o app funciona normalmente sem elas. O disparo é feito
    // apenas quando configuradas e solicitadas no formulário.
    WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
    WHATSAPP_GROUP_ID_TEST: z.string().min(1).optional(),
    WHATSAPP_GROUP_ID_PROD: z.string().min(1).optional(),
    WHATSAPP_DEFAULT_GROUP: z.enum(['test', 'prod']).default('test'),
    WHATSAPP_API_VERSION: z.string().min(1).default('v22.0'),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(8).optional(),
  })
  .superRefine((env, ctx) => {
    recusarEnderecoLocal(
      'DATABASE_URL',
      env.DATABASE_URL,
      ctx,
      'Copie de Supabase → Connect → Transaction pooler (porta 6543).',
    )
    recusarEnderecoLocal(
      'DIRECT_URL',
      env.DIRECT_URL,
      ctx,
      'Copie de Supabase → Connect → Direct connection (porta 5432).',
    )
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
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
}

let cachedClientEnv: ClientEnv | undefined
let cachedServerEnv: ServerEnv | undefined

/** Variáveis públicas — seguras em qualquer runtime. */
export function clientEnv(): ClientEnv {
  cachedClientEnv ??= parseClientEnv(rawClientEnv)
  return cachedClientEnv
}

export type AiEnv = {
  /** Uma ou duas, na ordem de rodízio (doc 05). */
  apiKeys: string[]
  /** Cascata de modelos, na ordem de tentativa. */
  models: [string, string, string]
  monthlyTokenBudget: number | null
  /** `undefined` = o endpoint padrão do NIM. */
  baseURL: string | undefined
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
    // A segunda chave só entra se existir e for diferente: repetir a mesma no
    // rodízio consumiria o dobro do limite de uma conta só.
    apiKeys:
      env.NVIDIA_API_KEY_FALLBACK && env.NVIDIA_API_KEY_FALLBACK !== env.NVIDIA_API_KEY
        ? [env.NVIDIA_API_KEY, env.NVIDIA_API_KEY_FALLBACK]
        : [env.NVIDIA_API_KEY],
    models: [env.AI_MODEL_PRIMARY, env.AI_MODEL_SECONDARY, env.AI_MODEL_FALLBACK],
    monthlyTokenBudget: env.AI_MONTHLY_TOKEN_BUDGET ?? null,
    baseURL: env.AI_BASE_URL,
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

export type WhatsAppEnv = {
  accessToken: string
  phoneNumberId: string
  groupIdTest: string | undefined
  groupIdProd: string | undefined
  defaultGroup: 'test' | 'prod'
  apiVersion: string
  webhookVerifyToken: string | undefined
}

export function isWhatsAppConfigured(env?: ServerEnv): boolean {
  const currentEnv = env ?? serverEnv()
  return Boolean(
    currentEnv.WHATSAPP_ACCESS_TOKEN &&
    currentEnv.WHATSAPP_PHONE_NUMBER_ID &&
    (currentEnv.WHATSAPP_GROUP_ID_TEST || currentEnv.WHATSAPP_GROUP_ID_PROD),
  )
}

export function resolveWhatsAppEnv(env: ServerEnv): WhatsAppEnv {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error(
      'Credenciais do WhatsApp (WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID) não estão configuradas.',
    )
  }

  return {
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    groupIdTest: env.WHATSAPP_GROUP_ID_TEST,
    groupIdProd: env.WHATSAPP_GROUP_ID_PROD,
    defaultGroup: env.WHATSAPP_DEFAULT_GROUP,
    apiVersion: env.WHATSAPP_API_VERSION,
    webhookVerifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  }
}

export function _resetEnvCache(): void {
  cachedClientEnv = undefined
  cachedServerEnv = undefined
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
