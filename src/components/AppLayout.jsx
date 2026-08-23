import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Clock3, CreditCard, LayoutDashboard, LogOut, Menu, Palette, ShieldCheck, Wand2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function AppLayout({ admin = false }) {
  const [open, setOpen] = useState(false)
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
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

  async function exit() { await logout(); navigate('/') }

  return <div className="shell">
    <aside className={`side ${open ? 'open' : ''}`}>
      <button className="side-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X /></button>
      <NavLink to={admin ? '/admin' : '/app'} className="logo"><span className="brand-mark">A</span><div><strong>ACHILLES</strong><small>CONTENT</small></div></NavLink>
      <nav>{links.map(([to, Icon, label]) => <NavLink key={to} to={to} end={to === '/app' || to === '/admin'} onClick={() => setOpen(false)}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
      <div className="side-foot"><div className="avatar-row"><span>{profile?.full_name?.[0] || 'A'}</span><div><strong>{profile?.full_name || 'Cliente'}</strong><small>{profile?.role === 'admin' ? 'Administrador' : 'Cliente Achilles'}</small></div></div><button onClick={exit}><LogOut size={17}/>Sair</button></div>
    </aside>
    <main className="workspace">
      <header className="app-top"><button onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></button><div><b>{admin ? 'ADMINISTRAÇÃO' : 'ACHILLES CONTENT'}</b><span>{admin ? 'Gestão comercial e operacional' : 'Conteúdo que respeita sua marca'}</span></div><div className="top-balance"><BarChart3 size={17}/><strong>{profile?.credits ?? 0}</strong><span>créditos</span></div></header>
      <Outlet />
    </main>
  </div>
}
