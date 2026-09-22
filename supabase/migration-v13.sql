-- =====================================================================
-- Achilles Content V13. A copy passa a ser assincrona.
-- Rode DEPOIS de migration-v12.sql. E idempotente.
--
-- Motivo: generate-copy era funcao sincrona da Netlify, cujo limite e da
-- ordem de dez segundos. A geracao de copy com o Brand Brain inteiro no
-- prompt passa disso com frequencia. A plataforma matava a funcao ANTES do
-- catch rodar, entao o credito saia e o estorno nunca acontecia: a geracao
-- ficava parada em draft, paga e inutil. O timeout de 90s que eu havia
-- configurado nunca teve chance de valer.
-- =====================================================================

-- Guarda a divisao da cobranca, para o estorno devolver a cada saldo o que
-- saiu dele. Sem isto o estorno teria que adivinhar plano contra avulso.
alter table public.generations add column if not exists copy_charged_plan integer not null default 0;
alter table public.generations add column if not exists copy_charged_extra integer not null default 0;
alter table public.generations add column if not exists copy_refunded_at timestamptz;
alter table public.generations add column if not exists copy_error text;
alter table public.generations add column if not exists copy_started_at timestamptz;

-- Mesma guarda do estorno das imagens: quem chega primeiro estorna, e a
-- segunda tentativa nao encontra nada para devolver.
create or replace function public.claim_copy_refund(p_generation_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare claimed boolean;
begin
  update public.generations set copy_refunded_at = now()
   where id = p_generation_id and copy_refunded_at is null
  returning true into claimed;
  return coalesce(claimed,false);
end $$;
revoke all on function public.claim_copy_refund(uuid) from public,anon,authenticated;
grant execute on function public.claim_copy_refund(uuid) to service_role;

-- O estado 'copy_queued' existe para o estudio saber que a copy esta em
-- producao, em vez de mostrar um rascunho que nunca sai do lugar.
do $$ begin
  alter table public.generations drop constraint if exists generations_status_check;
  alter table public.generations add constraint generations_status_check
    check(status in ('draft','copy_queued','copy_ready','copy_approved','processing','images_ready','failed'));
exception when duplicate_object then null; end $$;

create index if not exists generations_copy_pending_idx
  on public.generations(status, created_at) where status in ('draft','copy_queued');

-- Quanto tempo uma copy pode ficar em producao antes de ser considerada
-- perdida. O cron recolhe e estorna depois disso.
insert into public.app_settings(key,value,description) values
 ('copy_stuck_minutes','10','Minutos até uma copy presa ser dada como perdida e estornada pelo cron.')
on conflict(key) do nothing;
