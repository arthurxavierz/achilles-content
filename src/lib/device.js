// Identificador do dispositivo. Nao e impressao digital de navegador e nao
// coleta nada do usuario: e um UUID gerado aqui e guardado no localStorage.
// Limpar o navegador zera. Quem quiser burlar consegue, e tudo bem: a
// segunda camada, no servidor, conta por rede. O objetivo e travar a
// criacao casual de contas para pegar os créditos de cortesia, nao vencer
// uma fraude determinada.
const KEY = 'achilles.device'

export function deviceId() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    localStorage.setItem(KEY, id)
    return id
  } catch {
    // Navegador anônimo ou storage bloqueado: cai na contagem por rede.
    return 'sem-armazenamento'
  }
}
