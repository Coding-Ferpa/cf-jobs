/**
 * Carrega o `.env` local antes dos testes de integração.
 *
 * No CI as variáveis já vêm do ambiente do job, e aí não há `.env` para ler —
 * por isso a falta do arquivo é silenciosa, e não um erro.
 */
try {
  process.loadEnvFile()
} catch {
  // Sem .env: as variáveis vêm do ambiente (CI).
}
