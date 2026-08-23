import React, { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Copy, Save } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { DEMO_MODE } from '../../lib/config'
import { api } from '../../lib/api'
import { dateLong, dateTime, money } from '../../lib/format'

const LONG_FIELDS = ['audience', 'tone', 'briefing', 'guardrails', 'visual_rules', 'differentiators', 'services']
const BRAND_FIELDS = ['brand_name', 'segment', 'default_cta', ...LONG_FIELDS]
const TABS = [['brand', 'BRAND BRAIN'], ['historico', 'HISTÓRICO'], ['creditos', 'CRÉDITOS'], ['plano', 'PLANO'], ['conta', 'CONTA']]

const RENEWAL_LABELS = {
  payment: 'Autoatendimento. Cada ciclo exige um pagamento novo.',
  manual: 'Cobrança fora da plataforma. Renova sozinho todo ciclo.',
  preapproval: 'Assinatura recorrente do Mercado Pago.'
}

const demoData = id => ({
  profile: { id, full_name: 'Clínica Aurora', email: 'contato@aurora.com.br', active: true, credits: 102, credits_plan: 82, credits_extra: 20 },
  brand: { brand_name: 'Clínica Aurora', segment: 'Odontologia', audience: 'Pacientes particulares', tone: 'Profissional e humano', briefing: 'Comunicação premium e clara.', guardrails: 'Não prometer resultados.', visual_rules: 'Alto contraste e bastante respiro.', differentiators: '', services: '', default_cta: '' },
  history: [], ledger: [], payments: [],
  subscription: { status: 'active', renewal_mode: 'manual', current_period_end: new Date(Date.now() + 12 * 86400000).toISOString(), plan: { slug: 'essencial', name: 'Essencial', price_cents: 29700 } }
})

export default function ClientDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('brand')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState(20)
  const [reason, setReason] = useState('Ajuste comercial')
  const [planSlug, setPlanSlug] = useState('essencial')
  const [applyCredits, setApplyCredits] = useState(false)

  const load = useCallback(async () => {
    if (DEMO_MODE) { setData(demoData(id)); return }
    try {
      const out = await api(`admin-get-client?user_id=${encodeURIComponent(id)}`)
      setData(out)
      if (out.subscription?.plan?.slug) setPlanSlug(out.subscription.plan.slug)
    } catch (e) { setMsg(e.message) }
  }, [id])

  useEffect(() => { load() }, [load])

  if (!data) return <div className="page-loading"><span /></div>

  async function run(fn, successMessage) {
    setBusy(true); setMsg('')
    try { await fn(); if (successMessage) setMsg(successMessage) }
    catch (e) { setMsg(e.message) }
    finally { setBusy(false) }
  }

  const saveBrand = () => run(async () => {
    if (!DEMO_MODE) await api('admin-update-client-brand', { method: 'POST', body: { user_id: id, brand: data.brand } })
  }, 'Brand Brain atualizado pelo suporte.')

  const grant = () => run(async () => {
    if (!reason.trim()) throw new Error('Informe o motivo da concessão.')
    if (!DEMO_MODE) {
      await api('admin-grant-credits', { method: 'POST', body: { user_id: id, amount: Number(amount), reason, bucket: 'extra' } })
      await load()
    }
  }, 'Créditos concedidos.')

  const setPlan = () => run(async () => {
    if (!DEMO_MODE) {
      await api('admin-set-plan', { method: 'POST', body: { user_id: id, plan_slug: planSlug, apply_credits: applyCredits } })
      await load()
    }
  }, 'Plano atualizado.')

  const setRenewal = mode => run(async () => {
    if (!DEMO_MODE) {
      await api('admin-set-renewal-mode', { method: 'POST', body: { user_id: id, renewal_mode: mode } })
      await load()
    }
  }, 'Modo de renovação atualizado.')

  async function resetPassword() {
    setBusy(true); setMsg('')
    try {
      const password = DEMO_MODE
        ? 'Achi' + Math.random().toString(36).slice(2, 10) + '9!'
        : (await api('admin-reset-password', { method: 'POST', body: { user_id: id } })).password
      await navigator.clipboard.writeText(password)
      setMsg(`Nova senha copiada: ${password}`)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  const toggleActive = () => run(async () => {
    if (!DEMO_MODE) await api('admin-set-client-status', { method: 'POST', body: { user_id: id, active: !data.profile.active } })
    setData(d => ({ ...d, profile: { ...d.profile, active: !d.profile.active } }))
  })

  const sub = data.subscription

  return <div className="page">
    <Link className="back-link" to="/admin"><ArrowLeft size={17} />Voltar</Link>

    <div className="page-title">
      <div>
        <span className="eyebrow">CLIENTE</span>
        <h1>{data.profile.full_name || 'Sem nome'}</h1>
        <p>{data.profile.email}</p>
      </div>
      <div className={`status ${data.profile.active ? 'on' : 'off'}`}>{data.profile.active ? 'ATIVO' : 'DESATIVADO'}</div>
    </div>

    <div className="tabs">
      {TABS.map(([key, label]) => <button className={tab === key ? 'active' : ''} onClick={() => setTab(key)} key={key}>{label}</button>)}
    </div>

    {msg && <div className="form-message">{msg}</div>}

    {tab === 'brand' && <section className="panel">
      <div className="form-grid">
        {BRAND_FIELDS.map(key => <label className={LONG_FIELDS.includes(key) ? 'wide' : ''} key={key}>
          {key.replaceAll('_', ' ')}
          {LONG_FIELDS.includes(key)
            ? <textarea value={data.brand?.[key] || ''} onChange={e => setData(d => ({ ...d, brand: { ...d.brand, [key]: e.target.value } }))} />
            : <input value={data.brand?.[key] || ''} onChange={e => setData(d => ({ ...d, brand: { ...d.brand, [key]: e.target.value } }))} />}
        </label>)}
      </div>
      <button className="btn primary" disabled={busy} onClick={saveBrand}><Save size={17} />SALVAR ALTERAÇÕES</button>
    </section>}

    {tab === 'historico' && <section className="panel">
      <div className="history-list">
        {data.history?.length ? data.history.map(g => <div key={g.id}>
          <div><strong>{g.theme || 'Sem tema'}</strong><span>{g.format} · {dateTime(g.created_at)}</span></div>
          <div><b>{(g.copy_cost || 0) + (g.image_cost || 0)} cr</b><span>{g.status}</span></div>
        </div>) : <div className="empty">Nenhuma geração para exibir.</div>}
      </div>
    </section>}

    {tab === 'creditos' && <section className="panel">
      <div className="client-credit">
        <strong>{data.profile.credits}</strong>
        <span>saldo total · {data.profile.credits_plan} do plano · {data.profile.credits_extra} avulsos</span>
      </div>
      <div className="form-grid">
        <label>Quantidade<input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Motivo obrigatório<input value={reason} onChange={e => setReason(e.target.value)} /></label>
      </div>
      <button className="btn primary" disabled={busy} onClick={grant}>CONCEDER CRÉDITOS AVULSOS</button>
      <div className="ledger">
        {data.ledger?.length ? data.ledger.map(x => <div key={x.id}>
          <span>{x.reason}<small>{dateTime(x.created_at)}</small></span>
          <b className={x.amount < 0 ? 'negative' : 'positive'}>{x.amount > 0 ? '+' : ''}{x.amount}</b>
        </div>) : <div className="empty">Sem movimentações.</div>}
      </div>
    </section>}

    {tab === 'plano' && <section className="panel">
      <div className="client-credit">
        <strong>{sub?.plan?.name || 'Sem plano'}</strong>
        <span>
          {sub ? `${money(sub.plan?.price_cents)} por mês · ${sub.status === 'past_due' ? 'ciclo vencido em' : 'renova em'} ${dateLong(sub.current_period_end)}` : 'Nenhuma assinatura ativa'}
        </span>
      </div>

      <div className="form-grid">
        <label>Plano
          <select value={planSlug} onChange={e => setPlanSlug(e.target.value)}>
            <option value="essencial">Essencial</option>
            <option value="performance">Performance</option>
            <option value="studio">Studio</option>
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={applyCredits} onChange={e => setApplyCredits(e.target.checked)} />
          Aplicar os créditos do plano agora (substitui o saldo do plano)
        </label>
      </div>
      <button className="btn primary" disabled={busy} onClick={setPlan}>SALVAR PLANO</button>

      <div className="renewal-box">
        <h3>Renovação</h3>
        <p>{RENEWAL_LABELS[sub?.renewal_mode] || 'Sem assinatura ativa.'}</p>
        <div className="action-row">
          <button className="btn secondary" disabled={busy || !sub || sub.renewal_mode === 'manual'} onClick={() => setRenewal('manual')}>
            COBRANÇA MANUAL
          </button>
          <button className="btn secondary" disabled={busy || !sub || sub.renewal_mode === 'payment'} onClick={() => setRenewal('payment')}>
            EXIGIR PAGAMENTO
          </button>
        </div>
      </div>

      <div className="ledger">
        {data.payments?.length ? data.payments.map(p => <div key={p.id}>
          <span>{p.kind === 'plan' ? 'Plano' : 'Créditos avulsos'}<small>{dateTime(p.created_at)}</small></span>
          <b className={p.status === 'approved' ? 'positive' : ''}>{money(p.amount_cents)} · {p.status}</b>
        </div>) : <div className="empty">Nenhum pagamento registrado.</div>}
      </div>
    </section>}

    {tab === 'conta' && <section className="panel account-actions">
      <button className="btn secondary" disabled={busy} onClick={resetPassword}><Copy size={17} />GERAR NOVA SENHA</button>
      <button className="btn danger" disabled={busy} onClick={toggleActive}>
        {data.profile.active ? 'DESATIVAR CONTA' : 'REATIVAR CONTA'}
      </button>
    </section>}
  </div>
}
