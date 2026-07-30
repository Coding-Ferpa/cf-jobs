-- 0010 — Rate limit devolve os números que a API v1 publica (docs 06 e 07)
--
-- A API promete os cabeçalhos `X-RateLimit-*`, e para isso precisa de quanto
-- sobrou da janela e de quando ela volta a abrir — números que a versão
-- booleana já calculava e descartava. A tabela `rate_limits` não tem policy de
-- leitura, e não deve ter: quem enxerga o contador é só esta função, que é
-- security definer.
--
-- Substituição em vez de função nova ao lado: nada foi para produção ainda,
-- então não existe deploy anterior com quem manter compatibilidade (regra
-- expand/contract do doc 11), e duas funções iguais a menos do retorno só
-- deixariam a dúvida de qual chamar.

-- expand/contract: contract (nada havia sido deployado quando esta migration
-- foi escrita — não existe deploy anterior chamando a assinatura antiga)
drop function public.check_rate_limit(text, integer, interval);

-- Parâmetros OUT em vez de `returns table` de propósito: assim a função
-- devolve uma linha só, e não um conjunto, o que permite chamá-la de dentro
-- de outra expressão — `(check_rate_limit(...)).allowed`.
create function public.check_rate_limit(
  rate_key text,
  max_requests integer,
  window_size interval,
  out allowed boolean,
  out remaining integer,
  out reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket_seconds double precision := greatest(extract(epoch from window_size) / 10, 1);
  bucket timestamptz;
  total integer;
  oldest timestamptz;
begin
  bucket := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / bucket_seconds) * bucket_seconds
  );

  insert into public.rate_limits (key, window_start, request_count)
  values (rate_key, bucket, 1)
  on conflict (key, window_start)
    do update set request_count = public.rate_limits.request_count + 1;

  select coalesce(sum(rl.request_count), 0), min(rl.window_start)
    into total, oldest
    from public.rate_limits rl
   where rl.key = rate_key
     and rl.window_start > clock_timestamp() - window_size;

  -- Baldes velhos desta chave saem junto: dispensa um cron só para isso.
  delete from public.rate_limits as rl
   where rl.key = rate_key
     and rl.window_start < clock_timestamp() - (window_size * 2);

  allowed := total <= max_requests;
  remaining := greatest(max_requests - total, 0);
  -- A janela é deslizante: ela abre espaço quando o balde mais antigo sai dela,
  -- não daqui a uma janela inteira.
  reset_at := coalesce(oldest, clock_timestamp()) + window_size;
end;
$$;
