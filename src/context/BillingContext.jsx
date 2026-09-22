import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DEMO_MODE } from '../lib/config'
import { api } from '../lib/api'
import { DEFAULT_PACKS, DEFAULT_PLANS, DEFAULT_PRESETS, DEFAULT_PRICING } from '../../shared/pricing'
import { normalizePacks, normalizePlans, normalizeSubscription } from '../lib/normalize'
import { useAuth } from './AuthContext'

const BillingContext = createContext(null)

const demoState = {
  subscription: { plan: DEFAULT_PLANS[1], currentPeriodEnd: new Date(Date.now() + 26 * 86400000).toISOString(), status: 'active' },
  plans: DEFAULT_PLANS, packs: DEFAULT_PACKS, recent: [], pending: [],
  pricing: DEFAULT_PRICING, presets: DEFAULT_PRESETS
}

export function BillingProvider({ children }) {
  const { user, profile, patchProfile } = useAuth()
  const [billing, setBilling] = useState(DEMO_MODE ? demoState : {
    plans: [], packs: [], recent: [], pending: [],
    // Ate a API responder, a UI usa o espelho local. Assim o estudio nunca
    // mostra "0 créditos" para uma operacao que na verdade custa 100.
    pricing: DEFAULT_PRICING, presets: DEFAULT_PRESETS
  })
  const [loading, setLoading] = useState(false)

  async function refresh() {
    if (!user || DEMO_MODE) return
    setLoading(true)
    try {
      const data = await api('get-billing')
      if (data.profile) patchProfile(data.profile)
      setBilling({
        subscription: normalizeSubscription(data.subscription),
        plans: normalizePlans(data.plans),
        packs: normalizePacks(data.packs),
        recent: data.recent || [],
        pending: data.pending || [],
        pricing: data.pricing && Object.keys(data.pricing).length ? data.pricing : DEFAULT_PRICING,
        presets: data.presets?.length ? data.presets : DEFAULT_PRESETS
      })
    } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [user?.id])

  function demoSpend(amount) {
    if (!DEMO_MODE) return
    let plan = profile.credits_plan || 0
    let extra = profile.credits_extra || 0
    const fromPlan = Math.min(plan, amount)
    plan -= fromPlan
    extra -= Math.max(0, amount - fromPlan)
    patchProfile({ credits_plan: plan, credits_extra: Math.max(0, extra), credits: plan + Math.max(0, extra) })
  }

  const value = useMemo(() => ({ ...billing, loading, refresh, demoSpend }), [billing, loading, profile])
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
}

export const useBilling = () => useContext(BillingContext)
