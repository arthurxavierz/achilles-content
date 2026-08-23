import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Download } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { DEFAULT_PACKS, DEFAULT_PLANS } from '../../shared/pricing'
import { DEMO_MODE } from '../lib/config'
import { api } from '../lib/api'
import { dateLong, money } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'

const RETURN_MESSAGES = {
  sucesso: 'Pagamento aprovado. Os créditos entram assim que o Mercado Pago confirmar.',
  pendente: 'Pagamento em análise. Assim que for aprovado, o saldo é atualizado sozinho.',
  falha: 'O pagamento não foi concluído. Nenhum crédito foi debitado.'
}

// Consumo dos ultimos 14 dias a partir do extrato real, nao de valores fixos.
function useConsumption(recent) {
  return useMemo(() => {
    const days = []
    for (let i = 13; i >= 0; i--) {
      const day = new Date()
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - i)
      days.push({ key: day.toISOString().slice(0, 10), label: day.getDate(), value: 0 })
    }
    const index = new Map(days.map(d => [d.key, d]))
    for (const entry of recent || []) {
      if (entry.kind !== 'consumption') continue
      const day = index.get(String(entry.created_at || '').slice(0, 10))
      if (day) day.value += Math.abs(entry.amount || 0)
    }
    return days
  }, [recent])
}

export default function Billing() {
  const { profile } = useAuth()
  const { subscription, plans, packs, recent = [], pending = [], refresh } = useBilling()
  const [params, setParams] = useSearchParams()
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [requestAmount, setRequestAmount] = useState(50)

  const planList = plans?.length ? plans : DEFAULT_PLANS
  const packList = packs?.length ? packs : DEFAULT_PACKS
  const currentPlan = subscription?.plan || null
  const total = (profile?.credits_plan || 0) + (profile?.credits_extra || 0)
  const pastDue = subscription?.status === 'past_due'
  const chart = useConsumption(recent)
  const peak = Math.max(1, ...chart.map(d => d.value))

  // O Mercado Pago devolve o cliente com ?pagamento=... na URL.
  useEffect(() => {
    const outcome = params.get('pagamento')
    if (!outcome) return
    setMsg(RETURN_MESSAGES[outcome] || '')
    params.delete('pagamento')
    setParams(params, { replace: true })
    if (outcome === 'sucesso') refresh()
  }, [])

  async function checkout(kind, slug) {
    setMsg('')
    if (DEMO_MODE) return setMsg('No modo demonstração o checkout não é aberto.')
    setBusy(slug)
    try {
      const out = await api('create-checkout', { method: 'POST', body: { kind, slug } })
      location.href = out.checkout_url
    } catch (e) {
      setMsg(e.message)
      setBusy('')
    }
  }

  // Upgrade cobra agora. Downgrade entra no proximo ciclo, sem cobranca extra.
  async function changePlan(slug) {
    setMsg('')
    if (DEMO_MODE) return setMsg('No modo demonstração a troca de plano não é aplicada.')
    setBusy(slug)
    try {
      const out = await api('change-plan', { method: 'POST', body: { plan_slug: slug } })
      if (out.mode === 'checkout_required') return checkout('plan', slug)
      setMsg(`Downgrade programado. O novo plano passa a valer em ${dateLong(out.effective_at)}.`)
      await refresh()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy('')
    }
  }

  function csv() {
    const lines = [
      ['Data', 'Descrição', 'Tipo', 'Valor'],
      ...recent.map(x => [x.created_at, x.reason || x.kind, x.kind, x.amount])
    ]
    const body = lines.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'extrato-achilles.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Caminho manual: o cliente pede credito e o admin resolve pelo painel.
  // Serve para quem prefere combinar pagamento fora do checkout.
  async function requestCredits() {
    setMsg('')
    if (DEMO_MODE) return setMsg('No modo demonstração a solicitação não é enviada.')
    setBusy('request')
    try {
      await api('request-credits', { method: 'POST', body: { amount: Number(requestAmount) } })
      setMsg('Solicitação enviada. A equipe da Achilles Media vai retornar.')
    } catch (e) { setMsg(e.message) } finally { setBusy('') }
  }

  function planAction(plan) {
    if (!currentPlan) return { label: 'CONTRATAR', fn: () => checkout('plan', plan.slug), disabled: false }
    if (plan.slug === currentPlan.slug) {
      return pastDue
        ? { label: 'RENOVAR AGORA', fn: () => checkout('plan', plan.slug), disabled: false }
        : { label: 'PLANO ATUAL', fn: null, disabled: true }
    }
    if (plan.priceCents > currentPlan.priceCents) return { label: 'FAZER UPGRADE', fn: () => changePlan(plan.slug), disabled: false }
    return { label: 'PROGRAMAR DOWNGRADE', fn: () => changePlan(plan.slug), disabled: false }
  }

  return <div className="page">
    <div className="page-title">
      <div>
        <span className="eyebrow">PLANOS E CRÉDITOS</span>
        <h1>CONTROLE O SEU CONSUMO.</h1>
        <p>Plano mensal e créditos avulsos funcionam em saldos separados.</p>
      </div>
    </div>

    {pastDue && <div className="alert warn">
      <AlertTriangle size={18} />
      <div>
        <strong>Ciclo encerrado.</strong>
        <span>Os créditos do plano expiraram. Renove para liberar o novo saldo. Seus créditos avulsos continuam disponíveis.</span>
      </div>
    </div>}

    {pending.length > 0 && <div className="alert">
      <div>
        <strong>Pagamento em análise.</strong>
        <span>Assim que o Mercado Pago confirmar, o saldo é atualizado automaticamente.</span>
      </div>
    </div>}

    <section className="billing-hero">
      <div>
        <small>SALDO TOTAL</small>
        <strong>{total}</strong>
        <span>{profile?.credits_plan || 0} do plano · {profile?.credits_extra || 0} avulsos</span>
      </div>
      <div>
        <small>PLANO ATUAL</small>
        <strong>{currentPlan?.name || 'Sem plano'}</strong>
        <span>{currentPlan ? `${money(currentPlan.priceCents)} por mês` : 'Contrate para receber créditos mensais'}</span>
      </div>
      <div>
        <small>{pastDue ? 'VENCEU EM' : 'PRÓXIMA RENOVAÇÃO'}</small>
        <strong>{dateLong(subscription?.currentPeriodEnd)}</strong>
        <span>{subscription?.nextPlan ? `Muda para ${subscription.nextPlan.name}` : 'créditos avulsos não expiram'}</span>
      </div>
    </section>

    {msg && <div className="form-message">{msg}</div>}

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">CONSUMO</span><h2>ÚLTIMOS 14 DIAS</h2></div></div>
      {recent.length ? <div className="bar-chart">
        {chart.map(d => <i
          key={d.key}
          style={{ height: `${Math.max(6, (d.value / peak) * 120)}px` }}
          title={`Dia ${d.label}: ${d.value} créditos`}
        />)}
      </div> : <div className="empty">Ainda não há consumo registrado.</div>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">ASSINATURA</span><h2>ESCOLHA O SEU RITMO.</h2></div></div>
      <div className="plan-grid inside">
        {planList.map(p => {
          const action = planAction(p)
          return <article key={p.slug} className={p.slug === currentPlan?.slug ? 'current' : ''}>
            <h3>{p.name}</h3>
            <div className="price">{money(p.priceCents)}<small>/mês</small></div>
            <strong>{p.monthlyCredits} créditos</strong>
            <p>{p.history ? `Histórico ${String(p.history).toLowerCase()}.` : ''}</p>
            <button className="btn primary" disabled={action.disabled || busy === p.slug} onClick={action.fn || undefined}>
              {busy === p.slug ? 'ABRINDO' : action.label}
            </button>
          </article>
        })}
      </div>
      {subscription?.nextPlan && <p className="plan-foot">
        Downgrade programado para {subscription.nextPlan.name}, válido a partir de {dateLong(subscription.currentPeriodEnd)}.
      </p>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">CRÉDITOS AVULSOS</span><h2>COMPLEMENTE SEM ALTERAR O PLANO.</h2></div></div>
      <div className="pack-grid">
        {packList.map(p => <article key={p.slug}>
          {p.badge && <span className="tag">{p.badge}</span>}
          <strong>{p.credits}</strong>
          <span>créditos</span>
          <b>{money(p.priceCents)}</b>
          <button disabled={busy === p.slug} onClick={() => checkout('credit_pack', p.slug)}>
            {busy === p.slug ? 'ABRINDO' : 'COMPRAR'}<ArrowRight size={16} />
          </button>
        </article>)}
      </div>
      <div className="request-credits">
        <div>
          <strong>Prefere combinar direto com a equipe?</strong>
          <span>Peça um lote de créditos e a Achilles Media retorna com as condições.</span>
        </div>
        <div className="inline-input">
          <input type="number" min="1" max="10000" value={requestAmount} onChange={e => setRequestAmount(e.target.value)} aria-label="Quantidade de créditos" />
          <button type="button" disabled={busy === 'request'} onClick={requestCredits}>
            {busy === 'request' ? 'ENVIANDO' : 'SOLICITAR'}
          </button>
        </div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">EXTRATO</span><h2>MOVIMENTAÇÕES RECENTES</h2></div>
        <button className="small-btn" onClick={csv} disabled={!recent.length}><Download size={16} />CSV</button>
      </div>
      <div className="ledger">
        {recent.length ? recent.map((x, i) => <div key={x.id || i}>
          <span>{x.reason || x.kind}</span>
          <b className={x.amount < 0 ? 'negative' : 'positive'}>{x.amount > 0 ? '+' : ''}{x.amount}</b>
        </div>) : <div className="empty">Nenhuma movimentação registrada até aqui.</div>}
      </div>
    </section>
  </div>
}
