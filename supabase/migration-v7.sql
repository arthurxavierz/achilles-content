-- =====================================================================
-- Achilles Content V7. Imagens de referencia no Brand Brain.
-- Rode DEPOIS de migration-v6.sql. E idempotente.
--
-- Motivo: descricao em texto nao reproduz mascote, motivo grafico nem
-- tratamento de luz especifico. Isso so vem de imagem anexada ao pedido.
-- O texto continua valendo para as regras; a imagem passa a valer para o look.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bucket privado das referencias da marca.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-references','brand-references', false, 8388608, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public=false, file_size_limit=8388608,
  allowed_mime_types=array['image/png','image/jpeg','image/webp'];

-- O caminho e sempre <user_id>/<arquivo>. A primeira pasta define o dono,
-- e e isso que as policies abaixo checam.
drop policy if exists brand_refs_own_read on storage.objects;
create policy brand_refs_own_read on storage.objects for select to authenticated
  using (bucket_id='brand-references' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists brand_refs_own_insert on storage.objects;
create policy brand_refs_own_insert on storage.objects for insert to authenticated
  with check (bucket_id='brand-references' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists brand_refs_own_delete on storage.objects;
create policy brand_refs_own_delete on storage.objects for delete to authenticated
  using (bucket_id='brand-references' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 2. Catalogo das referencias.
--    Guarda ordem e descricao. O arquivo mora no storage; aqui fica o
--    que o sistema precisa saber sobre ele.
-- ---------------------------------------------------------------------
create table if not exists public.brand_reference_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  label text not null default '',
  -- Ordem de uso. A OpenAI pesa mais as primeiras imagens enviadas.
  position integer not null default 1 check(position between 1 and 20),
  created_at timestamptz not null default now()
);
create index if not exists brand_reference_images_user_idx
  on public.brand_reference_images(user_id, position);

alter table public.brand_reference_images enable row level security;

drop policy if exists brand_ref_rows_self_read on public.brand_reference_images;
create policy brand_ref_rows_self_read on public.brand_reference_images
  for select to authenticated using(user_id=auth.uid());

drop policy if exists brand_ref_rows_self_insert on public.brand_reference_images;
create policy brand_ref_rows_self_insert on public.brand_reference_images
  for insert to authenticated with check(user_id=auth.uid());

drop policy if exists brand_ref_rows_self_delete on public.brand_reference_images;
create policy brand_ref_rows_self_delete on public.brand_reference_images
  for delete to authenticated using(user_id=auth.uid());

-- ---------------------------------------------------------------------
-- 3. Configuracao operacional ajustavel sem deploy.
--    Cada imagem de referencia anexada vira token de entrada e custa
--    dinheiro, entao o teto precisa ser regulavel em producao.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  description text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key,value,description) values
 ('reference_images_max','2','Quantas imagens de referência da marca são anexadas a cada arte. Cada uma soma tokens de entrada no custo.'),
 ('reference_fidelity','high','Fidelidade de leitura da referência pela OpenAI: low é mais barato, high copia melhor o tratamento visual.')
on conflict(key) do nothing;

alter table public.app_settings enable row level security;
-- Sem policy: apenas o service_role enxerga. Nao e catalogo publico.
