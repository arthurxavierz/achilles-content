// Os campos do Brand Brain, num lugar só.
//
// Esta lista é a fonte de verdade para três coisas que precisam concordar:
// o schema JSON que a análise de imagem exige do modelo, a validação no
// servidor antes de devolver, e os rótulos que o formulário mostra. Quando
// as três viviam separadas, acrescentar um campo significava lembrar de
// mexer em três arquivos, e esquecer um deles não quebrava nada — só fazia
// o campo novo nunca ser preenchido pela análise.
//
// `max` é o mesmo limite que save-brand aplica. `tier` é o teto de confiança
// que a análise pode alegar naquele campo, e vai no prompt:
//
//   high   - sai direto do pixel: cor, tipografia, elementos recorrentes.
//   medium - inferência a partir do nicho, da região e da linguagem das
//            legendas: público, tom, CTA, regras de escrita.
//   low    - não se determina por imagem nenhuma: preço, prazo, garantia,
//            serviço que a peça não mostra. Vira pergunta ao cliente.

export const BRAND_FIELDS = Object.freeze([
  { key: 'brand_name',        label: 'Nome da marca',              kind: 'text',    max: 160,  tier: 'high',   hint: 'Como o nome aparece no logo ou no @ do perfil.' },
  { key: 'segment',           label: 'Segmento',                   kind: 'text',    max: 200,  tier: 'high',   hint: 'O ramo que as peças deixam evidente.' },
  { key: 'instagram_handle',  label: 'Perfil no Instagram',        kind: 'text',    max: 120,  tier: 'high',   hint: 'O @ só se estiver escrito em alguma peça.' },
  { key: 'typography',        label: 'Tipografia',                 kind: 'text',    max: 300,  tier: 'high',   hint: 'Famílias e pesos observados: condensada pesada, serifada fina, etc.' },
  { key: 'primary_color',     label: 'Cor principal',              kind: 'color',   max: 20,   tier: 'high',   hint: 'Hex da cor que domina as peças.' },
  { key: 'secondary_color',   label: 'Cor secundária',             kind: 'color',   max: 20,   tier: 'high',   hint: 'Hex da cor de apoio ou do fundo.' },
  { key: 'preset_slug',       label: 'Direção visual',             kind: 'preset',  max: 60,   tier: 'high',   hint: 'O preset cujo clima mais se aproxima das peças.' },
  { key: 'recurring_elements',label: 'Elementos recorrentes',      kind: 'text',    max: 3000, tier: 'high',   hint: 'O que aparece em toda peça: mascote, moldura, textura, tipo de interface.' },
  { key: 'visual_rules',      label: 'Regras visuais',             kind: 'text',    max: 8000, tier: 'high',   hint: 'Composição, luz, respiro, uso de cor. Descreva o padrão, não uma peça.' },
  { key: 'image_rules',       label: 'Regras de acabamento',       kind: 'text',    max: 4000, tier: 'high',   hint: 'Acabamento observado: colagem, moldura, sombra dura, textura de papel.' },
  { key: 'render_text',       label: 'Texto na arte',              kind: 'boolean', max: 10,   tier: 'high',   hint: 'true se as peças trazem título escrito na imagem.' },
  { key: 'text_style',        label: 'Estilo da tipografia na arte', kind: 'text',  max: 2000, tier: 'high',   hint: 'Como o texto é aplicado: caixa, peso, cor, destaque, posição.' },
  { key: 'audience',          label: 'Público',                    kind: 'text',    max: 3000, tier: 'medium', hint: 'Quem as peças buscam, inferido do segmento e da linguagem.' },
  { key: 'tone',              label: 'Tom de voz',                 kind: 'text',    max: 2000, tier: 'medium', hint: 'Como a marca fala, pelas legendas e chamadas visíveis.' },
  { key: 'default_cta',       label: 'CTA padrão',                 kind: 'text',    max: 1000, tier: 'medium', hint: 'A chamada que se repete. Telefone e endereço só se estiverem escritos.' },
  { key: 'copy_rules',        label: 'Regras de escrita',          kind: 'text',    max: 4000, tier: 'medium', hint: 'Tamanho de legenda, uso de emoji, hashtags, formato de título.' },
  { key: 'briefing',          label: 'Briefing',                   kind: 'text',    max: 8000, tier: 'medium', hint: 'Posicionamento que as peças sustentam.' },
  { key: 'guardrails',        label: 'Guardrails',                 kind: 'text',    max: 8000, tier: 'medium', hint: 'Limites que o material sugere. Não invente restrição legal.' },
  { key: 'forbidden_terms',   label: 'Termos proibidos',           kind: 'text',    max: 2000, tier: 'medium', hint: 'Só o que o material indicar. Vazio é resposta válida.' },
  { key: 'references_text',   label: 'Referências visuais',        kind: 'text',    max: 4000, tier: 'medium', hint: 'Descrição do padrão que as peças representam.' },
  { key: 'differentiators',   label: 'Diferenciais',               kind: 'text',    max: 4000, tier: 'low',    hint: 'Não se lê em imagem. Só preencha se estiver escrito na peça.' },
  { key: 'services',          label: 'Serviços principais',        kind: 'text',    max: 4000, tier: 'low',    hint: 'Só o que estiver listado em alguma peça.' }
])

export const BRAND_FIELD_KEYS = BRAND_FIELDS.map(f => f.key)
export const brandField = key => BRAND_FIELDS.find(f => f.key === key) || null

// Ordem de confiança, para a tela destacar o que precisa de conferência.
export const CONFIDENCE = Object.freeze(['high', 'medium', 'low'])
