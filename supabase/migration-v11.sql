-- =====================================================================
-- Achilles Content V11. Guardrails saem do codigo, cadastro proprio e
-- limite de contas por dispositivo.
-- Rode DEPOIS de migration-v10.sql. E idempotente.
--
-- Motivo: o sistema impunha gosto proprio em regra fixa de codigo.
-- "Nada de emoji", "legenda de tres a cinco frases", "quatro a oito
-- hashtags", "nada de colagem nem moldura" eram lei, e nenhum campo do
-- Brand Brain conseguia derrubar. Passam a ser padrao editavel: a
-- plataforma sugere, a marca decide. O unico limite que fica de pe e o
-- de conteudo da propria OpenAI.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Padroes da plataforma, ajustaveis por SQL, sem deploy.
-- ---------------------------------------------------------------------
insert into public.app_settings(key,value,description) values
 ('copy_style_default',
  'Headline curta, específica e sem promessa vazia. Cada título de slide cabe em duas linhas na tela de um celular. O subtítulo sustenta o título com um argumento concreto, não com adjetivo. A legenda começa pelo problema do leitor e fecha com o CTA da marca. Hashtags específicas do segmento, sem repetir palavra da headline. Sem emoji e sem travessão longo.',
  'Estilo de escrita sugerido. Vale quando a marca não preencheu regras próprias de copy.'),
 ('image_style_default',
  'Acabamento de publicidade, alta definição, sem estética genérica de banco de imagens.',
  'Acabamento de imagem sugerido. Vale quando a marca não preencheu regras próprias de arte.')
on conflict(key) do nothing;

-- ---------------------------------------------------------------------
-- 2. A marca sobrescreve o padrao por inteiro quando quiser.
-- ---------------------------------------------------------------------
alter table public.brand_profiles add column if not exists copy_rules text default '';
alter table public.brand_profiles add column if not exists image_rules text default '';

-- ---------------------------------------------------------------------
-- 3. Cadastro proprio com limite por dispositivo.
--    Sem pedir telefone nem confirmar e-mail: o atrito fica no pagamento,
--    nao na porta de entrada. O limite existe so para a cortesia de 200
--    creditos nao virar fabrica de contas descartaveis.
-- ---------------------------------------------------------------------
create table if not exists public.signup_attempts (
  id uuid primary key default gen_random_uuid(),
  -- Identificador gerado no navegador e guardado em localStorage.
  device_id text not null,
  -- Hash de IP + user agent. Nunca guardamos o IP em claro.
  network_hash text not null,
  user_id uuid references public.profiles(id) on delete set null,
  email text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists signup_attempts_device_idx on public.signup_attempts(device_id, created_at desc);
create index if not exists signup_attempts_network_idx on public.signup_attempts(network_hash, created_at desc);

alter table public.signup_attempts enable row level security;
-- Sem policy: so o service_role enxerga. O cadastro passa por uma Function.

insert into public.app_settings(key,value,description) values
 ('signup_max_per_device','3','Quantas contas o mesmo dispositivo pode criar. Zero desliga o limite.'),
 ('signup_max_per_network','8','Quantas contas a mesma rede pode criar na janela abaixo. Protege contra localStorage limpo. Zero desliga.'),
 ('signup_window_days','30','Janela de contagem dos dois limites acima, em dias.'),
 ('signup_open','true','Cadastro público aberto. Coloque false para fechar a porta sem derrubar o site.')
on conflict(key) do nothing;

-- Conta as contas criadas na janela e diz se o cadastro pode seguir.
-- Fica no banco, e nao na Function, para a contagem ser atomica.
create or replace function public.check_signup_quota(p_device_id text, p_network_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  max_device integer; max_network integer; win integer;
  used_device integer; used_network integer; since timestamptz;
begin
  select coalesce((select value::integer from public.app_settings where key='signup_max_per_device'),3) into max_device;
  select coalesce((select value::integer from public.app_settings where key='signup_max_per_network'),8) into max_network;
  select coalesce((select value::integer from public.app_settings where key='signup_window_days'),30) into win;
  since := now() - make_interval(days => greatest(win,1));

  select count(*) into used_device from public.signup_attempts
   where device_id = p_device_id and created_at >= since;
  select count(*) into used_network from public.signup_attempts
   where network_hash = p_network_hash and created_at >= since;

  if max_device > 0 and used_device >= max_device then
    return jsonb_build_object('ok',false,'reason','device','used',used_device,'max',max_device);
  end if;
  if max_network > 0 and used_network >= max_network then
    return jsonb_build_object('ok',false,'reason','network','used',used_network,'max',max_network);
  end if;
  return jsonb_build_object('ok',true,'used_device',used_device,'used_network',used_network);
end $$;

revoke all on function public.check_signup_quota(text,text) from public,anon,authenticated;
grant execute on function public.check_signup_quota(text,text) to service_role;

-- ---------------------------------------------------------------------
-- 4. Visao de contas para o admin. Saldo, consumo e entregas por pessoa,
--    numa consulta so, em vez de uma por cliente.
-- ---------------------------------------------------------------------
create or replace view public.admin_accounts as
select
  p.id, p.email, p.full_name, p.role, p.active, p.created_at,
  p.credits_plan, p.credits_extra, p.credits,
  pl.name as plan_name, pl.slug as plan_slug, s.status as subscription_status,
  coalesce(g.total,0) as generations,
  coalesce(g.delivered,0) as delivered,
  coalesce(g.cost_usd,0) as cost_usd,
  coalesce(g.last_at, p.created_at) as last_activity
from public.profiles p
left join public.subscriptions s
  on s.user_id = p.id and s.status in ('active','trialing','past_due')
left join public.plans pl on pl.id = s.plan_id
left join (
  select user_id,
         count(*) as total,
         count(*) filter (where status='images_ready') as delivered,
         sum(cost_usd) as cost_usd,
         max(created_at) as last_at
    from public.generations group by user_id
) g on g.user_id = p.id;

revoke all on public.admin_accounts from anon, authenticated;
