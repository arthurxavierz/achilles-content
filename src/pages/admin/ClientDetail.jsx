import React, { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Save } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { DEFAULT_PLANS } from '../../../shared/pricing'
import { DEMO_MODE } from '../../lib/config'
import { api } from '../../lib/api'
import { dateTime, money, number } from '../../lib/format'
import { useBilling } from '../../context/BillingContext'

const LONG=['audience','tone','briefing','guardrails','visual_rules','references_text','recurring_elements','forbidden_terms','differentiators','services']
const BRAND_FIELDS=['brand_name','segment','instagram_handle','default_cta','audience','tone','differentiators','services','briefing','guardrails','visual_rules','references_text','recurring_elements','text_style','forbidden_terms']
const LABEL={brand_name:'Nome da marca',segment:'Segmento',instagram_handle:'Instagram',default_cta:'CTA padrão',audience:'Público',tone:'Tom de voz',differentiators:'Diferenciais',services:'Serviços',briefing:'Briefing',guardrails:'Guardrails',visual_rules:'Regras visuais',references_text:'Referências visuais',recurring_elements:'Elementos recorrentes',text_style:'Estilo da tipografia',forbidden_terms:'Termos proibidos'}

export default function ClientDetail(){
  const {id}=useParams()
  const {plans}=useBilling()
  const [data,setData]=useState(null)
  const [tab,setTab]=useState('brand')
  const [msg,setMsg]=useState('')
  const [busy,setBusy]=useState(false)
  const [amount,setAmount]=useState(1000)
  const [reason,setReason]=useState('Ajuste comercial')
  const [planSlug,setPlanSlug]=useState('')

  const planList = plans?.length ? plans : DEFAULT_PLANS

  useEffect(()=>{
    if(DEMO_MODE){
      setData({profile:{id,full_name:'Clínica Aurora',email:'contato@aurora.com.br',active:true,credits:1020,credits_plan:820,credits_extra:200},brand:{brand_name:'Clínica Aurora',segment:'Odontologia',audience:'Pacientes particulares',tone:'Profissional e humano',briefing:'Comunicação premium e clara.',guardrails:'Não prometer resultados.',visual_rules:'Alto contraste e bastante respiro.'},history:[],ledger:[],subscription:null})
      return
    }
    api(`admin-get-client?user_id=${id}`).then(d=>{ setData(d); setPlanSlug(d.subscription?.plan?.slug||'') }).catch(e=>setMsg(e.message))
  },[id])

  if(!data) return <div className="page-loading"><span/></div>

  async function run(fn,ok){
    setBusy(true); setMsg('')
    try{ await fn(); setMsg(ok) }catch(e){ setMsg(e.message) } finally{ setBusy(false) }
  }

  const saveBrand=()=>run(async()=>{ if(!DEMO_MODE) await api('admin-update-client-brand',{method:'POST',body:{user_id:id,brand:data.brand}}) },'Brand Brain atualizado pelo suporte.')

  const grant=()=>{
    if(!reason.trim()) return setMsg('Informe o motivo da concessão.')
    return run(async()=>{
      if(!DEMO_MODE){ await api('admin-grant-credits',{method:'POST',body:{user_id:id,amount:Number(amount),reason,bucket:'extra'}}); setData(await api(`admin-get-client?user_id=${id}`)) }
    },'Créditos concedidos e registrados no extrato.')
  }

  const setPlan=()=>{
    if(!planSlug) return setMsg('Escolha um plano.')
    return run(async()=>{
      if(!DEMO_MODE){ await api('admin-set-plan',{method:'POST',body:{user_id:id,plan_slug:planSlug}}); setData(await api(`admin-get-client?user_id=${id}`)) }
    },'Plano atualizado. Os créditos entram na próxima confirmação de pagamento ou renovação.')
  }

  async function reset(){
    if(DEMO_MODE){ const p='Achi'+Math.random().toString(36).slice(2,10)+'9!'; navigator.clipboard.writeText(p); return setMsg(`Nova senha copiada: ${p}`) }
    return run(async()=>{ const out=await api('admin-reset-password',{method:'POST',body:{user_id:id}}); await navigator.clipboard.writeText(out.password) },'Nova senha copiada para a área de transferência.')
  }

  const toggle=()=>run(async()=>{
    if(!DEMO_MODE) await api('admin-set-client-status',{method:'POST',body:{user_id:id,active:!data.profile.active}})
    setData(d=>({...d,profile:{...d.profile,active:!d.profile.active}}))
  },'Status da conta atualizado.')

  return <div className="page">
    <Link className="back-link" to="/admin"><ArrowLeft size={17}/>Voltar</Link>
    <div className="page-title"><div><span className="eyebrow">CLIENTE</span><h1>{data.profile.full_name||'Sem nome'}</h1><p>{data.profile.email}</p></div><div className={`status ${data.profile.active?'on':'off'}`}>{data.profile.active?'ATIVO':'DESATIVADO'}</div></div>

    <div className="metric-grid">
      <article className="metric gold"><small>SALDO TOTAL</small><strong>{number(data.profile.credits)}</strong><span>{number(data.profile.credits_plan)} plano · {number(data.profile.credits_extra)} avulsos</span></article>
      <article className="metric"><small>PLANO</small><strong>{data.subscription?.plan?.name||'Sem plano'}</strong><span>{data.subscription?.plan?money(data.subscription.plan.price_cents):'apenas avulsos'}</span></article>
      <article className="metric"><small>ENTREGAS</small><strong>{number(data.history?.length||0)}</strong><span>gerações registradas</span></article>
    </div>

    <div className="tabs">{['brand','historico','creditos','conta'].map(x=><button className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{x.toUpperCase()}</button>)}</div>
    {msg&&<div className="form-message">{msg}</div>}

    {tab==='brand'&&<section className="panel">
      <div className="form-grid">{BRAND_FIELDS.map(k=>{
        const long=LONG.includes(k)
        return <label className={long?'wide':''} key={k}>{LABEL[k]}
          {long
            ? <textarea value={data.brand?.[k]||''} onChange={e=>setData(d=>({...d,brand:{...d.brand,[k]:e.target.value}}))}/>
            : <input value={data.brand?.[k]||''} onChange={e=>setData(d=>({...d,brand:{...d.brand,[k]:e.target.value}}))}/>}
        </label>
      })}</div>
      <button className="btn primary" disabled={busy} onClick={saveBrand}><Save size={17}/>SALVAR ALTERAÇÕES</button>
    </section>}

    {tab==='historico'&&<section className="panel"><div className="history-list">
      {data.history?.length?data.history.map(g=><div key={g.id}>
        <div><strong>{g.theme}</strong><span>{g.format} · {dateTime(g.created_at)}</span></div>
        <div><b>{number((g.copy_cost||0)+(g.image_cost||0))} cr</b><span>US$ {Number(g.cost_usd||0).toFixed(3)}</span></div>
      </div>):<div className="empty">Nenhuma geração para exibir.</div>}
    </div></section>}

    {tab==='creditos'&&<section className="panel">
      <div className="client-credit"><strong>{number(data.profile.credits)}</strong><span>saldo total</span></div>
      <div className="form-grid">
        <label>Quantidade<input type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <label>Motivo obrigatório<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
      </div>
      <button className="btn primary" disabled={busy} onClick={grant}>CONCEDER CRÉDITOS AVULSOS</button>
      <div className="panel-head spaced"><div><span className="eyebrow">PLANO</span><h2>ATRIBUIR ASSINATURA</h2></div></div>
      <div className="form-grid">
        <label>Plano<select value={planSlug} onChange={e=>setPlanSlug(e.target.value)}><option value="">Selecione</option>{planList.map(p=><option key={p.slug} value={p.slug}>{p.name} · {number(p.monthlyCredits)} cr</option>)}</select></label>
      </div>
      <button className="btn secondary" disabled={busy} onClick={setPlan}>APLICAR PLANO</button>
      <div className="ledger">{data.ledger?.map(x=><div key={x.id}><span>{x.reason}<i>{dateTime(x.created_at)}</i></span><b className={x.amount<0?'negative':'positive'}>{x.amount>0?'+':''}{number(x.amount)}</b></div>)}</div>
    </section>}

    {tab==='conta'&&<section className="panel account-actions">
      <button className="btn secondary" disabled={busy} onClick={reset}><Copy size={17}/>GERAR NOVA SENHA</button>
      <button className="btn danger" disabled={busy} onClick={toggle}>{data.profile.active?'DESATIVAR CONTA':'REATIVAR CONTA'}</button>
    </section>}
  </div>
}
