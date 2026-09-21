import React, { useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { DEFAULT_PRESETS } from '../../shared/pricing'
import { DEMO_MODE } from '../lib/config'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { uid } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'

const empty = { brand_name:'', segment:'', audience:'', tone:'Profissional, direto e humano.', primary_color:'#D8AF58', secondary_color:'#111111', typography:'Anton para títulos e Inter para textos', briefing:'', guardrails:'', visual_rules:'', differentiators:'', services:'', default_cta:'', instagram_handle:'', references_text:'', forbidden_terms:'', preset_slug:'editorial', recurring_elements:'', render_text:false, text_style:'' }

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

  // ---- Referencias visuais -------------------------------------------
  // O upload vai direto do navegador para o Storage, com o JWT do usuario.
  // As policies do bucket garantem que ninguem escreve na pasta de outro.
  const [refs, setRefs] = useState([])
  const [upBusy, setUpBusy] = useState(false)
  const MAX_REFS = 6

  async function loadRefs(){
    if (DEMO_MODE || !user?.id) return
    const { data } = await supabase.from('brand_reference_images').select('*').eq('user_id', user.id).order('position')
    const withUrls = await Promise.all((data||[]).map(async row => {
      const { data: signed } = await supabase.storage.from('brand-references').createSignedUrl(row.storage_path, 3600)
      return { ...row, url: signed?.signedUrl || '' }
    }))
    setRefs(withUrls)
  }
  useEffect(() => { loadRefs() }, [user?.id])

  async function uploadRefs(event){
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (refs.length + files.length > MAX_REFS) return setMsg(`Máximo de ${MAX_REFS} referências.`)
    setUpBusy(true); setMsg('')
    try{
      let position = refs.length
      for (const file of files){
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use PNG, JPG ou WEBP.')
        if (file.size > 8 * 1024 * 1024) throw new Error('Cada imagem precisa ter no máximo 8 MB.')
        const ext = file.type.split('/')[1].replace('jpeg','jpg')
        const path = `${user.id}/${uid()}.${ext}`
        const { error: upErr } = await supabase.storage.from('brand-references').upload(path, file, { contentType: file.type })
        if (upErr) throw upErr
        position += 1
        const { error: rowErr } = await supabase.from('brand_reference_images').insert({ user_id: user.id, storage_path: path, label: file.name.slice(0,120), position })
        if (rowErr) throw rowErr
      }
      await loadRefs()
      setMsg('Referências enviadas. Elas passam a ser anexadas em cada geração.')
    }catch(e){ setMsg(e.message) } finally { setUpBusy(false) }
  }

  async function removeRef(row){
    setUpBusy(true); setMsg('')
    try{
      await supabase.storage.from('brand-references').remove([row.storage_path])
      await supabase.from('brand_reference_images').delete().eq('id', row.id)
      await loadRefs()
    }catch(e){ setMsg(e.message) } finally { setUpBusy(false) }
  }

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

        <div className="field-head"><span className="eyebrow">REFERÊNCIAS DE IMAGEM</span><small>Anexadas a cada arte gerada. É o que reproduz mascote, paleta e acabamento.</small></div>
        <div className="ref-grid">
          {refs.map(row=><figure key={row.id}>
            {row.url&&<img src={row.url} alt={row.label||'Referência'} loading="lazy"/>}
            <button type="button" onClick={()=>removeRef(row)} disabled={upBusy} aria-label="Remover referência"><Trash2 size={15}/></button>
          </figure>)}
          {refs.length<MAX_REFS&&<label className="ref-add">
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={uploadRefs} disabled={upBusy} hidden/>
            <Plus size={22}/><span>{upBusy?'Enviando':'Adicionar'}</span>
          </label>}
        </div>
        <p className="hint">Use de duas a quatro peças reais da marca, as que melhor representam o padrão. Só as duas primeiras entram em cada geração, então coloque as melhores no começo. Cada referência anexada soma um pouco no custo da imagem.</p>
        <div className="form-grid">
          <label className="wide">Regras visuais<textarea rows="4" value={brand.visual_rules} onChange={e=>set('visual_rules',e.target.value)} placeholder="Fundo escuro, dourado como destaque, composição editorial, muito respiro."/></label>
          <label className="wide">Referências visuais<textarea rows="4" value={brand.references_text} onChange={e=>set('references_text',e.target.value)} placeholder="Descreva ou cole links de perfis e campanhas que representam o padrão que você quer."/></label>
          <label className="wide">Elementos recorrentes<textarea rows="3" value={brand.recurring_elements} onChange={e=>set('recurring_elements',e.target.value)} placeholder="O que aparece em toda peça: mascote, tipo de interface, motivos gráficos, textura de fundo."/></label>
        </div>

        <div className="field-head"><span className="eyebrow">TEXTO NA ARTE</span><small>Define o padrão da marca. Cada geração ainda pode escolher diferente.</small></div>
        <div className="switch-row">
          <button type="button" className={brand.render_text?'switch on':'switch'} onClick={()=>set('render_text',!brand.render_text)} aria-pressed={brand.render_text}><i/></button>
          <div><strong>{brand.render_text?'A arte já vem com o título escrito':'A arte vem limpa, sem texto'}</strong><span>{brand.render_text?'Pronta para publicar. O modelo pode errar uma letra, e aí é só refazer a peça.':'Você aplica a tipografia depois, no seu editor. Controle total.'}</span></div>
        </div>
        <div className="form-grid">
          <label className="wide">Estilo da tipografia<textarea rows="3" value={brand.text_style} onChange={e=>set('text_style',e.target.value)} placeholder="Tipografia condensada pesada em caixa alta. Título em branco com uma palavra destacada na cor principal."/></label>
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
