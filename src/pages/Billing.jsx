import React, { useMemo, useState } from 'react'
import { ArrowRight, Check, Clock3, Copy as CopyIcon, Download, X } from 'lucide-react'
import { DEFAULT_PACKS, DEFAULT_PLANS, QUALITIES, imageCredits } from '../../shared/pricing'
import { DEMO_MODE } from '../lib/config'
import { api } from '../lib/api'
import { dateLong, dateTime, money, number } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'

export default function Billing(){
  const { profile } = useAuth()
  const { subscription, plans, packs, recent=[], pending=[], pricing, refresh } = useBilling()
  const [msg,setMsg]=useState('')
  const [charge,setCharge]=useState(null)
  const [busy,setBusy]=useState(false)
  const [copied,setCopied]=useState(false)

  const list = plans?.length ? plans : DEFAULT_PLANS
  const packList = packs?.length ? packs : DEFAULT_PACKS
  const plan = subscription?.plan || null
  const total = (profile?.credits_plan||0)+(profile?.credits_extra||0)

  // Consumo dos ultimos 14 dias, direto do extrato.
  const chart = useMemo(()=>{
    const days=Array.from({length:14},(_,i)=>{ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(13-i)); return {day:d.toISOString().slice(0,10),value:0} })
    for(const row of recent){
      if(row.amount>=0) continue
      const key=String(row.created_at).slice(0,10)
      const hit=days.find(d=>d.day===key)
      if(hit) hit.value+=Math.abs(row.amount)
    }
    const max=Math.max(1,...days.map(d=>d.value))
    return days.map(d=>({...d,height:Math.round((d.value/max)*100)}))
  },[recent])

  async function buy(kind,slug){
    if(DEMO_MODE) return setMsg('Compra indisponível no modo demonstração.')
    setBusy(true); setMsg(''); setCopied(false)
    try{ setCharge(await api('create-pix-charge',{method:'POST',body:{kind,slug}})); await refresh() }
    catch(e){ setMsg(e.message) } finally{ setBusy(false) }
  }

  function copyPix(){
    if(!charge) return
    navigator.clipboard.writeText(charge.pix_payload)
    setCopied(true)
    setTimeout(()=>setCopied(false),2500)
  }

  function csv(){
    const rows=[['data','movimentacao','creditos','saldo'],...recent.map(x=>[x.created_at,x.reason||x.kind,x.amount,x.balance_after])]
    const blob=new Blob([rows.map(r=>r.join(';')).join('\n')],{type:'text/csv;charset=utf-8'})
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='achilles-extrato.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  return <div className="page">
    <div className="page-title"><div><span className="eyebrow">PLANOS E CRÉDITOS</span><h1>CONTROLE O SEU CONSUMO.</h1><p>Plano mensal e créditos avulsos funcionam em saldos separados.</p></div></div>

    <section className="billing-hero">
      <div><small>SALDO TOTAL</small><strong>{number(total)}</strong><span>{number(profile?.credits_plan||0)} do plano · {number(profile?.credits_extra||0)} avulsos</span></div>
      <div><small>PLANO ATUAL</small><strong>{plan?.name||'Sem plano'}</strong><span>{plan?money(plan.priceCents)+' por mês':'Você usa apenas créditos avulsos'}</span></div>
      <div><small>PRÓXIMA RENOVAÇÃO</small><strong>{dateLong(subscription?.currentPeriodEnd)}</strong><span>créditos avulsos não expiram</span></div>
    </section>

    {msg&&<div className="form-message error">{msg}</div>}

    {pending.length>0&&<section className="panel pending-panel">
      <div className="panel-head"><div><span className="eyebrow">AGUARDANDO CONFIRMAÇÃO</span><h2>PAGAMENTO EM ANÁLISE.</h2></div></div>
      <div className="ledger">{pending.map(p=><div key={p.id}><span><Clock3 size={15}/> {p.plan?.name||p.pack?.name} · {money(p.amount_cents)}</span><b>{number(p.credits)} cr</b></div>)}</div>
      <p className="hint">A Achilles confirma o PIX no extrato e libera os créditos. Costuma levar poucas horas em dia útil.</p>
    </section>}

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">CONSUMO</span><h2>ÚLTIMOS 14 DIAS</h2></div></div>
      <div className="bar-chart">{chart.map(x=><i key={x.day} style={{height:`${Math.max(4,x.height)}%`}} title={`${x.value} créditos em ${x.day}`}/>)}</div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">TABELA DE CONSUMO</span><h2>QUANTO CUSTA CADA COISA.</h2></div></div>
      <div className="pricing-table">
        <div><strong>Copy de post ou story</strong><b>{number(pricing?.copy_post?.credits||0)} cr</b></div>
        <div><strong>Copy de carrossel, 5 slides</strong><b>{number(pricing?.copy_carousel?.credits||0)} cr</b></div>
        {QUALITIES.map(q=><div key={q.slug}><strong>Imagem {q.label}</strong><b>{number(imageCredits(pricing,q.slug))} cr</b></div>)}
      </div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">ASSINATURA</span><h2>ESCOLHA O SEU RITMO.</h2></div></div>
      <div className="plan-grid inside">{list.map(p=><article key={p.slug} className={p.slug===plan?.slug?'current':p.badge?'featured':''}>
        {p.badge&&<span className="tag">{p.badge}</span>}
        <h3>{p.name}</h3>
        <div className="price">{money(p.priceCents)}<small>/mês</small></div>
        <strong>{number(p.monthlyCredits)} créditos</strong>
        <p>{p.brands?`${p.brands} ${p.brands===1?'marca':'marcas'}`:'Marcas ilimitadas'} · Histórico {String(p.history||'').toLowerCase()}.</p>
        <button className="btn primary" disabled={busy||p.slug===plan?.slug} onClick={()=>buy('plan',p.slug)}>{p.slug===plan?.slug?'PLANO ATUAL':'GERAR PIX'}</button>
      </article>)}</div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">CRÉDITOS AVULSOS</span><h2>COMPLEMENTE SEM ALTERAR O PLANO.</h2></div></div>
      <div className="pack-grid">{packList.map(p=><article key={p.slug}>
        {p.badge&&<span className="tag">{p.badge}</span>}
        <strong>{number(p.credits)}</strong><span>créditos</span><b>{money(p.priceCents)}</b>
        <button disabled={busy} onClick={()=>buy('credit_pack',p.slug)}>GERAR PIX<ArrowRight size={16}/></button>
      </article>)}</div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">EXTRATO</span><h2>MOVIMENTAÇÕES RECENTES</h2></div><button className="small-btn" onClick={csv}><Download size={16}/>CSV</button></div>
      <div className="ledger">{recent.length?recent.map((x,i)=><div key={i}><span>{x.reason||x.kind}<i>{dateTime(x.created_at)}</i></span><b className={x.amount<0?'negative':'positive'}>{x.amount>0?'+':''}{number(x.amount)}</b></div>):<div className="empty">Nenhuma movimentação ainda.</div>}</div>
    </section>

    {charge&&<div className="modal-back" onClick={()=>setCharge(null)}><div className="modal pix-modal" onClick={e=>e.stopPropagation()}>
      <button className="drawer-x" onClick={()=>setCharge(null)} aria-label="Fechar"><X/></button>
      <span className="eyebrow">PAGAMENTO VIA PIX</span>
      <h2>{charge.item?.name}</h2>
      <div className="pix-amount"><strong>{money(charge.amount_cents)}</strong><span>{number(charge.item?.credits||0)} créditos</span></div>
      <img className="pix-qr" src={charge.qr_data_url} alt="QR Code do PIX"/>
      <button className="btn primary" onClick={copyPix}>{copied?<><Check size={17}/>CÓDIGO COPIADO</>:<><CopyIcon size={17}/>COPIAR CÓDIGO PIX</>}</button>
      <code className="pix-code">{charge.pix_payload}</code>
      <p className="hint">Identificador: {charge.txid}. Válido até {dateTime(charge.expires_at)}. Após o pagamento, a Achilles confere o extrato e libera os créditos na sua conta.</p>
    </div></div>}
  </div>
}
