import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEMO_MODE } from '../lib/config'
import { api } from '../lib/api'
import { DEFAULT_PACKS, DEFAULT_PLANS } from '../../shared/pricing'
import { normalizePacks, normalizePlans, normalizeSubscription } from '../lib/normalize'
import { useAuth } from './AuthContext'

const BillingContext = createContext(null)

const demoState = {
  subscription: {
    status: 'active',
    renewalMode: 'payment',
    currentPeriodEnd: new Date(Date.now() + 26 * 86400000).toISOString(),
    plan: DEFAULT_PLANS[1],
    nextPlan: null
  },
  plans: DEFAULT_PLANS,
  packs: DEFAULT_PACKS,
  recent: [],
  pending: []
}

const emptyState = { subscription: null, plans: [], packs: [], recent: [], pending: [] }

export function BillingProvider({ children }) {
  const { user, profile, patchProfile } = useAuth()
  const [billing, setBilling] = useState(DEMO_MODE ? demoState : emptyState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!user || DEMO_MODE) return
    setLoading(true)
    setError('')
    try {
      const data = await api('get-billing')
      setBilling({
        subscription: normalizeSubscription(data.subscription),
        plans: normalizePlans(data.plans),
        packs: normalizePacks(data.packs),
        recent: data.recent || [],
        pending: data.pending || []
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { refresh() }, [refresh])

  function demoSpend(amount) {
    if (!DEMO_MODE) return
    let plan = profile.credits_plan || 0
    let extra = profile.credits_extra || 0
    const fromPlan = Math.min(plan, amount)
    plan -= fromPlan
    extra -= Math.max(0, amount - fromPlan)
    patchProfile({ credits_plan: plan, credits_extra: Math.max(0, extra), credits: plan + Math.max(0, extra) })
  }

  const value = useMemo(
    () => ({ ...billing, loading, error, refresh, demoSpend }),
    [billing, loading, error, refresh, profile]
  )
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
}

export const useBilling = () => useContext(BillingContext)
