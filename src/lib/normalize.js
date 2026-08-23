// O banco usa snake_case. A UI e o shared/pricing.js usam camelCase.
// Toda linha vinda do Supabase passa por aqui antes de chegar em um componente.
// Sem isso, preço e créditos aparecem zerados em produção.

const historyLabel = limits => {
  const days = limits?.history_days
  if (days === null || days === undefined) return 'Ilimitado'
  return `${days} dias`
}

const brandsLabel = limits => {
  const brands = limits?.brands
  if (brands === null || brands === undefined) return null
  return brands
}

export function normalizePlan(row) {
  if (!row) return null
  // Ja esta no formato da UI (defaults de shared/pricing.js).
  if (row.priceCents !== undefined) return row
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    priceCents: row.price_cents ?? 0,
    monthlyCredits: row.monthly_credits ?? 0,
    features: Array.isArray(row.features) ? row.features : [],
    brands: brandsLabel(row.limits),
    history: historyLabel(row.limits),
    sortOrder: row.sort_order ?? 0
  }
}

export function normalizePack(row) {
  if (!row) return null
  if (row.priceCents !== undefined) return row
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    credits: row.credits ?? 0,
    priceCents: row.price_cents ?? 0,
    badge: row.badge || null,
    sortOrder: row.sort_order ?? 0
  }
}

export function normalizeSubscription(row) {
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    renewalMode: row.renewal_mode,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    plan: normalizePlan(row.plan),
    nextPlan: normalizePlan(row.next_plan)
  }
}

export const normalizePlans = rows => (rows || []).map(normalizePlan).filter(Boolean)
export const normalizePacks = rows => (rows || []).map(normalizePack).filter(Boolean)
