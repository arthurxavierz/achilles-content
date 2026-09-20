-- =====================================================================
-- Achilles Content V6. Preset de marca e ajuste de direcao de arte.
-- Rode DEPOIS de migration-v5.sql. E idempotente.
--
-- Motivo: os presets da V5 eram todos de fotografia sobria. Marca com
-- identidade grafica forte (fundo saturado, render 3D, HUD, mascote) nao
-- cabia em nenhum deles, e o preset acabava sequestrando a peca.
-- =====================================================================

insert into public.art_presets(slug,name,summary,prompt_block,sort_order) values
 ('gold_tech','Dourado Tech','Render 3D em fundo dourado, HUD e glow. Feito para marca de tecnologia.',
  'Render tridimensional cinematográfico em paleta dourada praticamente monocromática. Fundo âmbar saturado com iluminação volumétrica forte, glow intenso, partículas de luz suspensas e profundidade real com desfoque ao fundo. Painéis de interface futurista translúcidos flutuando no espaço: gráficos de barras, anéis de progresso, ícones de linha, circuitos e trilhas de dados luminosas em branco e dourado, sempre sem rótulo escrito. Superfícies polidas de alto brilho com reflexos controlados e sombras profundas. Assunto principal em primeiro plano, nítido, ocupando o centro ou a direita do quadro, com área livre e de contraste uniforme no topo à esquerda. Acabamento de publicidade, alta definição, nada de estética de banco de imagens.',7),

 ('grafite_tech','Grafite Tech','A mesma linguagem do Dourado Tech, em fundo escuro.',
  'Render tridimensional cinematográfico em fundo grafite quase preto, com um único tom de destaque saturado. Iluminação volumétrica fria e direcional, linhas de luz de borda marcando as arestas, névoa sutil dando profundidade. Painéis de interface futurista translúcidos, circuitos e trilhas de dados luminosas, sempre sem rótulo escrito. Superfícies foscas com reflexo especular controlado. Assunto principal nítido em primeiro plano, amplo espaço negativo em uma das metades do quadro. Acabamento de publicidade, alta definição.',8)
on conflict(slug) do update set
  name=excluded.name, summary=excluded.summary,
  prompt_block=excluded.prompt_block, sort_order=excluded.sort_order, active=true;

-- ---------------------------------------------------------------------
-- Campo novo: elementos que se repetem em toda peca da marca.
-- O mascote e os motivos graficos moram aqui, separados das regras de
-- composicao, para entrarem no prompt como lista e nao como paragrafo.
-- ---------------------------------------------------------------------
alter table public.brand_profiles add column if not exists recurring_elements text default '';
