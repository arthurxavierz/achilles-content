import React, { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { DEFAULT_PRESETS } from '../../shared/pricing'
import { DEMO_MODE } from '../lib/config'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'

const empty = { brand_name:'', segment:'', audience:'', tone:'Profissional, direto e humano.', primary_color:'#D8AF58', secondary_color:'#111111', typography:'Anton para títulos e Inter para textos', briefing:'', guardrails:'', visual_rules:'', differentiators:'', services:'', default_cta:'', instagram_handle:'', references_text:'', forbidden_terms:'', preset_slug:'editorial' }

// So estes campos vao para a API. Evita mandar id, user_id e timestamps de volta.
const FIELDS = Object.keys(empty)

export default function Brand() {
  const { user } = useAuth()
  const { presets } = useBilling()
  const [brand, setBrand] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (DEMO_MODE) { setBrand({...empty, brand_name:'Clínica Aurora', segment:'Clínica odontológica', audience:'Adultos que valorizam clareza, estética e atendimento particular.', briefing:'Posicionamento premium, objetivo e acessível.', guardrails:'Não prometer resultados. Não usar emojis. Evitar exageros.', visual_rules:'Fundo escuro, dourado como destaque, composição editorial e bastante respiro.'}); return }
    supabase.from('brand_profiles').select('*').eq('user_id', user.id).maybeSingle().then(({data}) => {
      if (data) setBrand({...empty, ...Object.fromEntries(FIELDS.map(k => [k, data[k] ?? empty[k]]))})
    })
  }, [user?.id])

  function set(key,value){ setBrand(b=>({...b,[key]:value})) }

  async function save(e){
    e.preventDefault(); setBusy(true); setMsg('')
    try{
      if(!DEMO_MODE) await api('save-brand',{method:'POST',body:Object.fromEntries(FIELDS.map(k=>[k,brand[k]??'']))})
      setMsg('Brand Brain salvo com sucesso.')
    }catch(e){ setMsg(e.message) } finally { setBusy(false) }
  }

  const presetList = presets?.length ? presets : DEFAULT_PRESETS

  return <div className="page">
    <div className="page-title"><div><span className="eyebrow">BRAND BRAIN</span><h1>SUA MARCA COMO REGRA.</h1><p>Essas informações orientam as próximas copies e direções visuais.</p></div></div>
    <form className="brand-form" onSubmit={save}>

      <section className="panel"><div className="panel-head"><div><span className="eyebrow">IDENTIDADE</span><h2>BASE DA MARCA</h2></div></div>
        <div className="form-grid">
          <label>Nome da marca<input value={brand.brand_name} onChange={e=>set('brand_name',e.target.value)} /></label>
          <label>Segmento<input value={brand.segment} onChange={e=>set('segment',e.target.value)} /></label>
          <label>Perfil no Instagram<input value={brand.instagram_handle} onChange={e=>set('instagram_handle',e.target.value)} placeholder="@suamarca"/></label>
          <label>Tipografia<input value={brand.typography} onChange={e=>set('typography',e.target.value)}/></label>
          <label>Cor principal<div className="color-input"><input type="color" value={brand.primary_color} onChange={e=>set('primary_color',e.target.value)}/><input value={brand.primary_color} onChange={e=>set('primary_color',e.target.value)}/></div></label>
          <label>Cor secundária<div className="color-input"><input type="color" value={brand.secondary_color} onChange={e=>set('secondary_color',e.target.value)}/><input value={brand.secondary_color} onChange={e=>set('secondary_color',e.target.value)}/></div></label>
        </div>
      </section>

      <section className="panel"><div className="panel-head"><div><span className="eyebrow">COMUNICAÇÃO</span><h2>O QUE A MARCA DIZ E COMO DIZ.</h2></div></div>
        <div className="form-grid">
          <label className="wide">Público<textarea value={brand.audience} onChange={e=>set('audience',e.target.value)}/></label>
          <label className="wide">Tom de voz<textarea value={brand.tone} onChange={e=>set('tone',e.target.value)}/></label>
          <label>Diferenciais<textarea value={brand.differentiators} onChange={e=>set('differentiators',e.target.value)}/></label>
          <label>Serviços principais<textarea value={brand.services} onChange={e=>set('services',e.target.value)}/></label>
          <label className="wide">CTA padrão<input value={brand.default_cta} onChange={e=>set('default_cta',e.target.value)}/></label>
        </div>
      </section>

      <section className="panel"><div className="panel-head"><div><span className="eyebrow">DIREÇÃO VISUAL</span><h2>COMO A MARCA APARECE.</h2></div></div>
        <div className="preset-grid">{presetList.map(p=><button type="button" key={p.slug} className={brand.preset_slug===p.slug?'active':''} onClick={()=>set('preset_slug',p.slug)}><strong>{p.name}</strong><span>{p.summary}</span></button>)}</div>
        <div className="form-grid">
          <label className="wide">Regras visuais<textarea rows="4" value={brand.visual_rules} onChange={e=>set('visual_rules',e.target.value)} placeholder="Fundo escuro, dourado como destaque, composição editorial, muito respiro."/></label>
          <label className="wide">Referências visuais<textarea rows="4" value={brand.references_text} onChange={e=>set('references_text',e.target.value)} placeholder="Descreva ou cole links de perfis e campanhas que representam o padrão que você quer."/></label>
        </div>
      </section>

      <section className="panel"><div className="panel-head"><div><span className="eyebrow">LIMITES</span><h2>BRIEFING E GUARDRAILS.</h2></div></div>
        <div className="form-grid">
          <label className="wide">Briefing<textarea rows="5" value={brand.briefing} onChange={e=>set('briefing',e.target.value)}/></label>
          <label className="wide">Guardrails<textarea rows="5" value={brand.guardrails} onChange={e=>set('guardrails',e.target.value)} placeholder="Não prometer resultado. Não citar concorrente. Não usar emoji."/></label>
          <label className="wide">Termos proibidos<textarea rows="3" value={brand.forbidden_terms} onChange={e=>set('forbidden_terms',e.target.value)} placeholder="Palavras que nunca podem aparecer, separadas por vírgula."/></label>
        </div>
      </section>

      {msg&&<div className="form-message">{msg}</div>}
      <button className="btn primary" disabled={busy}><Save size={18}/>{busy?'SALVANDO':'SALVAR BRAND BRAIN'}</button>
    </form>
  </div>
}
