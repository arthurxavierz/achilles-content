-- V16. Autopreenchimento do Brand Brain por leitura das imagens de referência.
--
-- O formulário em branco é o ponto de abandono do onboarding: a maioria dos
-- clientes não sabe descrever o próprio estilo. A saída é ler as peças que
-- ele já publica e propor o preenchimento, que ele revisa antes de salvar.
--
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.

-- ---------------------------------------------------------------------
-- 1. Preço.
--
-- A linha já existia desde a v5, a 300 créditos, planejada e nunca
-- implementada. Vai para 50, e o motivo é aritmética de onboarding: a conta
-- nova recebe 200 créditos, e 50 de análise + 50 de copy de post + 100 de
-- imagem padrão fecham exatamente 200. O cliente atravessa o fluxo inteiro,
-- do Brand Brain à primeira arte, sem tirar o cartão do bolso e sem sobrar
-- saldo solto que não dá para nada.
-- ---------------------------------------------------------------------
insert into public.pricing(slug,label,kind,credits,image_quality,description,sort_order) values
 ('brand_analysis','Análise de marca','analysis',50,null,
  'Lê as imagens de referência e propõe o preenchimento do Brand Brain.',6)
on conflict(slug) do update set
  label=excluded.label, kind=excluded.kind, credits=excluded.credits,
  description=excluded.description, sort_order=excluded.sort_order,
  active=true, updated_at=now();

-- ---------------------------------------------------------------------
-- 2. Quantas imagens entram na análise.
--
-- Custo de visão é por imagem, então este número é o que governa o gasto na
-- OpenAI. Fica em app_settings para ser ajustado sem deploy: se a análise
-- vier rasa, sobe; se o custo incomodar, desce.
-- ---------------------------------------------------------------------
insert into public.app_settings(key,value) values ('brand_autofill_images','4')
on conflict(key) do nothing;

-- ---------------------------------------------------------------------
-- 3. Fila da análise.
--
-- A leitura de quatro imagens com resposta estruturada de vinte e dois
-- campos passa dos dez segundos que a Netlify dá a uma função síncrona.
-- Então a análise roda como Background Function e o resultado espera aqui,
-- enquanto a tela pergunta se já ficou pronto.
--
-- O resultado NÃO é o Brand Brain: é sugestão. Nada disso vira perfil da
-- marca sem o cliente revisar e clicar em salvar.
-- ---------------------------------------------------------------------
create table if not exists public.brand_autofill_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued' check(status in ('queued','running','ready','failed')),
  images_used integer not null default 0,
  result jsonb,
  error text,
  -- Divisão da cobrança, no mesmo padrão das gerações: o estorno devolve a
  -- cada saldo o que saiu dele em vez de adivinhar plano contra avulso.
  charged_plan integer not null default 0,
  charged_extra integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists brand_autofill_jobs_user_idx
  on public.brand_autofill_jobs(user_id, created_at desc);

-- Sem policy: a tabela é lida e escrita apenas pelas funções, com a chave de
-- serviço. O cliente chega nela pela função de status, que confere o dono.
alter table public.brand_autofill_jobs enable row level security;
