-- V15. Destaque do plano na vitrine, e o suporte que cada plano realmente tem.
--
-- A landing marcava um plano como o mais escolhido, mas a marcacao so existia
-- no arquivo de defaults do front. Assim que a API respondia, ela sumia: a
-- tabela de planos nao tinha coluna de selo, e o normalizador nao carregava
-- nenhum. Ou seja, em producao o destaque nunca apareceu.
--
-- O mesmo vale para o suporte. A landing imprimia "Suporte: Prioritario" para
-- todo plano, porque o campo nao existia e o codigo caia no valor padrao.
-- Isso e promessa de pagina de preco, entao vai para o banco com o que cada
-- plano oferece de verdade.
--
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.

alter table public.plans add column if not exists badge text;
alter table public.plans add column if not exists support text;

update public.plans
   set badge = case when slug = 'starter' then 'MAIS SOLICITADO' else null end;

update public.plans
   set support = case slug
     when 'starter'  then 'WhatsApp em horário comercial'
     when 'pro'      then 'Prioritário'
     when 'studio'   then 'Prioritário, com revisão de Brand Brain'
     when 'agencia'  then 'Atendimento nomeado'
     else support
   end
 where slug in ('starter', 'pro', 'studio', 'agencia');
