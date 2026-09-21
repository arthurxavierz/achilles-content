-- =====================================================================
-- Achilles Content V10. Texto na arte deixa de ser regra fixa.
-- Rode DEPOIS de migration-v9.sql. E idempotente.
--
-- Motivo: o prompt proibia qualquer caractere legivel na imagem, partindo
-- da premissa de que a tipografia entraria numa camada de composicao. Essa
-- camada nao existe no produto, e marca com identidade grafica forte tem o
-- titulo como parte da arte. A proibicao passa a ser escolha.
-- =====================================================================

-- Padrao da marca. O estudio herda daqui e pode mudar em cada geracao.
alter table public.brand_profiles add column if not exists render_text boolean not null default false;

-- O que valeu naquela geracao, para o historico e a regeneracao baterem.
alter table public.generations add column if not exists render_text boolean not null default false;
alter table public.generation_jobs add column if not exists render_text boolean not null default false;

-- Orientacao de tipografia usada quando o texto entra na arte. Fica
-- separada de visual_rules porque so se aplica nesse modo.
alter table public.brand_profiles add column if not exists text_style text default '';

update public.brand_profiles
   set text_style = 'Tipografia condensada pesada em caixa alta. Título em branco com uma palavra destacada na cor principal da marca. Subtítulo menor, peso regular, logo abaixo do título.'
 where coalesce(text_style,'') = '';
