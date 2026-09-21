import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Create from './pages/Create'
import History from './pages/History'
import Brand from './pages/Brand'
import Billing from './pages/Billing'
import AdminHome from './pages/admin/AdminHome'
import ClientDetail from './pages/admin/ClientDetail'
import AppLayout from './components/AppLayout'
import StaticPage from './pages/StaticPage'
import Brandmark from './components/Brandmark'

function Protected({ admin = false, children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="page-loading"><Brandmark size={46}/><span /></div>
  if (!user) return <Navigate to="/entrar" replace />
  if (!profile?.active) return <main className="fatal"><h1>CONTA DESATIVADA.</h1><p>Fale com a Achilles Media para revisar seu acesso.</p></main>
  if (admin && profile?.role !== 'admin') return <Navigate to="/app" replace />
  return children
}

export default function App() {
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/entrar" element={<Login />} />
    <Route path="/privacidade" element={<StaticPage type="privacy" />} />
    <Route path="/termos" element={<StaticPage type="terms" />} />
    <Route path="/app" element={<Protected><AppLayout /></Protected>}>
      <Route index element={<Dashboard />} />
      <Route path="criar" element={<Create />} />
      <Route path="historico" element={<History />} />
      <Route path="marca" element={<Brand />} />
      <Route path="planos" element={<Billing />} />
    </Route>
    <Route path="/admin" element={<Protected admin><AppLayout admin /></Protected>}>
      <Route index element={<AdminHome />} />
      <Route path="clientes/:id" element={<ClientDetail />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
