-- =====================================================================
-- Achilles Content V12. Estorno idempotente e diagnostico de falha.
-- Rode DEPOIS de migration-v11.sql. E idempotente.
--
-- Motivo: refundUnproducedImages nao tinha guarda. Worker invocado duas
-- vezes para o mesmo job (retry da plataforma, redespacho do cron) estornava
-- duas vezes, e o prejuizo era da Achilles. Agora o estorno e reivindicado
-- de forma atomica: a segunda tentativa nao encontra nada para estornar.
-- =====================================================================

alter table public.generation_jobs add column if not exists refunded_at timestamptz;
alter table public.generation_jobs add column if not exists refunded_credits integer not null default 0;
-- Guarda o motivo tecnico completo, separado da mensagem que o cliente le.
alter table public.generation_jobs add column if not exists error_detail text;

-- Reivindica o direito de estornar este job. Retorna true apenas para quem
-- chegou primeiro; qualquer chamada seguinte recebe false e nao estorna.
create or replace function public.claim_job_refund(p_job_id uuid, p_credits integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare claimed boolean;
begin
  update public.generation_jobs
     set refunded_at = now(), refunded_credits = greatest(coalesce(p_credits,0),0)
   where id = p_job_id and refunded_at is null
  returning true into claimed;
  return coalesce(claimed,false);
end $$;

revoke all on function public.claim_job_refund(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_job_refund(uuid,integer) to service_role;

-- ---------------------------------------------------------------------
-- Tempo limite e tentativas das chamadas a OpenAI, ajustaveis sem deploy.
-- O fetch do Node estoura em torno de cinco minutos por conta propria e
-- devolve "fetch failed", que nao diz nada a ninguem. Agora o limite e
-- nosso, e menor que o da plataforma, para sobrar tempo de retentativa.
-- ---------------------------------------------------------------------
insert into public.app_settings(key,value,description) values
 ('openai_image_timeout_ms','150000','Tempo limite de cada chamada de imagem, em milissegundos.'),
 ('openai_text_timeout_ms','90000','Tempo limite de cada chamada de texto, em milissegundos.'),
 ('openai_retries','2','Retentativas por chamada, só para falha transitória (timeout, rede, 429, 5xx).')
on conflict(key) do nothing;

-- ---------------------------------------------------------------------
-- O story estava pedindo 1152x2048, que sao 2,36 milhoes de pixels. E o
-- pedido mais lento do sistema e o primeiro candidato a estourar o tempo
-- limite. 1024x1792 mantem a proporcao vertical com 22% menos pixel.
-- ---------------------------------------------------------------------
update public.app_settings set value='1024x1792', updated_at=now()
 where key='story_image_size' and value='1152x2048';
