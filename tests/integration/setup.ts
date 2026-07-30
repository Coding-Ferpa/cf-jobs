/**
 * Carrega o `.env` local antes dos testes de integração — e recusa rodar contra
 * um banco que não seja local.
 *
 * No CI as variáveis já vêm do ambiente do job, e aí não há `.env` para ler —
 * por isso a falta do arquivo é silenciosa, e não um erro.
 */
try {
  process.loadEnvFile()
} catch {
  // Sem .env: as variáveis vêm do ambiente (CI).
}

/**
 * Esta suíte **apaga linhas**: eventos, importações, sugestões, segredos do
 * Vault, e ainda mexe nos contadores das vagas do seed. Contra o banco de
 * produção seria destruição de dado real, sem confirmação e sem volta.
 *
 * O cenário não é hipotético. Durante a ida ao ar do M8 o `.env` local ficou
 * meio produção, meio local (a URL do Supabase apontando para o projeto novo,
 * o banco ainda em 127.0.0.1). Deu para perceber porque o login falhou com
 * "Invalid API key" — mas se o valor trocado tivesse sido o `DATABASE_URL`, a
 * suíte teria rodado inteira contra produção e ninguém saberia até ver o
 * estrago.
 *
 * O endereço decide: banco local mora em `localhost`/`127.0.0.1`. Qualquer
 * outro host exige `PERMITIR_BANCO_REMOTO=1`, que ninguém digita sem querer.
 */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal'])

function exigirBancoLocal(): void {
  const url = process.env.DATABASE_URL
  if (!url) return // Sem banco configurado, os testes já falham com a mensagem certa.
  if (process.env.PERMITIR_BANCO_REMOTO === '1') return

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return // URL estranha: quem reclama é o cliente do banco, com mais contexto.
  }

  if (HOSTS_LOCAIS.has(host)) return

  throw new Error(
    `Os testes de integração apagam dados e o DATABASE_URL aponta para "${host}", ` +
      'que não é local. Se isso é mesmo o que você quer, rode com ' +
      'PERMITIR_BANCO_REMOTO=1 — e saiba que a suíte deleta eventos, ' +
      'importações, sugestões e segredos do Vault.',
  )
}

exigirBancoLocal()
