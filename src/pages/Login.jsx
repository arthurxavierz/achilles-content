import React, { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEMO_MODE } from '../lib/config'

export default function Login() {
  const { user, login, recover } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  useEffect(() => { if (user) navigate('/app', { replace: true }) }, [user])

  async function submit(e) { e.preventDefault(); setBusy(true); setMessage(''); try { await login(email, password); navigate('/app') } catch (e) { setMessage(e.message) } finally { setBusy(false) } }
  async function reset() { if (!email) return setMessage('Informe seu e-mail primeiro.'); try { await recover(email); setMessage('Enviamos as instruções de recuperação para seu e-mail.') } catch { setMessage('Não foi possível iniciar a recuperação de senha.') } }

  return <div className="auth-page"><section className="auth-copy"><Link to="/" className="auth-wordmark"><img src="/wordmark.png" alt="Achilles"/><small>CONTENT</small></Link><div><span className="eyebrow">CONTEÚDO COM IDENTIDADE</span><h1>SUA MARCA.<br/><em>PRONTA PARA PUBLICAR.</em></h1><p>Da ideia à copy. Da aprovação à arte. Em um fluxo construído para a sua marca.</p></div></section><section className="auth-form"><form onSubmit={submit}><span className="eyebrow">ACESSO</span><h2>Entre na sua conta.</h2>{DEMO_MODE && <div className="notice">Modo demonstração ativo. Use qualquer e-mail e senha.</div>}<label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>{message && <div className="form-message">{message}</div>}<button className="btn primary" disabled={busy}>{busy ? 'ENTRANDO' : 'ENTRAR'}<ArrowRight size={18}/></button><button className="link-btn" type="button" onClick={reset}>Esqueci minha senha</button><p className="auth-switch">Ainda não tem conta? <Link to="/criar-conta">Criar conta grátis</Link></p></form></section></div>
}
