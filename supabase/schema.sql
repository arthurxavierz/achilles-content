-- =====================================================================
-- Achilles Content V4. Schema completo e idempotente.
-- Pode ser executado em um projeto Supabase novo ou sobre uma base V3.
-- Rode este arquivo inteiro no SQL Editor. Ele pode ser reexecutado.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Perfis
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  role text not null default 'client' check(role in ('client','admin')),
  active boolean not null default true,
  credits_plan integer not null default 0 check(credits_plan >= 0),
  credits_extra integer not null default 0 check(credits_extra >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists credits_plan integer not null default 0;
alter table public.profiles add column if not exists credits_extra integer not null default 0;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Bases V3 tinham "credits" como coluna comum. V4 usa dois saldos e uma coluna gerada.
do $$ begin
  if exists(select 1 from information_schema.columns
            where table_schema='public' and table_name='profiles'
              and column_name='credits' and is_generated='NEVER') then
    update public.profiles set credits_extra = greatest(credits_extra, coalesce(credits,0));
    alter table public.profiles drop column credits;
  end if;
end $$;
alter table public.profiles add column if not exists credits integer generated always as (credits_plan + credits_extra) stored;

create index if not exists profiles_role_idx on public.profiles(role);

-- ---------------------------------------------------------------------
-- 2. Brand Brain
-- ---------------------------------------------------------------------
create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  brand_name text default '',
  segment text default '',
  audience text default '',
  tone text default '',
  primary_color text default '#D8AF58',
  secondary_color text default '#111111',
  typography text default '',
  briefing text default '',
  guardrails text default '',
  visual_rules text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.brand_profiles add column if not exists differentiators text default '';
alter table public.brand_profiles add column if not exists services text default '';
alter table public.brand_profiles add column if not exists default_cta text default '';
alter table public.brand_profiles add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------
-- 3. Geracoes
-- ---------------------------------------------------------------------
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  format text not null check(format in ('post','story','carousel')),
  theme text not null default '',
  status text not null default 'draft',
  copy_json jsonb,
  copy_cost integer not null default 0,
  image_cost integer not null default 0,
  image_count integer not null default 1,
  request_id text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz
);
alter table public.generations add column if not exists image_count integer not null default 1;
alter table public.generations add column if not exists request_id text;
alter table public.generations add column if not exists image_cost integer not null default 0;
alter table public.generations add column if not exists approved_at timestamptz;
alter table public.generations add column if not exists completed_at timestamptz;

create unique index if not exists generations_request_id_unique
  on public.generations(user_id,request_id) where request_id is not null;
create index if not exists generations_user_created_idx
  on public.generations(user_id, created_at desc);

do $$ begin
  alter table public.generations drop constraint if exists generations_status_check;
  alter table public.generations add constraint generations_status_check
    check(status in ('draft','copy_ready','copy_approved','processing','images_ready','failed'));
exception when duplicate_object then null; end $$;

create table if not exists public.generation_images (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null check(position > 0),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique(generation_id, position)
);

-- ---------------------------------------------------------------------
-- 4. Creditos
-- ---------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  admin_id uuid references public.profiles(id) on delete set null,
  amount integer not null,
  balance_after integer,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.credit_ledger add column if not exists admin_id uuid references public.profiles(id) on delete set null;
alter table public.credit_ledger add column if not exists kind text;
alter table public.credit_ledger add column if not exists bucket text;
alter table public.credit_ledger add column if not exists balance_plan_after integer;
alter table public.credit_ledger add column if not exists balance_extra_after integer;
alter table public.credit_ledger add column if not exists reference_id uuid;
create index if not exists credit_ledger_user_created_idx on public.credit_ledger(user_id, created_at desc);
create index if not exists credit_ledger_kind_created_idx on public.credit_ledger(kind, created_at desc);

create table if not exists public.credit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check(amount > 0),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists credit_requests_pending_idx on public.credit_requests(status, created_at desc);

-- ---------------------------------------------------------------------
-- 5. Planos, pacotes, assinaturas e pagamentos
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  price_cents integer not null check(price_cents >= 0), monthly_credits integer not null check(monthly_credits >= 0),
  features jsonb not null default '[]'::jsonb, limits jsonb not null default '{}'::jsonb,
  active boolean not null default true, sort_order integer not null default 0
);
insert into public.plans(slug,name,price_cents,monthly_credits,features,limits,sort_order) values
('essencial','Essencial',29700,300,'["300 créditos por mês","1 marca cadastrada","Histórico de 90 dias","Suporte por WhatsApp em horário comercial"]','{"brands":1,"history_days":90}',1),
('performance','Performance',59700,650,'["650 créditos por mês","3 marcas cadastradas","Histórico ilimitado","Suporte prioritário","Revisão de Brand Brain"]','{"brands":3,"history_days":null}',2),
('studio','Studio',119700,1400,'["1.400 créditos por mês","Marcas ilimitadas","Histórico ilimitado","Suporte prioritário","Revisão de Brand Brain","Atendimento dedicado"]','{"brands":null,"history_days":null}',3)
on conflict(slug) do update set name=excluded.name, price_cents=excluded.price_cents, monthly_credits=excluded.monthly_credits, features=excluded.features, limits=excluded.limits, sort_order=excluded.sort_order;

create table if not exists public.credit_packs (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  credits integer not null check(credits > 0), price_cents integer not null check(price_cents > 0),
  badge text, active boolean not null default true, sort_order integer not null default 0
);
insert into public.credit_packs(slug,name,credits,price_cents,badge,sort_order) values
('pack-25','25 créditos',25,2500,null,1),
('pack-50','50 créditos',50,5000,'Mais escolhido',2),
('pack-100','100 créditos',100,10000,null,3),
('pack-250','250 créditos',250,22500,'Melhor custo por crédito',4)
on conflict(slug) do update set name=excluded.name,credits=excluded.credits,price_cents=excluded.price_cents,badge=excluded.badge,sort_order=excluded.sort_order;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'active' check(status in ('active','past_due','cancelled','trialing')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now()+interval '1 month'),
  cancel_at_period_end boolean not null default false,
  next_plan_id uuid references public.plans(id),
  mp_preapproval_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- renewal_mode define quem responde pelo pagamento do proximo ciclo.
--   payment     = autoatendimento. Cada ciclo exige um pagamento aprovado novo.
--   manual      = cliente comercial. O admin cobra fora da plataforma.
--   preapproval = assinatura recorrente do Mercado Pago.
alter table public.subscriptions add column if not exists renewal_mode text not null default 'payment';
do $$ begin
  alter table public.subscriptions drop constraint if exists subscriptions_renewal_mode_check;
  alter table public.subscriptions add constraint subscriptions_renewal_mode_check
    check(renewal_mode in ('payment','manual','preapproval'));
exception when duplicate_object then null; end $$;
alter table public.subscriptions add column if not exists last_renewed_at timestamptz;
create unique index if not exists one_live_subscription_per_user
  on public.subscriptions(user_id) where status in ('active','trialing','past_due');

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('plan','credit_pack')),
  plan_id uuid references public.plans(id), pack_id uuid references public.credit_packs(id),
  amount_cents integer not null check(amount_cents >= 0),
  credits integer not null default 0 check(credits >= 0),
  status text not null default 'pending' check(status in ('pending','approved','rejected','refunded')),
  provider text not null default 'mercadopago',
  mp_preference_id text, mp_payment_id text unique,
  external_reference text unique not null default gen_random_uuid()::text,
  raw_payload jsonb, created_at timestamptz not null default now(), paid_at timestamptz
);
create index if not exists payments_pending_idx on public.payments(status, created_at desc);
create index if not exists payments_user_idx on public.payments(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Infraestrutura operacional
-- ---------------------------------------------------------------------
create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null unique references public.generations(id) on delete cascade,
  status text not null default 'queued' check(status in ('queued','processing','done','failed')),
  attempts integer not null default 0,
  done_count integer not null default 0, total_count integer not null default 1,
  charged_plan integer not null default 0, charged_extra integer not null default 0,
  last_error text, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now()
);
-- start_index permite regenerar uma peca isolada sem perder o total real da geracao.
alter table public.generation_jobs add column if not exists start_index integer not null default 0;
alter table public.generation_jobs add column if not exists updated_at timestamptz not null default now();
create index if not exists generation_jobs_open_idx on public.generation_jobs(status, created_at);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null, details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null, provider_event_id text, request_id text, payload jsonb,
  received_at timestamptz not null default now()
);
create table if not exists public.rate_limits (
  user_id uuid not null, window_start timestamptz not null, action text not null,
  hits integer not null default 0, primary key(user_id,window_start,action)
);
create index if not exists rate_limits_window_idx on public.rate_limits(window_start);

-- ---------------------------------------------------------------------
-- 7. Funcoes de credito
-- ---------------------------------------------------------------------
create or replace function public.spend_credits(p_user_id uuid,p_amount integer,p_reason text,p_reference_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pbal integer; ebal integer; take_plan integer; take_extra integer;
begin
 if p_amount is null or p_amount <= 0 then raise exception 'invalid amount'; end if;
 select credits_plan,credits_extra into pbal,ebal from public.profiles where id=p_user_id and active=true for update;
 if not found or pbal+ebal < p_amount then return jsonb_build_object('ok',false); end if;
 take_plan := least(pbal,p_amount); take_extra := p_amount-take_plan;
 update public.profiles set credits_plan=pbal-take_plan,credits_extra=ebal-take_extra where id=p_user_id;
 insert into public.credit_ledger(user_id,amount,balance_after,reason,kind,bucket,balance_plan_after,balance_extra_after,reference_id)
 values(p_user_id,-p_amount,(pbal-take_plan)+(ebal-take_extra),left(coalesce(p_reason,'consumption'),180),'consumption',
        case when take_extra>0 and take_plan>0 then null when take_plan>0 then 'plan' else 'extra' end,
        pbal-take_plan,ebal-take_extra,p_reference_id);
 return jsonb_build_object('ok',true,'spent_plan',take_plan,'spent_extra',take_extra,'balance_plan_after',pbal-take_plan,'balance_extra_after',ebal-take_extra);
end $$;

create or replace function public.grant_credits(p_user_id uuid,p_amount integer,p_reason text,p_admin_id uuid default null,p_bucket text default 'extra',p_kind text default 'admin_grant',p_reference_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pbal integer; ebal integer;
begin
 if p_amount is null or p_amount <= 0 or p_bucket not in ('plan','extra') then raise exception 'invalid grant'; end if;
 select credits_plan,credits_extra into pbal,ebal from public.profiles where id=p_user_id for update;
 if not found then raise exception 'profile not found'; end if;
 if p_bucket='plan' then pbal:=pbal+p_amount; else ebal:=ebal+p_amount; end if;
 update public.profiles set credits_plan=pbal,credits_extra=ebal where id=p_user_id;
 insert into public.credit_ledger(user_id,admin_id,amount,balance_after,reason,kind,bucket,balance_plan_after,balance_extra_after,reference_id)
 values(p_user_id,p_admin_id,p_amount,pbal+ebal,left(p_reason,180),p_kind,p_bucket,pbal,ebal,p_reference_id);
 return jsonb_build_object('balance_plan',pbal,'balance_extra',ebal,'balance',pbal+ebal);
end $$;

create or replace function public.refund_credits(p_user_id uuid,p_plan integer,p_extra integer,p_reason text,p_reference_id uuid default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare pbal integer; ebal integer; total integer;
begin
 select credits_plan,credits_extra into pbal,ebal from public.profiles where id=p_user_id for update;
 if not found then return false; end if;
 pbal:=pbal+greatest(coalesce(p_plan,0),0); ebal:=ebal+greatest(coalesce(p_extra,0),0);
 total:=greatest(coalesce(p_plan,0),0)+greatest(coalesce(p_extra,0),0);
 update public.profiles set credits_plan=pbal,credits_extra=ebal where id=p_user_id;
 if total>0 then
   insert into public.credit_ledger(user_id,amount,balance_after,reason,kind,bucket,balance_plan_after,balance_extra_after,reference_id)
   values(p_user_id,total,pbal+ebal,left(p_reason,180),'refund',null,pbal,ebal,p_reference_id);
 end if;
 return true;
end $$;

create or replace function public.check_rate_limit(p_user_id uuid,p_action text,p_limit integer default 10)
returns boolean language plpgsql security definer set search_path=public as $$
declare w timestamptz := date_trunc('minute',now()); n integer;
begin
 insert into public.rate_limits(user_id,window_start,action,hits) values(p_user_id,w,p_action,1)
 on conflict(user_id,window_start,action) do update set hits=public.rate_limits.hits+1 returning hits into n;
 return n <= p_limit;
end $$;

-- ---------------------------------------------------------------------
-- 8. Ciclo de assinatura
-- ---------------------------------------------------------------------
-- Renova o ciclo e concede os creditos do plano.
-- So renova quando alguem responde pelo pagamento do proximo ciclo:
-- 'manual' (o admin cobra fora da plataforma) ou 'preapproval' (recorrencia do MP).
-- Em 'payment' a renovacao depende de um novo pagamento aprovado, tratado no webhook.
create or replace function public.renew_plan_credits(p_subscription_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare s record; old_plan integer; new_amount integer;
begin
 select sub.*, p.monthly_credits as plan_monthly_credits into s
   from public.subscriptions sub join public.plans p on p.id=coalesce(sub.next_plan_id,sub.plan_id)
   where sub.id=p_subscription_id for update;
 if not found then return false; end if;
 if s.renewal_mode not in ('manual','preapproval') then return false; end if;

 select credits_plan into old_plan from public.profiles where id=s.user_id for update;
 if old_plan>0 then
   insert into public.credit_ledger(user_id,amount,balance_after,reason,kind,bucket,balance_plan_after,balance_extra_after)
   select s.user_id,-old_plan,credits_extra,'Expiração do ciclo anterior','expiration','plan',0,credits_extra
     from public.profiles where id=s.user_id;
 end if;
 new_amount:=s.plan_monthly_credits;
 update public.profiles set credits_plan=new_amount where id=s.user_id;
 update public.subscriptions
   set plan_id=coalesce(next_plan_id,plan_id), next_plan_id=null,
       current_period_start=current_period_end,
       current_period_end=greatest(current_period_end,now())+interval '1 month',
       last_renewed_at=now(), updated_at=now()
   where id=s.id;
 insert into public.credit_ledger(user_id,amount,balance_after,reason,kind,bucket,balance_plan_after,balance_extra_after)
 select s.user_id,new_amount,new_amount+credits_extra,'Créditos do novo ciclo','plan_grant','plan',new_amount,credits_extra
   from public.profiles where id=s.user_id;
 return true;
end $$;

-- Aplica o saldo de plano de um novo ciclo pago.
-- O saldo de plano nao acumula entre ciclos: o que sobrou expira e o novo valor entra.
-- Creditos avulsos nunca sao tocados.
create or replace function public.set_plan_credits(p_user_id uuid,p_amount integer,p_reason text,p_reference_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pbal integer; ebal integer;
begin
 if p_amount is null or p_amount < 0 then raise exception 'invalid amount'; end if;
 select credits_plan,credits_extra into pbal,ebal from public.profiles where id=p_user_id for update;
 if not found then raise exception 'profile not found'; end if;
 if pbal>0 then
   insert into public.credit_ledger(user_id,amount,balance_after,reason,kind,bucket,balance_plan_after,balance_extra_after,reference_id)
   values(p_user_id,-pbal,ebal,'Expiração do saldo do ciclo anterior','expiration','plan',0,ebal,p_reference_id);
 end if;
 update public.profiles set credits_plan=p_amount where id=p_user_id;
 if p_amount>0 then
   insert into public.credit_ledger(user_id,amount,balance_after,reason,kind,bucket,balance_plan_after,balance_extra_after,reference_id)
   values(p_user_id,p_amount,p_amount+ebal,left(coalesce(p_reason,'Créditos do plano'),180),'plan_grant','plan',p_amount,ebal,p_reference_id);
 end if;
 return jsonb_build_object('balance_plan',p_amount,'balance_extra',ebal,'balance',p_amount+ebal,'expired',greatest(pbal,0));
end $$;

-- Ciclo vencido sem pagamento novo. Expira apenas o saldo do plano.
-- Creditos avulsos nunca expiram.
create or replace function public.expire_plan_cycle(p_subscription_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare s record; old_plan integer;
begin
 select * into s from public.subscriptions where id=p_subscription_id for update;
 if not found then return false; end if;
 select credits_plan into old_plan from public.profiles where id=s.user_id for update;
 if old_plan>0 then
   update public.profiles set credits_plan=0 where id=s.user_id;
   insert into public.credit_ledger(user_id,amount,balance_after,reason,kind,bucket,balance_plan_after,balance_extra_after)
   select s.user_id,-old_plan,credits_extra,'Ciclo encerrado sem renovação','expiration','plan',0,credits_extra
     from public.profiles where id=s.user_id;
 end if;
 update public.subscriptions set status='past_due', updated_at=now() where id=s.id;
 return true;
end $$;

-- ---------------------------------------------------------------------
-- 9. Manutencao
-- ---------------------------------------------------------------------
create or replace function public.purge_rate_limits()
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 delete from public.rate_limits where window_start < now() - interval '2 hours';
 get diagnostics n = row_count; return n;
end $$;

create or replace function public.purge_webhook_events(p_days integer default 90)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 delete from public.webhook_events where received_at < now() - make_interval(days => greatest(p_days,7));
 get diagnostics n = row_count; return n;
end $$;

-- ---------------------------------------------------------------------
-- 10. Permissoes das funcoes. Somente o service_role executa.
-- ---------------------------------------------------------------------
revoke all on function public.spend_credits(uuid,integer,text,uuid) from public,anon,authenticated;
revoke all on function public.grant_credits(uuid,integer,text,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.refund_credits(uuid,integer,integer,text,uuid) from public,anon,authenticated;
revoke all on function public.check_rate_limit(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.renew_plan_credits(uuid) from public,anon,authenticated;
revoke all on function public.expire_plan_cycle(uuid) from public,anon,authenticated;
revoke all on function public.set_plan_credits(uuid,integer,text,uuid) from public,anon,authenticated;
revoke all on function public.purge_rate_limits() from public,anon,authenticated;
revoke all on function public.purge_webhook_events(integer) from public,anon,authenticated;
grant execute on function public.spend_credits(uuid,integer,text,uuid) to service_role;
grant execute on function public.grant_credits(uuid,integer,text,uuid,text,text,uuid) to service_role;
grant execute on function public.refund_credits(uuid,integer,integer,text,uuid) to service_role;
grant execute on function public.check_rate_limit(uuid,text,integer) to service_role;
grant execute on function public.renew_plan_credits(uuid) to service_role;
grant execute on function public.expire_plan_cycle(uuid) to service_role;
grant execute on function public.set_plan_credits(uuid,integer,text,uuid) to service_role;
grant execute on function public.purge_rate_limits() to service_role;
grant execute on function public.purge_webhook_events(integer) to service_role;

-- ---------------------------------------------------------------------
-- 11. RLS. O cliente le apenas o que e dele. Escritas passam pelas Functions.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.generations enable row level security;
alter table public.generation_images enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.credit_requests enable row level security;
alter table public.plans enable row level security;
alter table public.credit_packs enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.webhook_events enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using(id=auth.uid());
drop policy if exists brand_self_read on public.brand_profiles;
create policy brand_self_read on public.brand_profiles for select to authenticated using(user_id=auth.uid());
drop policy if exists generations_self_read on public.generations;
create policy generations_self_read on public.generations for select to authenticated using(user_id=auth.uid());
drop policy if exists generation_images_self_read on public.generation_images;
create policy generation_images_self_read on public.generation_images for select to authenticated using(user_id=auth.uid());
drop policy if exists ledger_self_read on public.credit_ledger;
create policy ledger_self_read on public.credit_ledger for select to authenticated using(user_id=auth.uid());
drop policy if exists credit_requests_self_read on public.credit_requests;
create policy credit_requests_self_read on public.credit_requests for select to authenticated using(user_id=auth.uid());
drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select using(active=true);
drop policy if exists packs_read on public.credit_packs;
create policy packs_read on public.credit_packs for select using(active=true);
drop policy if exists subscriptions_self_read on public.subscriptions;
create policy subscriptions_self_read on public.subscriptions for select to authenticated using(user_id=auth.uid());
drop policy if exists payments_self_read on public.payments;
create policy payments_self_read on public.payments for select to authenticated using(user_id=auth.uid());
drop policy if exists jobs_self_read on public.generation_jobs;
create policy jobs_self_read on public.generation_jobs for select to authenticated
  using(generation_id in(select id from public.generations where user_id=auth.uid()));
-- admin_audit_log, webhook_events e rate_limits ficam sem policy.
-- Com RLS ligada e nenhuma policy, apenas o service_role enxerga.

-- ---------------------------------------------------------------------
-- 12. Storage privado das artes
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('generation-assets','generation-assets', false)
on conflict (id) do update set public=false;

-- ---------------------------------------------------------------------
-- 13. Provisionamento de novo usuario
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 -- Comeca zerado de proposito. Quem concede credito inicial e o painel
 -- (admin-create-client), com registro no ledger e no audit log.
 insert into public.profiles(id,email,full_name,role,credits_plan,credits_extra,active)
 values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''),'client',0,0,true)
 on conflict(id) do nothing;
 insert into public.brand_profiles(user_id,brand_name)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''))
 on conflict(user_id) do nothing;
 return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 14. Promova o primeiro administrador trocando o e-mail abaixo.
--     update public.profiles set role='admin' where email='voce@empresa.com.br';
-- ---------------------------------------------------------------------
