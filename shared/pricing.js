export const FORMAT_PRICING = Object.freeze({
  post: { slug: 'post', label: 'Post único', copyCredits: 1, imageCreditsEach: 2, imageCount: 1, totalCredits: 3 },
  story: { slug: 'story', label: 'Story', copyCredits: 1, imageCreditsEach: 2, imageCount: 1, totalCredits: 3 },
  carousel: { slug: 'carousel', label: 'Carrossel', copyCredits: 2, imageCreditsEach: 2, imageCount: 5, totalCredits: 12 }
})

// Valores iniciais. A fonte operacional passa a ser a tabela plans quando o banco estiver configurado.
export const DEFAULT_PLANS = Object.freeze([
  { slug: 'essencial', name: 'Essencial', priceCents: 29700, monthlyCredits: 300, brands: 1, history: '90 dias', support: 'WhatsApp em horário comercial' },
  { slug: 'performance', name: 'Performance', priceCents: 59700, monthlyCredits: 650, brands: 3, history: 'Ilimitado', support: 'Prioritário', badge: 'MAIS ESCOLHIDO' },
  { slug: 'studio', name: 'Studio', priceCents: 119700, monthlyCredits: 1400, brands: null, history: 'Ilimitado', support: 'Atendimento dedicado' }
])

export const DEFAULT_PACKS = Object.freeze([
  { slug: 'pack-25', name: '25 créditos', credits: 25, priceCents: 2500 },
  { slug: 'pack-50', name: '50 créditos', credits: 50, priceCents: 5000, badge: 'MAIS ESCOLHIDO' },
  { slug: 'pack-100', name: '100 créditos', credits: 100, priceCents: 10000 },
  { slug: 'pack-250', name: '250 créditos', credits: 250, priceCents: 22500, badge: 'MELHOR CUSTO' }
])

export function imageCredits(format, count) {
  const item = FORMAT_PRICING[format]
  return item ? item.imageCreditsEach * (count ?? item.imageCount) : 0
}
