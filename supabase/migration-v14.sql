-- =====================================================================
-- Achilles Content V14. Fluxo aberto: copy opcional, carrossel de tamanho
-- variavel, sugestao de tema e arquivamento.
-- Rode DEPOIS de migration-v13.sql. E idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sugestao de tema. Consulta o Brand Brain para propor um assunto de
--    post, entao custa credito como qualquer outra operacao.
-- ---------------------------------------------------------------------
insert into public.pricing(slug,label,kind,credits,image_quality,description,sort_order) values
 ('theme_suggestion','Sugestão de tema','copy',50,null,'Lê o Brand Brain e propõe um tema de publicação.',10)
on conflict(slug) do update set
  label=excluded.label, kind=excluded.kind, credits=excluded.credits,
  description=excluded.description, sort_order=excluded.sort_order, updated_at=now();

-- ---------------------------------------------------------------------
-- 2. Origem da copy. 'ai' foi gerada e cobrada; 'manual' o cliente
--    escreveu e nao custou nada. Guardar isso evita cobrar regeração de
--    uma copy que nunca foi paga.
-- ---------------------------------------------------------------------
alter table public.generations add column if not exists copy_source text not null default 'ai';
do $$ begin
  alter table public.generations drop constraint if exists generations_copy_source_check;
  alter table public.generations add constraint generations_copy_source_check
    check(copy_source in ('ai','manual'));
exception when duplicate_object then null; end $$;

-- Quantas vezes a copy foi refeita, cada uma cobrada. Serve para o extrato
-- do cliente fazer sentido quando ele olhar o consumo daquela geracao.
alter table public.generations add column if not exists copy_attempts integer not null default 1;

-- ---------------------------------------------------------------------
-- 3. Arquivamento. O cliente pode parar numa copy e guardar, sem que ela
--    fique para sempre no meio das entregas em andamento.
-- ---------------------------------------------------------------------
alter table public.generations add column if not exists archived_at timestamptz;
create index if not exists generations_user_active_idx
  on public.generations(user_id, created_at desc) where archived_at is null;

-- ---------------------------------------------------------------------
-- 4. Carrossel de tamanho variavel. A coluna image_count ja existia, mas
--    sem limite: passa a aceitar de 1 a 5, que e o teto do produto.
-- ---------------------------------------------------------------------
do $$ begin
  alter table public.generations drop constraint if exists generations_image_count_check;
  alter table public.generations add constraint generations_image_count_check
    check(image_count between 1 and 5);
exception when duplicate_object then null; end $$;

insert into public.app_settings(key,value,description) values
 ('carousel_max_images','5','Máximo de artes em um carrossel.')
on conflict(key) do nothing;
