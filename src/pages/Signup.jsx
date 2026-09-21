import React, { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { FREE_SIGNUP_CREDITS } from '../../shared/pricing'
import { DEMO_MODE } from '../lib/config'
import { api } from '../lib/api'
import { deviceId } from '../lib/device'
import { number } from '../lib/format'
import Brandmark from '../components/Brandmark'
import { useAuth } from '../context/AuthContext'

export default function Signup() {
  const { login } = useAuth()
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))

  async function submit(e) {
    e.preventDefault()
    if (DEMO_MODE) return setMessage('Cadastro indisponível no modo demonstração.')
    if (form.password.length < 8) return setMessage('A senha precisa ter ao menos 8 caracteres.')
    setBusy(true); setMessage('')
    try {
      await api('signup', { method: 'POST', body: { ...form, device_id: deviceId() } })
      // A conta já nasce confirmada, então entramos direto.
      await login(form.email, form.password)
      navigate('/app')
    } catch (e) {
      setMessage(e.message)
    } finally { setBusy(false) }
  }

  return <div className="auth-page">
    <section className="auth-copy">
      <Link to="/" className="logo"><Brandmark/><div><strong>ACHILLES</strong><small>CONTENT</small></div></Link>
      <div>
        <span className="eyebrow">COMECE AGORA</span>
        <h1>SUA MARCA.<br/><em>PRONTA PARA PUBLICAR.</em></h1>
        <p>Crie sua conta e receba {number(FREE_SIGNUP_CREDITS)} créditos de cortesia. Sem cartão, sem cobrança automática.</p>
        <ul className="auth-perks">
          <li><Check size={16}/>Uma copy completa e uma arte, por nossa conta</li>
          <li><Check size={16}/>Você aprova o texto antes de gastar com imagem</li>
          <li><Check size={16}/>Paga por PIX só quando decidir continuar</li>
        </ul>
      </div>
    </section>

    <section className="auth-form">
      <form onSubmit={submit}>
        <span className="eyebrow">CRIAR CONTA</span>
        <h2>Leva menos de um minuto.</h2>
        <label>Nome ou empresa<input value={form.full_name} onChange={e => set('full_name', e.target.value)} required /></label>
        <label>E-mail<input type="email" value={form.email} onChange={e => set('email', e.target.value)} required /></label>
        <label>Senha<input type="password" value={form.password} onChange={e => set('password', e.target.value)} minLength={8} required /><small className="field-hint">Mínimo de 8 caracteres.</small></label>
        {message && <div className="form-message error">{message}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'CRIANDO' : `CRIAR CONTA E GANHAR ${number(FREE_SIGNUP_CREDITS)} CRÉDITOS`}<ArrowRight size={18}/></button>
        <p className="auth-switch">Já tem conta? <Link to="/entrar">Entrar</Link></p>
        <p className="auth-terms">Ao criar a conta você concorda com os <Link to="/termos">termos de uso</Link> e a <Link to="/privacidade">política de privacidade</Link>.</p>
      </form>
    </section>
  </div>
}
