import { DEMO_MODE } from './config'
import { supabase } from './supabase'

export async function api(path, options = {}) {
  if (DEMO_MODE) throw new Error('API indisponível no modo demonstração')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  let response
  try {
    response = await fetch(`/.netlify/functions/${path}`, {
    method: options.method || 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    })
  } catch {
    // fetch só rejeita por rede: offline, DNS, CORS. Mensagem do navegador
    // aqui é "Failed to fetch", que não diz nada ao cliente.
    throw new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.')
  }

  const payload = await response.json().catch(() => ({}))

  if (response.status === 401) {
    // Sessão expirada. Avisa o app para deslogar em vez de deixar o
    // cliente clicando num painel que responde "Não autorizado".
    window.dispatchEvent(new CustomEvent('achilles:unauthorized'))
    throw new Error('Sua sessão expirou. Entre novamente.')
  }
  if (response.status === 429) throw new Error(payload.error || 'Muitas tentativas em pouco tempo. Aguarde um instante.')
  if (response.status === 503) throw new Error(payload.error || 'Serviço temporariamente indisponível. Tente em alguns minutos.')
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação')
  return payload
}
