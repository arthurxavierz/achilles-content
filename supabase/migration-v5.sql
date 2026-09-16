-- =====================================================================
-- Achilles Content V5. Economia de creditos, direcao de arte e PIX manual.
-- Rode DEPOIS de supabase/schema.sql. E idempotente: pode rodar de novo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela de precos. Fonte unica de verdade do custo em creditos.
--    Reajuste aqui, sem deploy. O backend le desta tabela.
-- ---------------------------------------------------------------------
create table if not exists public.pricing (
  slug text primary key,
  label text not null,
  kind text not null check(kind in ('copy','image','analysis')),
  credits integer not null check(credits >= 0),
  -- Parametros repassados a OpenAI. So fazem sentido para kind='image'.
  image_quality text check(image_quality in ('low','medium','high')),
  description text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.pricing(slug,label,kind,credits,image_quality,description,sort_order) values
 ('copy_post','Copy de post','copy',50,null,'Uma peça com headline, legenda e hashtags.',1),
 ('copy_story','Copy de story','copy',50,null,'Uma peça vertical com headline e apoio.',2),
 ('copy_carousel','Copy de carrossel','copy',150,null,'Cinco slides encadeados mais legenda.',3),
 ('image_standard','Imagem Padrão','image',100,'medium','Arte de fundo em qualidade de publicação.',4),
 ('image_signature','Imagem Assinatura','image',300,'high','Máxima fidelidade, direção de arte guiada por referências.',5),
 ('brand_analysis','Análise de marca','analysis',300,null,'Leitura do perfil e preenchimento assistido do Brand Brain.',6)
on conflict(slug) do update set
  label=excluded.label, kind=excluded.kind, credits=excluded.credits,
  image_quality=excluded.image_quality, description=excluded.description,
  sort_order=excluded.sort_order, updated_at=now();

-- ---------------------------------------------------------------------
-- 2. Presets de direcao de arte.
--    O preset e um bloco fixo de prompt. A marca entra como variavel.
--    E isso que separa "imagem de IA" de "arte com assinatura".
-- ---------------------------------------------------------------------
create table if not exists public.art_presets (
  slug text primary key,
  name text not null,
  summary text not null default '',
  prompt_block text not null,
  active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.art_presets(slug,name,summary,prompt_block,sort_order) values
 ('editorial','Editorial','Revista premium, muito respiro, tipografia protagonista.',
  'Fotografia editorial de revista premium. Luz natural difusa vinda de uma janela ampla, sombras longas e suaves. Composição assimétrica com amplo espaço negativo no terço superior. Paleta contida, no máximo três tons. Textura de papel fine art sutil. Profundidade de campo média, lente 50mm, f/2.8. Sem saturação exagerada.',1),
 ('cinematic','Cinematográfico','Contraste alto, luz dramática, clima de cinema.',
  'Still de cinema em formato anamórfico. Iluminação de baixa chave com uma fonte principal lateral dura e preenchimento mínimo. Névoa atmosférica leve capturando o feixe de luz. Gradação de cor teal e âmbar contida. Grão de filme 35mm perceptível. Lente 85mm, f/1.8, bokeh cremoso.',2),
 ('luxo','Luxo Quente','Superfícies nobres, dourado, sensação de alto padrão.',
  'Fotografia de produto de alto padrão. Superfícies nobres: mármore acetinado, latão escovado, veludo profundo. Iluminação quente e rasante que revela textura. Reflexos controlados, sem estouro de brilho. Paleta âmbar e preto profundo. Lente macro 100mm, foco preciso, fundo em queda suave.',3),
 ('dark_tech','Dark Tech','Escuro, geométrico, tecnológico e limpo.',
  'Cena tridimensional minimalista em ambiente escuro. Geometria limpa e precisa, superfícies foscas com uma única linha de luz de borda. Iluminação volumétrica fria e discreta. Gradiente de fundo quase preto. Renderização fisicamente correta, alta nitidez, sem elementos decorativos supérfluos.',4),
 ('natural','Luz Natural','Real, humano, sem parecer banco de imagens.',
  'Fotografia documental de luz natural. Momento real, não posado, com imperfeições verdadeiras. Luz de janela na hora dourada, sombras orgânicas. Cores fiéis e levemente dessaturadas. Lente 35mm, f/2.0, leve movimento capturado. Nada que lembre banco de imagens genérico.',5),
 ('vitrine','Vitrine 3D','Objeto em destaque, fundo limpo, feito para converter.',
  'Composição tridimensional de vitrine. Objeto principal centralizado sobre pedestal simples, fundo em cor sólida com gradiente suave. Iluminação de estúdio em três pontos com sombra de contato definida. Materiais realistas, cor saturada de forma controlada. Alta definição, bordas limpas.',6)
on conflict(slug) do update set
  name=excluded.name, summary=excluded.summary, prompt_block=excluded.prompt_block, sort_order=excluded.sort_order;

-- ---------------------------------------------------------------------
-- 3. Custo real por geracao. Sem isto a margem e fe, nao numero.
-- ---------------------------------------------------------------------
alter table public.generations add column if not exists image_quality text;
alter table public.generations add column if not exists preset_slug text;
alter table public.generations add column if not exists art_direction jsonb;
alter table public.generations add column if not exists cost_usd numeric(12,6) not null default 0;

alter table public.generation_images add column if not exists cost_usd numeric(12,6) not null default 0;
alter table public.generation_images add column if not exists quality text;
alter table public.generation_images add column if not exists prompt text;

alter table public.generation_jobs add column if not exists image_quality text;
alter table public.generation_jobs add column if not exists credits_each integer not null default 0;

create index if not exists generations_cost_idx on public.generations(created_at desc) where cost_usd > 0;

-- Soma atomica de custo. Chamada a cada imagem concluida.
create or replace function public.add_generation_cost(p_generation_id uuid, p_cost numeric)
returns numeric language plpgsql security definer set search_path=public as $$
declare total numeric;
begin
  update public.generations set cost_usd = cost_usd + greatest(coalesce(p_cost,0),0)
   where id = p_generation_id returning cost_usd into total;
  return coalesce(total,0);
end $$;
revoke all on function public.add_generation_cost(uuid,numeric) from public,anon,authenticated;
grant execute on function public.add_generation_cost(uuid,numeric) to service_role;

-- ---------------------------------------------------------------------
-- 4. Brand Brain ampliado. Referencia visual e preset padrao da marca.
-- ---------------------------------------------------------------------
alter table public.brand_profiles add column if not exists instagram_handle text default '';
alter table public.brand_profiles add column if not exists references_text text default '';
alter table public.brand_profiles add column if not exists preset_slug text default 'editorial';
alter table public.brand_profiles add column if not exists forbidden_terms text default '';

-- ---------------------------------------------------------------------
-- 5. PIX manual. Cobranca emitida pelo sistema, conciliacao pelo admin.
-- ---------------------------------------------------------------------
do $$ begin
  alter table public.payments drop constraint if exists payments_provider_check;
  alter table public.payments add constraint payments_provider_check
    check(provider in ('mercadopago','pix_manual'));
exception when duplicate_object then null; end $$;
alter table public.payments alter column provider set default 'pix_manual';
alter table public.payments add column if not exists pix_payload text;
alter table public.payments add column if not exists pix_txid text;
alter table public.payments add column if not exists expires_at timestamptz;
alter table public.payments add column if not exists note text;
create index if not exists payments_provider_status_idx on public.payments(provider, status, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Planos e pacotes da V5.
--    Precos calculados para margem minima de 60% no pior caso de uso
--    (100% do saldo gasto em Imagem Assinatura vertical).
-- ---------------------------------------------------------------------
update public.plans set active=false where slug in ('essencial','performance');

insert into public.plans(slug,name,price_cents,monthly_credits,features,limits,sort_order,active) values
 ('starter','Starter',14700,7500,
  '["7.500 créditos por mês","Até 75 copies ou 75 artes padrão","1 marca no Brand Brain","Histórico de 90 dias","Suporte por WhatsApp"]',
  '{"brands":1,"history_days":90,"signature_images":true}',1,true),
 ('pro','Pro',29700,20000,
  '["20.000 créditos por mês","Cerca de 36 carrosséis completos","3 marcas no Brand Brain","Histórico ilimitado","Imagem Assinatura liberada","Suporte prioritário"]',
  '{"brands":3,"history_days":null,"signature_images":true}',2,true),
 ('studio','Studio',59700,45000,
  '["45.000 créditos por mês","Cerca de 80 carrosséis completos","Marcas ilimitadas","Histórico ilimitado","Revisão de Brand Brain pela equipe","Suporte prioritário"]',
  '{"brands":null,"history_days":null,"signature_images":true}',3,true),
 ('agencia','Agência',119700,100000,
  '["100.000 créditos por mês","Volume de operação de agência","Marcas ilimitadas","Histórico ilimitado","Direção de arte dedicada","Atendimento nomeado"]',
  '{"brands":null,"history_days":null,"signature_images":true}',4,true)
on conflict(slug) do update set
  name=excluded.name, price_cents=excluded.price_cents, monthly_credits=excluded.monthly_credits,
  features=excluded.features, limits=excluded.limits, sort_order=excluded.sort_order, active=true;

-- Pacotes avulsos custam mais por credito que o plano. O desconto e a recorrencia.
update public.credit_packs set active=false where slug in ('pack-25','pack-50','pack-100','pack-250');

insert into public.credit_packs(slug,name,credits,price_cents,badge,sort_order,active) values
 ('avulso-2k','2.000 créditos',2000,5900,null,1,true),
 ('avulso-5k','5.000 créditos',5000,12900,'Mais escolhido',2,true),
 ('avulso-12k','12.000 créditos',12000,27900,null,3,true),
 ('avulso-30k','30.000 créditos',30000,64900,'Melhor custo',4,true)
on conflict(slug) do update set
  name=excluded.name, credits=excluded.credits, price_cents=excluded.price_cents,
  badge=excluded.badge, sort_order=excluded.sort_order, active=true;

-- ---------------------------------------------------------------------
-- 7. Cortesia de entrada: 200 creditos para todo cadastro novo.
--    Da para uma copy e uma arte padrao. Custo real de aquisicao ~R$0,40.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare bonus integer := 200; created boolean := false;
begin
 insert into public.profiles(id,email,full_name,role,credits_plan,credits_extra,active)
 values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''),'client',0,bonus,true)
 on conflict(id) do nothing;
 -- FOUND diz se a linha entrou de verdade. Se o perfil ja existia, o saldo
 -- nao foi somado, entao o extrato tambem nao pode registrar a cortesia.
 created := FOUND;

 insert into public.brand_profiles(user_id,brand_name)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''))
 on conflict(user_id) do nothing;

 if created then
   insert into public.credit_ledger(user_id,amount,balance_after,reason,kind,bucket,balance_plan_after,balance_extra_after)
   values(new.id,bonus,bonus,'Créditos de cortesia da Achilles','admin_grant','extra',0,bonus);
 end if;
 return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 8. Margem. Receita aprovada contra custo real de API, por mes.
-- ---------------------------------------------------------------------
create or replace view public.admin_margin_month as
with receita as (
  select date_trunc('month', paid_at) as mes, sum(amount_cents)::bigint as receita_cents
    from public.payments where status='approved' and paid_at is not null
   group by 1
), custo as (
  select date_trunc('month', created_at) as mes, sum(cost_usd)::numeric as custo_usd
    from public.generations group by 1
)
select coalesce(r.mes,c.mes) as mes,
       coalesce(r.receita_cents,0) as receita_cents,
       coalesce(c.custo_usd,0) as custo_usd
  from receita r full outer join custo c on c.mes=r.mes
 order by 1 desc;

-- Custo real por cliente no mes corrente. Serve para achar quem da prejuizo.
create or replace view public.admin_margin_client as
select g.user_id,
       count(*) filter (where g.status='images_ready') as entregas,
       sum(g.cost_usd)::numeric as custo_usd,
       sum(g.copy_cost + g.image_cost)::bigint as creditos_consumidos
  from public.generations g
 where g.created_at >= date_trunc('month', now())
 group by g.user_id;

-- ---------------------------------------------------------------------
-- 9. RLS das tabelas novas. Catalogo e publico. O resto so o service_role.
-- ---------------------------------------------------------------------
alter table public.pricing enable row level security;
alter table public.art_presets enable row level security;
drop policy if exists pricing_read on public.pricing;
create policy pricing_read on public.pricing for select using(active=true);
drop policy if exists art_presets_read on public.art_presets;
create policy art_presets_read on public.art_presets for select using(active=true);

-- As views nao devem ser expostas ao cliente. So o service_role consulta.
revoke all on public.admin_margin_month from anon, authenticated;
revoke all on public.admin_margin_client from anon, authenticated;
