import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DEMO_MODE } from '../lib/config'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const demoUser = { id: 'demo-user', email: 'demo@achillesmedia.com.br' }
const demoProfile = { id: 'demo-user', full_name: 'Achilles Demo', role: 'admin', active: true, credits_plan: 260, credits_extra: 40, credits: 300 }

export function AuthProvider({ children }) {
  const [session, setSession] = useState(DEMO_MODE ? { user: demoUser } : null)
  const [profile, setProfile] = useState(DEMO_MODE ? demoProfile : null)
  const [loading, setLoading] = useState(!DEMO_MODE)

  async function loadProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) throw error
    setProfile(data)
    setLoading(false)
  }

  useEffect(() => {
    if (DEMO_MODE) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.id).catch(() => setLoading(false))
      else setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next) loadProfile(next.user.id).catch(() => setLoading(false))
      else { setProfile(null); setLoading(false) }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // api() emite este evento ao receber 401. Sem isso o cliente fica num
  // painel vivo cujas acoes todas respondem "Nao autorizado".
  useEffect(() => {
    if (DEMO_MODE) return
    const onExpired = () => { supabase.auth.signOut().catch(() => {}); setSession(null); setProfile(null) }
    window.addEventListener('achilles:unauthorized', onExpired)
    return () => window.removeEventListener('achilles:unauthorized', onExpired)
  }, [])

  async function login(email, password) {
    if (DEMO_MODE) return
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('E-mail ou senha inválidos')
  }

  async function logout() {
    if (DEMO_MODE) return
    await supabase.auth.signOut()
  }

  async function recover(email) {
    if (DEMO_MODE) return
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/entrar` })
    if (error) throw error
  }

  function patchProfile(partial) {
    setProfile(current => current ? { ...current, ...partial } : current)
  }

  const value = useMemo(() => ({ session, user: session?.user || null, profile, loading, login, logout, recover, patchProfile }), [session, profile, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
