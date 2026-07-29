-- 0001 — Extensões (doc 04)
--
-- O Supabase mantém extensões no schema `extensions`, que já está no
-- search_path das conexões.

-- Funções de hash usadas por rate limit e dedup de URL.
create extension if not exists pgcrypto with schema extensions;

-- Similaridade de texto: matching fuzzy da IA e autocomplete (índices em 0003/0004).
create extension if not exists pg_trgm with schema extensions;

-- Agendamento dentro do banco: arquivamento e rollup (migration 0009).
create extension if not exists pg_cron;

-- HTTP a partir do Postgres: o cron avisa a Vercel para revalidar o cache.
create extension if not exists pg_net with schema extensions;
