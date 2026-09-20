-- =====================================================================
-- Achilles Content V8. Formato das pecas ajustavel.
-- Rode DEPOIS de migration-v7.sql. E idempotente.
--
-- Motivo: o feed saia em 1024x1024 enquanto a regra de marca pedia 4:5.
-- O gpt-image-1 nao tem 4:5 nativo, entao geramos em 2:3 (mais alto) e o
-- recorte final para 4:5 acontece na composicao, com margem de seguranca.
-- =====================================================================

insert into public.app_settings(key,value,description) values
 ('feed_image_size','1024x1536','Tamanho pedido a OpenAI para post e carrossel. Aceita 1024x1024, 1024x1536 ou 1536x1024.'),
 ('story_image_size','1024x1536','Tamanho pedido a OpenAI para story.'),
 ('feed_safe_crop','4:5','Proporcao final do feed. Entra no prompt como area de seguranca do recorte. Deixe vazio para desligar.')
on conflict(key) do nothing;
