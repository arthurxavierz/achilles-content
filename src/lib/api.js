import { DEMO_MODE } from './config'
import { supabase } from './supabase'

async function request(path, options = {}, token = null) {
  const response = await fetch(`/.netlify/functions/${path}`, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação')
  return payload
}

// Chamadas autenticadas. Exigem sessao ativa do Supabase.
export async function api(path, options = {}) {
  if (DEMO_MODE) throw new Error('API indisponível no modo demonstração')
  const { data } = await supabase.auth.getSession()
  return request(path, options, data.session?.access_token || null)
}

// Chamadas publicas, sem sessao. Usadas pela landing.
export async function publicApi(path, options = {}) {
  if (DEMO_MODE) throw new Error('API indisponível no modo demonstração')
  return request(path, options)
}
