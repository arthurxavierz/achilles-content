import { DEMO_MODE } from './config'
import { supabase } from './supabase'

export async function api(path, options = {}) {
  if (DEMO_MODE) throw new Error('API indisponível no modo demonstração')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const response = await fetch(`/.netlify/functions/${path}`, {
    method: options.method || 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação')
  return payload
}
