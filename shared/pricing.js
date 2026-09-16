// Espelho do catalogo do banco (public.pricing e public.art_presets).
// Serve para o modo demo e como estado inicial enquanto a API responde.
// A fonte de verdade em producao e sempre a tabela. Se divergir, o banco vence.

export const DEFAULT_PRICING = Object.freeze({
  copy_post: { slug:'copy_post', label:'Copy de post', kind:'copy', credits:50 },
  copy_story: { slug:'copy_story', label:'Copy de story', kind:'copy', credits:50 },
  copy_carousel: { slug:'copy_carousel', label:'Copy de carrossel', kind:'copy', credits:150 },
  image_standard: { slug:'image_standard', label:'Imagem Padrão', kind:'image', credits:100, image_quality:'medium', description:'Arte de fundo em qualidade de publicação.' },
  image_signature: { slug:'image_signature', label:'Imagem Assinatura', kind:'image', credits:300, image_quality:'high', description:'Máxima fidelidade, direção de arte guiada por referências.' },
  brand_analysis: { slug:'brand_analysis', label:'Análise de marca', kind:'analysis', credits:300 }
})

export const DEFAULT_PRESETS = Object.freeze([
  { slug:'editorial', name:'Editorial', summary:'Revista premium, muito respiro, tipografia protagonista.' },
  { slug:'cinematic', name:'Cinematográfico', summary:'Contraste alto, luz dramática, clima de cinema.' },
  { slug:'luxo', name:'Luxo Quente', summary:'Superfícies nobres, dourado, sensação de alto padrão.' },
  { slug:'dark_tech', name:'Dark Tech', summary:'Escuro, geométrico, tecnológico e limpo.' },
  { slug:'natural', name:'Luz Natural', summary:'Real, humano, sem parecer banco de imagens.' },
  { slug:'vitrine', name:'Vitrine 3D', summary:'Objeto em destaque, fundo limpo, feito para converter.' }
])

export const FORMATS = Object.freeze([
  { slug:'post', label:'Post único', imageCount:1, copySlug:'copy_post' },
  { slug:'story', label:'Story', imageCount:1, copySlug:'copy_story' },
  { slug:'carousel', label:'Carrossel', imageCount:5, copySlug:'copy_carousel' }
])

export const QUALITIES = Object.freeze([
  { slug:'standard', pricingSlug:'image_standard', label:'Padrão', hint:'Pronta para publicar. Melhor custo por arte.' },
  { slug:'signature', pricingSlug:'image_signature', label:'Assinatura', hint:'Máxima fidelidade e detalhe. Para peças de campanha.' }
])

export const formatOf = slug => FORMATS.find(f => f.slug === slug) || FORMATS[0]
export const qualityOf = slug => QUALITIES.find(q => q.slug === slug) || QUALITIES[0]

export const creditsOf = (pricing, slug) => Number(pricing?.[slug]?.credits ?? DEFAULT_PRICING[slug]?.credits ?? 0)
export const copyCredits = (pricing, format) => creditsOf(pricing, formatOf(format).copySlug)
export const imageCredits = (pricing, quality) => creditsOf(pricing, qualityOf(quality).pricingSlug)
export const imagesCredits = (pricing, format, quality) => imageCredits(pricing, quality) * formatOf(format).imageCount
export const totalCredits = (pricing, format, quality) => copyCredits(pricing, format) + imagesCredits(pricing, format, quality)

// Planos e pacotes iniciais. Espelham supabase/migration-v5.sql.
export const DEFAULT_PLANS = Object.freeze([
  { slug:'starter', name:'Starter', priceCents:14700, monthlyCredits:7500, brands:1, history:'90 dias', support:'WhatsApp em horário comercial' },
  { slug:'pro', name:'Pro', priceCents:29700, monthlyCredits:20000, brands:3, history:'Ilimitado', support:'Prioritário', badge:'MAIS ESCOLHIDO' },
  { slug:'studio', name:'Studio', priceCents:59700, monthlyCredits:45000, brands:null, history:'Ilimitado', support:'Revisão de Brand Brain' },
  { slug:'agencia', name:'Agência', priceCents:119700, monthlyCredits:100000, brands:null, history:'Ilimitado', support:'Atendimento nomeado' }
])

export const DEFAULT_PACKS = Object.freeze([
  { slug:'avulso-2k', name:'2.000 créditos', credits:2000, priceCents:5900 },
  { slug:'avulso-5k', name:'5.000 créditos', credits:5000, priceCents:12900, badge:'MAIS ESCOLHIDO' },
  { slug:'avulso-12k', name:'12.000 créditos', credits:12000, priceCents:27900 },
  { slug:'avulso-30k', name:'30.000 créditos', credits:30000, priceCents:64900, badge:'MELHOR CUSTO' }
])

export const FREE_SIGNUP_CREDITS = 200
