import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Clock3, CreditCard, LayoutDashboard, LogOut, Menu, Palette, ShieldCheck, Wand2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'
import { number } from '../lib/format'
import AppFooter from './AppFooter'

export default function AppLayout({ admin = false }) {
  const [open, setOpen] = useState(false)
  const { profile, logout } = useAuth()
  const { subscription } = useBilling() || {}
  const navigate = useNavigate()

  // O saldo anda junto do plano que o gerou. Quem nunca teve pagamento
  // confirmado está no teste gratuito, e o rótulo precisa dizer isso: saldo
  // sem plano ao lado não explica por que ele expira ou não.
  const planName = subscription?.plan?.name || 'Teste grátis'
  const links = admin ? [
    ['/admin', LayoutDashboard, 'Visão geral'],
    ['/app', Wand2, 'Abrir área do cliente']
  ] : [
    ['/app', LayoutDashboard, 'Visão geral'],
    ['/app/criar', Wand2, 'Criar conteúdo'],
    ['/app/historico', Clock3, 'Histórico'],
    ['/app/marca', Palette, 'Brand Brain'],
    ['/app/planos', CreditCard, 'Planos e créditos']
  ]
  if (!admin && profile?.role === 'admin') links.push(['/admin', ShieldCheck, 'Administração'])

  // Gaveta aberta no celular: fecha no toque fora e no ESC, e trava o
  // scroll do corpo para o conteudo nao rolar atras do menu.
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  async function exit() { await logout(); navigate('/') }

  return <div className="shell">
    {open && <div className="side-backdrop" onClick={() => setOpen(false)} aria-hidden="true"/>}
    <aside className={`side ${open ? 'open' : ''}`}>
      <button className="side-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X /></button>
      <NavLink to={admin ? '/admin' : '/app'} className="app-wordmark"><img src="/wordmark.png" alt="Achilles"/><small>{admin ? 'ADMIN' : 'CONTENT'}</small></NavLink>
      <nav>{links.map(([to, Icon, label]) => <NavLink key={to} to={to} end={to === '/app' || to === '/admin'} onClick={() => setOpen(false)}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
      <div className="side-foot"><button onClick={exit}><LogOut size={17}/>Sair</button></div>
    </aside>
    <main className="workspace">
      <header className="app-top"><button onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></button><div><b>{admin ? 'ADMINISTRAÇÃO' : 'ACHILLES CONTENT'}</b><span>{admin ? 'Gestão comercial e operacional' : 'Conteúdo que respeita sua marca'}</span></div><div className="top-balance" title={`${number(profile?.credits ?? 0)} créditos · ${planName}`}><BarChart3 size={17}/><div><strong>{number(profile?.credits ?? 0)}</strong><small>{planName}</small></div></div></header>
      <Outlet />
      <AppFooter/>
    </main>
  </div>
}
