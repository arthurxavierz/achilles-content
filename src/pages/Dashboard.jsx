import React, { useEffect, useState } from 'react'
import { ArrowRight, Clock3, Palette, Wand2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEMO_MODE } from '../lib/config'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'
import { dateLong, dateTime, number } from '../lib/format'

// Campos que realmente mudam a qualidade da geracao. O percentual e o
// quanto do Brand Brain esta preenchido, nao um numero decorativo.
const WEIGHTED = ['brand_name','segment','audience','tone','briefing','guardrails','visual_rules','differentiators','services','default_cta','references_text']

export default function Dashboard() {
  const { profile, user } = useAuth()
  const { subscription } = useBilling()
  const [health,setHealth]=useState(DEMO_MODE?72:0)
  const [recent,setRecent]=useState([])

  useEffect(()=>{
    if(DEMO_MODE||!user?.id) return
    supabase.from('brand_profiles').select('*').eq('user_id',user.id).maybeSingle().then(({data})=>{
      if(!data) return setHealth(0)
      const filled=WEIGHTED.filter(key=>String(data[key]||'').trim().length>2).length
      setHealth(Math.round((filled/WEIGHTED.length)*100))
    })
    supabase.from('generations').select('id,theme,format,status,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(5).then(({data})=>setRecent(data||[]))
  },[user?.id])

  const total = (profile?.credits_plan || 0) + (profile?.credits_extra || 0)

  return <div className="page">
    <div className="page-title"><div><span className="eyebrow">VISÃO GERAL</span><h1>SEU CONTEÚDO, EM MOVIMENTO.</h1><p>Saldo, marca e últimas entregas em um único lugar.</p></div><Link to="/app/criar" className="btn primary">CRIAR CONTEÚDO<ArrowRight size={18}/></Link></div>

    <div className="metric-grid">
      <article className="metric gold"><small>SALDO TOTAL</small><strong>{number(total)}</strong><span>créditos disponíveis</span></article>
      <article className="metric"><small>CRÉDITOS DO PLANO</small><strong>{number(profile?.credits_plan || 0)}</strong><span>{subscription?`renovam em ${dateLong(subscription.currentPeriodEnd)}`:'sem plano ativo'}</span></article>
      <article className="metric"><small>CRÉDITOS AVULSOS</small><strong>{number(profile?.credits_extra || 0)}</strong><span>não expiram</span></article>
    </div>

    <div className="dash-grid">
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">ATALHOS</span><h2>CONTINUE DE ONDE PRECISA.</h2></div></div>
        <div className="quick-grid">
          <Link to="/app/criar"><Wand2/><strong>Novo conteúdo</strong><span>Inicie pelo tema e aprove a copy antes das artes.</span></Link>
          <Link to="/app/marca"><Palette/><strong>Revisar Brand Brain</strong><span>Refine tom, identidade e regras da sua marca.</span></Link>
          <Link to="/app/historico"><Clock3/><strong>Abrir histórico</strong><span>Consulte copies, imagens e custos anteriores.</span></Link>
        </div>
        {recent.length>0&&<div className="history-list compact">{recent.map(r=><div key={r.id}><div><strong>{r.theme}</strong><span>{r.format} · {dateTime(r.created_at)}</span></div><i className={r.status==='images_ready'?'on':r.status==='failed'?'off':''}>{r.status==='images_ready'?'Entregue':r.status==='failed'?'Falhou':'Em andamento'}</i></div>)}</div>}
      </section>

      <section className="panel brand-health">
        <span className="eyebrow">BRAND BRAIN</span>
        <h2>{health}%</h2>
        <div className="progress"><i style={{width:`${health}%`}}/></div>
        <p>Quanto mais completo, mais consistente tende a ser cada geração.</p>
        <Link to="/app/marca">{health>=90?'REVISAR':'COMPLETAR AGORA'}<ArrowRight size={16}/></Link>
      </section>
    </div>
  </div>
}
