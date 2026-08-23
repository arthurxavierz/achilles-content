import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, Plus, RefreshCw, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEMO_MODE } from '../../lib/config'
import { api } from '../../lib/api'
import { dateTime, money } from '../../lib/format'

const demoClients = [
  { id: 'c1', full_name: 'Boost Imóveis', email: 'contato@boost.com.br', active: true, plan_name: 'Performance', renewal_mode: 'payment', credits: 581 },
  { id: 'c2', full_name: 'Clínica Aurora', email: 'contato@aurora.com.br', active: true, plan_name: 'Essencial', renewal_mode: 'manual', credits: 102 },
  { id: 'c3', full_name: 'Studio RX', email: 'studio@rx.com.br', active: false, plan_name: 'Studio', renewal_mode: 'manual', credits: 1217 }
]

const demoMetrics = { active_clients: 19, mrr_cents: 836100, credits_circulation: 4291, credits_used_month: 1847, pending_payments: 1, pending_requests: 2, failed_jobs: 0, past_due: 1, manual_subscriptions: 4 }

function strongPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%'
  let out = ''
  for (const n of crypto.getRandomValues(new Uint32Array(20))) out += chars[n % chars.length]
  return out
}

export default function AdminHome() {
  // Sem numeros de exemplo em producao. Enquanto a API nao responde, o painel
  // mostra vazio em vez de metricas inventadas.
  const [metrics, setMetrics] = useState(DEMO_MODE ? demoMetrics : null)
  const [clients, setClients] = useState(DEMO_MODE ? demoClients : [])
  const [queue, setQueue] = useState({ payments: [], requests: [], failed_jobs: [] })
  const [loadError, setLoadError] = useState('')
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ full_name: '', email: '', password: '', plan_slug: 'essencial', initial_credits: 20 })

  const load = useCallback(async () => {
    if (DEMO_MODE) return
    setLoadError('')
    try {
      const [m, c, q] = await Promise.all([api('admin-metrics'), api('admin-list-clients'), api('admin-list-pending')])
      setMetrics(m)
      setClients(c.clients || [])
      setQueue(q)
    } catch (e) { setLoadError(e.message) }
  }, [])

  useEffect(() => { load() }, [load])

  async function create(e) {
    e.preventDefault()
    setBusy(true); setFormError('')
    try {
      if (DEMO_MODE) {
        setCreated({ ...form, id: 'demo-new' })
        setClients(c => [{ id: 'demo-new', ...form, active: true, plan_name: 'Essencial', credits: Number(form.initial_credits) }, ...c])
      } else {
        const out = await api('admin-create-client', { method: 'POST', body: { ...form, initial_credits: Number(form.initial_credits) } })
        setCreated({ ...out.client, password: form.password })
        await load()
      }
    } catch (err) { setFormError(err.message) } finally { setBusy(false) }
  }

  async function resolvePayment(id) {
    if (DEMO_MODE) return
    try { await api('admin-resolve-payment', { method: 'POST', body: { payment_id: id } }); await load() }
    catch (e) { setLoadError(e.message) }
  }

  async function resolveRequest(id, status) {
    if (DEMO_MODE) return
    try { await api('admin-resolve-request', { method: 'POST', body: { request_id: id, status } }); await load() }
    catch (e) { setLoadError(e.message) }
  }

  function closeModal() {
    setOpen(false); setCreated(null); setFormError('')
    setForm({ full_name: '', email: '', password: '', plan_slug: 'essencial', initial_credits: 20 })
  }

  const pendingTotal = (queue.payments?.length || 0) + (queue.requests?.length || 0) + (queue.failed_jobs?.length || 0)

  return <div className="page">
    <div className="page-title">
      <div>
        <span className="eyebrow">ADMINISTRAÇÃO</span>
        <h1>OPERAÇÃO ACHILLES CONTENT.</h1>
        <p>Clientes, receita, créditos e suporte em um único painel.</p>
      </div>
      <button className="btn primary" onClick={() => setOpen(true)}><Plus size={18} />NOVO CLIENTE</button>
    </div>

    {loadError && <div className="alert warn">
      <AlertTriangle size={18} />
      <div><strong>Não foi possível carregar os dados.</strong><span>{loadError}</span></div>
    </div>}

    <div className="metric-grid four">
      <article className="metric gold"><small>CLIENTES ATIVOS</small><strong>{metrics ? metrics.active_clients : '—'}</strong></article>
      <article className="metric"><small>MRR</small><strong>{metrics ? money(metrics.mrr_cents) : '—'}</strong></article>
      <article className="metric"><small>CRÉDITOS EM CIRCULAÇÃO</small><strong>{metrics ? metrics.credits_circulation : '—'}</strong></article>
      <article className="metric"><small>CONSUMIDOS NO MÊS</small><strong>{metrics ? metrics.credits_used_month : '—'}</strong></article>
    </div>

    {metrics && (metrics.past_due > 0 || metrics.manual_subscriptions > 0) && <div className="admin-flags">
      {metrics.past_due > 0 && <span className="flag warn">{metrics.past_due} assinatura(s) com ciclo vencido</span>}
      {metrics.manual_subscriptions > 0 && <span className="flag">{metrics.manual_subscriptions} renovando por cobrança manual</span>}
    </div>}

    {pendingTotal > 0 && <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">FILA</span><h2>PRECISA DA SUA DECISÃO.</h2></div></div>

      {queue.payments?.length > 0 && <div className="queue-block">
        <h3>Pagamentos pendentes</h3>
        {queue.payments.map(p => <div className="queue-row" key={p.id}>
          <div>
            <strong>{p.profile?.full_name || p.profile?.email || 'Cliente'}</strong>
            <span>{p.plan?.name || p.pack?.name || p.kind} · {money(p.amount_cents)} · {dateTime(p.created_at)}</span>
          </div>
          <button className="small-btn" onClick={() => resolvePayment(p.id)}><Check size={15} />CONFIRMAR MANUALMENTE</button>
        </div>)}
      </div>}

      {queue.requests?.length > 0 && <div className="queue-block">
        <h3>Solicitações de crédito</h3>
        {queue.requests.map(r => <div className="queue-row" key={r.id}>
          <div>
            <strong>{r.profile?.full_name || r.profile?.email || 'Cliente'}</strong>
            <span>{r.amount} créditos · {dateTime(r.created_at)}</span>
          </div>
          <div className="queue-actions">
            <button className="small-btn" onClick={() => resolveRequest(r.id, 'approved')}><Check size={15} />APROVAR</button>
            <button className="small-btn ghost" onClick={() => resolveRequest(r.id, 'rejected')}><X size={15} />RECUSAR</button>
          </div>
        </div>)}
      </div>}

      {queue.failed_jobs?.length > 0 && <div className="queue-block">
        <h3>Gerações com falha</h3>
        {queue.failed_jobs.map(j => <div className="queue-row" key={j.id}>
          <div>
            <strong>{j.generations?.theme || 'Geração'}</strong>
            <span>{j.done_count} de {j.total_count} · {j.last_error || 'sem detalhe'}</span>
          </div>
          {j.generations?.user_id && <Link className="small-btn" to={`/admin/clientes/${j.generations.user_id}`}>ABRIR CLIENTE</Link>}
        </div>)}
      </div>}
    </section>}

    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">CLIENTES</span><h2>BASE ATIVA E SUPORTE.</h2></div>
        <button className="small-btn" onClick={load}><RefreshCw size={15} />ATUALIZAR</button>
      </div>
      <div className="admin-table">
        {clients.map(c => <Link to={`/admin/clientes/${c.id}`} key={c.id}>
          <div><strong>{c.full_name || 'Sem nome'}</strong><span>{c.email}</span></div>
          <span>{c.plan_name || 'Sem plano'}{c.renewal_mode === 'manual' ? ' · manual' : ''}</span>
          <b>{c.credits || 0} cr</b>
          <i className={c.active ? 'on' : 'off'}>{c.active ? 'Ativo' : 'Desativado'}</i>
        </Link>)}
        {!clients.length && <div className="empty">Nenhum cliente cadastrado ainda.</div>}
      </div>
    </section>

    {open && <div className="modal-back" onClick={closeModal}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={create}>
        <span className="eyebrow">NOVO CLIENTE</span>
        <h2>CRIAR ACESSO COMPLETO</h2>
        <label>Nome completo ou empresa
          <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
        </label>
        <label>E-mail de login
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        </label>
        <label>Senha
          <div className="inline-input">
            <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} minLength={10} required />
            <button type="button" onClick={() => setForm(f => ({ ...f, password: strongPassword() }))}>GERAR</button>
          </div>
        </label>
        <label>Plano
          <select value={form.plan_slug} onChange={e => setForm(f => ({ ...f, plan_slug: e.target.value }))}>
            <option value="essencial">Essencial</option>
            <option value="performance">Performance</option>
            <option value="studio">Studio</option>
          </select>
        </label>
        <label>Créditos extras iniciais
          <input type="number" min="0" value={form.initial_credits} onChange={e => setForm(f => ({ ...f, initial_credits: e.target.value }))} />
        </label>
        <p className="hint">O cliente já recebe os créditos do plano escolhido. Os extras entram por cima e não expiram.</p>
        {formError && <div className="form-message error">{formError}</div>}
        {created
          ? <div className="created-box">
            <strong>CLIENTE CRIADO</strong>
            <p>{created.email}</p>
            <p>{created.password || form.password}</p>
            <button type="button" onClick={() => navigator.clipboard.writeText(`Achilles Content\nLogin: ${created.email}\nSenha: ${created.password || form.password}`)}>
              <Copy size={16} />COPIAR CREDENCIAIS
            </button>
            <a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Seu acesso ao Achilles Content está pronto. Login: ${created.email}. Senha: ${created.password || form.password}`)}`}>
              ABRIR WHATSAPP
            </a>
          </div>
          : <button className="btn primary" disabled={busy}>{busy ? <RefreshCw className="spin" /> : 'CRIAR CLIENTE'}</button>}
      </form>
    </div>}
  </div>
}
