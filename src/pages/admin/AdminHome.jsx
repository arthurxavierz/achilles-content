import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Copy, Plus, RefreshCw, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEFAULT_PLANS } from '../../../shared/pricing'
import { DEMO_MODE } from '../../lib/config'
import { api } from '../../lib/api'
import { dateTime, money, number } from '../../lib/format'
import { useBilling } from '../../context/BillingContext'
import { useToast } from '../../components/Toast'

const demoClients=[{id:'c1',full_name:'Boost Imóveis',email:'contato@boost.com.br',active:true,credits:5810},{id:'c2',full_name:'Clínica Aurora',email:'contato@aurora.com.br',active:true,credits:1020},{id:'c3',full_name:'Studio RX',email:'studio@rx.com.br',active:false,credits:12170}]
const demoMetrics={active_clients:19,mrr_cents:836100,credits_circulation:429100,credits_used_month:184700,revenue_month_cents:591400,api_cost_month_cents:121800,margin_pct:79,pending_payments:2,usd_brl:5.6}

export default function AdminHome(){
  const { plans } = useBilling()
  const notify = useToast()
  const [metrics,setMetrics]=useState(DEMO_MODE?demoMetrics:{})
  const [clients,setClients]=useState(DEMO_MODE?demoClients:[])
  const [queue,setQueue]=useState({payments:[],requests:[],failed_jobs:[]})
  const [open,setOpen]=useState(false)
  const [created,setCreated]=useState(null)
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState('')
  const [totals,setTotals]=useState({})
  const [query,setQuery]=useState('')
  const [form,setForm]=useState({full_name:'',email:'',password:'',plan_slug:'pro',initial_credits:200})

  const planList = plans?.length ? plans : DEFAULT_PLANS

  async function load(){
    if(DEMO_MODE) return
    const [m,c,q]=await Promise.all([api('admin-metrics'),api('admin-list-clients'),api('admin-list-pending')])
    setMetrics(m); setClients(c.clients||[]); setTotals(c.totals||{}); setQueue(q)
  }
  useEffect(()=>{ load().catch(e=>setMsg(e.message)) },[])
  const reload=()=>load().catch(e=>notify.error(e.message))

  function strongPassword(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$'
    let s=''
    crypto.getRandomValues(new Uint32Array(16)).forEach(n=>s+=chars[n%chars.length])
    setForm(f=>({...f,password:s}))
  }

  async function create(e){
    e.preventDefault(); setBusy(true); setMsg('')
    try{
      if(DEMO_MODE){ setCreated({...form,id:'demo-new'}) }
      else{ const out=await api('admin-create-client',{method:'POST',body:{...form,initial_credits:Number(form.initial_credits)}}); setCreated({...out.client,password:form.password}); notify.success('Cliente criado. Copie as credenciais antes de fechar.'); await load() }
    }catch(e){ notify.error(e.message) } finally{ setBusy(false) }
  }

  // Conciliacao: o admin confere o PIX no extrato do banco e decide aqui.
  async function resolvePayment(id,status){
    // Confirmar concede credito na hora e nao tem desfazer.
    const ok=status==='approved'
      ? confirm('Confirmar este pagamento? Os créditos entram na conta do cliente imediatamente.')
      : confirm('Recusar este pagamento?')
    if(!ok) return
    setBusy(true)
    try{
      const out=await api('admin-resolve-payment',{method:'POST',body:{payment_id:id,status}})
      notify.success(out.status==='approved'?`Pagamento confirmado. ${out.credits?`${number(out.credits)} créditos liberados.`:'Créditos liberados.'}`:'Pagamento recusado.')
      await load()
    }catch(e){ notify.error(e.message) } finally{ setBusy(false) }
  }

  async function resolveRequest(id,status){
    setBusy(true)
    try{
      await api('admin-resolve-request',{method:'POST',body:{request_id:id,status}})
      notify.success(status==='approved'?'Solicitação aprovada e créditos concedidos.':'Solicitação negada.')
      await load()
    }catch(e){ notify.error(e.message) } finally{ setBusy(false) }
  }

  const pending=queue.payments||[]

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    if(!q) return clients
    return clients.filter(c=>`${c.full_name||''} ${c.email||''} ${c.plan_name||''}`.toLowerCase().includes(q))
  },[clients,query])

  return <div className="page">
    <div className="page-title"><div><span className="eyebrow">ADMINISTRAÇÃO</span><h1>OPERAÇÃO ACHILLES CONTENT.</h1><p>Clientes, receita, créditos e conciliação em um único painel.</p></div><button className="btn primary" onClick={()=>{setOpen(true);setCreated(null)}}><Plus size={18}/>NOVO CLIENTE</button></div>

    {msg&&<div className="form-message error">{msg}</div>}

    <div className="metric-grid four">
      <article className="metric gold"><small>CLIENTES ATIVOS</small><strong>{number(metrics.active_clients)}</strong><span>base ativa</span></article>
      <article className="metric"><small>MRR CONTRATADO</small><strong>{money(metrics.mrr_cents)}</strong><span>assinaturas ativas</span></article>
      <article className="metric"><small>RECEBIDO NO MÊS</small><strong>{money(metrics.revenue_month_cents)}</strong><span>pagamentos confirmados</span></article>
      <article className={`metric ${metrics.margin_pct!=null&&metrics.margin_pct<50?'danger':''}`}><small>MARGEM DO MÊS</small><strong>{metrics.margin_pct==null?'—':`${metrics.margin_pct}%`}</strong><span>custo de API {money(metrics.api_cost_month_cents)}</span></article>
    </div>

    <div className="metric-grid">
      <article className="metric"><small>CRÉDITOS EM CIRCULAÇÃO</small><strong>{number(metrics.credits_circulation)}</strong><span>passivo a entregar</span></article>
      <article className="metric"><small>CONSUMIDOS NO MÊS</small><strong>{number(metrics.credits_used_month)}</strong><span>saída de saldo</span></article>
      <article className="metric"><small>CUSTO REAL DE API</small><strong>US$ {Number(metrics.api_cost_month_usd||0).toFixed(2)}</strong><span>câmbio {Number(metrics.usd_brl||5.6).toFixed(2)}</span></article>
    </div>

    {pending.length>0&&<section className="panel queue-panel">
      <div className="panel-head"><div><span className="eyebrow">CONCILIAÇÃO</span><h2>PAGAMENTOS AGUARDANDO BAIXA.</h2></div><span className="status on">{pending.length} na fila</span></div>
      <div className="queue-list">{pending.map(p=><div key={p.id}>
        <div><strong>{p.profile?.full_name||p.profile?.email}</strong><span>{p.plan?.name||p.pack?.name} · {money(p.amount_cents)} · {number(p.credits)} cr · {dateTime(p.created_at)}</span></div>
        <div className="queue-actions">
          <button className="small-btn ok" disabled={busy} onClick={()=>resolvePayment(p.id,'approved')}><Check size={15}/>CONFIRMAR</button>
          <button className="small-btn no" disabled={busy} onClick={()=>resolvePayment(p.id,'rejected')}><X size={15}/>RECUSAR</button>
        </div>
      </div>)}</div>
      <p className="hint">Confira o PIX no extrato antes de confirmar. Confirmar concede os créditos imediatamente e registra no log de auditoria.</p>
    </section>}

    {queue.requests?.length>0&&<section className="panel queue-panel">
      <div className="panel-head"><div><span className="eyebrow">SOLICITAÇÕES</span><h2>PEDIDOS DE CRÉDITO.</h2></div></div>
      <div className="queue-list">{queue.requests.map(r=><div key={r.id}>
        <div><strong>{r.profile?.full_name||r.profile?.email}</strong><span>{number(r.amount)} créditos · {dateTime(r.created_at)}</span></div>
        <div className="queue-actions">
          <button className="small-btn ok" disabled={busy} onClick={()=>resolveRequest(r.id,'approved')}><Check size={15}/>APROVAR</button>
          <button className="small-btn no" disabled={busy} onClick={()=>resolveRequest(r.id,'rejected')}><X size={15}/>NEGAR</button>
        </div>
      </div>)}</div>
    </section>}

    {queue.failed_jobs?.length>0&&<section className="panel queue-panel">
      <div className="panel-head"><div><span className="eyebrow">ATENÇÃO</span><h2>GERAÇÕES QUE FALHARAM.</h2></div></div>
      <div className="queue-list">{queue.failed_jobs.map(j=><div key={j.id}>
        <div><strong><AlertTriangle size={15}/> {j.generations?.theme||'Geração'}</strong><span>{j.done_count}/{j.total_count} · {j.last_error}</span></div>
      </div>)}</div>
      <p className="hint">Os créditos das artes não entregues já foram estornados automaticamente.</p>
    </section>}

    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">CONTAS</span><h2>TODOS OS CADASTRADOS.</h2></div>
        <button className="small-btn" onClick={reload}><RefreshCw size={15}/>ATUALIZAR</button>
      </div>

      <div className="account-summary">
        <div><small>CONTAS</small><strong>{number(totals.accounts ?? clients.length)}</strong></div>
        <div><small>ATIVAS</small><strong>{number(totals.active ?? clients.filter(c=>c.active).length)}</strong></div>
        <div><small>CRÉDITOS EM PODER DELAS</small><strong>{number(totals.credits)}</strong></div>
        <div><small>GERAÇÕES</small><strong>{number(totals.generations)}</strong></div>
      </div>

      <div className="filters">
        <label><Search size={17}/><input placeholder="Buscar por nome, e-mail ou plano" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      </div>

      <div className="account-table">
        <div className="account-head"><span>Conta</span><span>Plano</span><span>Saldo</span><span>Entregas</span><span>Status</span></div>
        {filtered.map(c=><Link to={`/admin/clientes/${c.id}`} key={c.id}>
          <div className="account-who">
            <strong>{c.full_name||'Sem nome'}{c.role==='admin'&&<em className="role-tag">ADMIN</em>}</strong>
            <span>{c.email}</span>
          </div>
          <div className="account-plan"><strong>{c.plan_name||'Sem plano'}</strong><span>{c.subscription_status||'avulso'}</span></div>
          <div className="account-credits"><strong>{number(c.credits||0)}</strong><span>{number(c.credits_plan||0)} plano · {number(c.credits_extra||0)} avulsos</span></div>
          <div className="account-usage"><strong>{number(c.delivered||0)}</strong><span>{number(c.generations||0)} gerações{c.cost_usd?` · US$ ${Number(c.cost_usd).toFixed(2)}`:''}</span></div>
          <i className={c.active?'on':'off'}>{c.active?'Ativo':'Desativado'}</i>
        </Link>)}
        {!filtered.length&&<div className="empty">{clients.length?'Nenhuma conta encontrada para essa busca.':'Nenhuma conta cadastrada ainda.'}</div>}
      </div>
    </section>

    {open&&<div className="modal-back" onClick={()=>setOpen(false)}><form className="modal" onClick={e=>e.stopPropagation()} onSubmit={create}>
      <span className="eyebrow">NOVO CLIENTE</span><h2>CRIAR ACESSO COMPLETO</h2>
      <label>Nome completo ou empresa<input value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))} required/></label>
      <label>E-mail de login<input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} required/></label>
      <label>Senha<div className="inline-input"><input value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} minLength={10} required/><button type="button" onClick={strongPassword}>GERAR</button></div></label>
      <label>Plano<select value={form.plan_slug} onChange={e=>setForm(f=>({...f,plan_slug:e.target.value}))}>{planList.map(p=><option key={p.slug} value={p.slug}>{p.name} · {number(p.monthlyCredits)} cr</option>)}</select></label>
      <label>Créditos avulsos iniciais<input type="number" min="0" value={form.initial_credits} onChange={e=>setForm(f=>({...f,initial_credits:e.target.value}))}/></label>
      {created
        ? <div className="created-box"><strong>CLIENTE CRIADO</strong><p>{created.email}</p><p>{created.password||form.password}</p><button type="button" onClick={()=>navigator.clipboard.writeText(`Achilles Content\nLogin: ${created.email}\nSenha: ${created.password||form.password}`)}><Copy size={16}/>COPIAR CREDENCIAIS</button><a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Seu acesso ao Achilles Content está pronto. Login: ${created.email}. Senha: ${created.password||form.password}`)}`}>ABRIR WHATSAPP</a></div>
        : <button className="btn primary" disabled={busy}>{busy?<RefreshCw className="spin"/>:'CRIAR CLIENTE'}</button>}
    </form></div>}
  </div>
}
