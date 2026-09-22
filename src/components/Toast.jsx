import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Info, X } from 'lucide-react'

// Retorno de ação em lugar fixo na tela. Antes cada tela mostrava a
// mensagem inline, no topo do formulário: no celular ela nascia fora da
// área visível e o cliente achava que nada tinha acontecido.

const ToastContext = createContext(null)
const ICONS = { success: Check, error: AlertTriangle, info: Info }
const LIFETIME = { success: 4000, info: 5000, error: 7000 }

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback(id => {
    setItems(list => list.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }, [])

  const push = useCallback((message, kind = 'info') => {
    const text = String(message || '').trim()
    if (!text) return
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    // No máximo três na tela: acima disso viram parede e ninguém lê.
    setItems(list => [...list.slice(-2), { id, text, kind }])
    timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME[kind] ?? 5000))
  }, [dismiss])

  const value = useMemo(() => ({
    toast: push,
    success: m => push(m, 'success'),
    error: m => push(m, 'error'),
    info: m => push(m, 'info')
  }), [push])

  return <ToastContext.Provider value={value}>
    {children}
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map(t => {
        const Icon = ICONS[t.kind] || Info
        return <div className={`toast ${t.kind}`} key={t.id}>
          <Icon size={17}/>
          <span>{t.text}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Fechar aviso"><X size={15}/></button>
        </div>
      })}
    </div>
  </ToastContext.Provider>
}

// Sem provider (um teste, uma página isolada) cai no console em vez de
// estourar a tela inteira.
export const useToast = () => useContext(ToastContext) || {
  toast: console.log, success: console.log, error: console.error, info: console.log
}
