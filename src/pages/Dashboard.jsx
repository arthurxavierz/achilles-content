import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Clock3, Palette, Wand2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEMO_MODE } from '../lib/config'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'
import { dateLong } from '../lib/format'

// Campos que realmente mudam a qualidade da geracao.
// A porcentagem exibida vem daqui, nao de um numero fixo.
const BRAND_FIELDS = [
  'brand_name', 'segment', 'audience', 'tone', 'briefing',
  'guardrails', 'visual_rules', 'differentiators', 'services', 'default_cta'
]

const demoBrand = {
  brand_name: 'Clínica Aurora', segment: 'Odontologia', audience: 'Pacientes particulares',
  tone: 'Profissional e humano', briefing: 'Comunicação premium.', guardrails: 'Sem promessas.',
  visual_rules: 'Alto contraste.', differentiators: '', services: '', default_cta: ''
}

export default function Dashboard() {
  const { user, profile } = useAuth()
  const { subscription } = useBilling()
  const [brand, setBrand] = useState(DEMO_MODE ? demoBrand : null)

  useEffect(() => {
    if (DEMO_MODE || !user?.id) return
    supabase.from('brand_profiles').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setBrand(data || {}))
  }, [user?.id])

  const completeness = useMemo(() => {
    if (!brand) return null
    const filled = BRAND_FIELDS.filter(key => String(brand[key] || '').trim().length > 2).length
    return Math.round((filled / BRAND_FIELDS.length) * 100)
  }, [brand])

  const total = (profile?.credits_plan || 0) + (profile?.credits_extra || 0)
  const pastDue = subscription?.status === 'past_due'

  return <div className="page">
    <div className="page-title">
      <div>
        <span className="eyebrow">VISÃO GERAL</span>
        <h1>SEU CONTEÚDO, EM MOVIMENTO.</h1>
        <p>Saldo, marca e últimas entregas em um único lugar.</p>
      </div>
      <Link to="/app/criar" className="btn primary">CRIAR CONTEÚDO<ArrowRight size={18} /></Link>
    </div>

    {pastDue && <div className="alert warn">
      <AlertTriangle size={18} />
      <div>
        <strong>Ciclo encerrado.</strong>
        <span>Os créditos do plano expiraram. <Link to="/app/planos">Renove para liberar o novo saldo.</Link></span>
      </div>
    </div>}

    <div className="metric-grid">
      <article className="metric gold">
        <small>SALDO TOTAL</small><strong>{total}</strong><span>créditos disponíveis</span>
      </article>
      <article className="metric">
        <small>CRÉDITOS DO PLANO</small>
        <strong>{profile?.credits_plan || 0}</strong>
        <span>{pastDue ? 'ciclo vencido' : `renovam em ${dateLong(subscription?.currentPeriodEnd)}`}</span>
      </article>
      <article className="metric">
        <small>CRÉDITOS AVULSOS</small><strong>{profile?.credits_extra || 0}</strong><span>não expiram</span>
      </article>
    </div>

    <div className="dash-grid">
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">ATALHOS</span><h2>CONTINUE DE ONDE PRECISA.</h2></div></div>
        <div className="quick-grid">
          <Link to="/app/criar"><Wand2 /><strong>Novo conteúdo</strong><span>Inicie pelo tema e aprove a copy antes das artes.</span></Link>
          <Link to="/app/marca"><Palette /><strong>Revisar Brand Brain</strong><span>Refine tom, identidade e regras da sua marca.</span></Link>
          <Link to="/app/historico"><Clock3 /><strong>Abrir histórico</strong><span>Consulte copies, imagens e custos anteriores.</span></Link>
        </div>
      </section>

      <section className="panel brand-health">
        <span className="eyebrow">BRAND BRAIN</span>
        <h2>{completeness === null ? '—' : `${completeness}%`}</h2>
        <div className="progress"><i style={{ width: `${completeness || 0}%` }} /></div>
        <p>Quanto mais completo, mais consistente tende a ser cada geração.</p>
        <Link to="/app/marca">{completeness === 100 ? 'REVISAR' : 'COMPLETAR AGORA'}<ArrowRight size={16} /></Link>
      </section>
    </div>
  </div>
}
