-- =====================================================================
-- Achilles Content V9. Modelo de imagem por faixa e formato nativo 4:5.
-- Rode DEPOIS de migration-v8.sql. E idempotente.
--
-- Motivo: o sistema usava gpt-image-1 para tudo, que e hoje o modelo de
-- imagem mais caro do catalogo da OpenAI ($10/$40 por milhao de tokens).
-- A familia 2.5 custa $8/$30, gera melhor e aceita dimensao customizada,
-- o que elimina o recorte para 4:5.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. As faixas novas de qualidade do 2.5 (xhigh e max).
-- ---------------------------------------------------------------------
do $$ begin
  alter table public.pricing drop constraint if exists pricing_image_quality_check;
  alter table public.pricing add constraint pricing_image_quality_check
    check(image_quality is null or image_quality in ('low','medium','high','xhigh','max','auto'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Cada faixa de preco escolhe o seu modelo.
--    Antes havia um unico OPENAI_IMAGE_MODEL no ambiente, o que obrigava
--    Padrao e Assinatura a usarem o mesmo motor.
-- ---------------------------------------------------------------------
alter table public.pricing add column if not exists openai_model text;

update public.pricing
   set openai_model='gpt-image-2.5-flare', image_quality='medium', updated_at=now()
 where slug='image_standard';

-- Sunburst e a variante de precisao: melhor fidelidade a referencia e
-- edicao mais controlada. E o que reproduz mascote e tratamento visual.
update public.pricing
   set openai_model='gpt-image-2.5-sunburst', image_quality='high', updated_at=now()
 where slug='image_signature';

-- A geracao carrega o modelo usado, para o historico nao mentir depois de
-- uma troca de catalogo.
alter table public.generation_jobs add column if not exists openai_model text;
alter table public.generations add column if not exists openai_model text;
alter table public.generation_images add column if not exists openai_model text;

-- ---------------------------------------------------------------------
-- 3. Formato nativo. O 2.5 aceita WIDTHxHEIGHT com lados multiplos de 16,
--    proporcao entre 1:3 e 3:1 e area entre 655.360 e 8.294.400 pixels.
--    1024x1280 e 4:5 exato. 1152x2048 e 9:16 exato.
--    Com formato nativo o recorte deixa de existir, entao feed_safe_crop sai.
-- ---------------------------------------------------------------------
update public.app_settings set value='1024x1280', updated_at=now() where key='feed_image_size';
update public.app_settings set value='1152x2048', updated_at=now() where key='story_image_size';
update public.app_settings set value='', updated_at=now() where key='feed_safe_crop';

insert into public.app_settings(key,value,description) values
 ('image_model_fallback','gpt-image-2.5-flare','Modelo usado quando a faixa de preço não define um. Só vale se a coluna pricing.openai_model estiver vazia.')
on conflict(key) do nothing;
