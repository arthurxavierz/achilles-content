import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Images, Plus, Save, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { DEFAULT_PRESETS, analysisCredits } from '../../shared/pricing'
import { BRAND_FIELD_KEYS } from '../../shared/brand-fields'
import { DEMO_MODE } from '../lib/config'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { number, uid } from '../lib/format'
import { shrinkImage } from '../lib/shrink'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'
import { useToast } from '../components/Toast'

const empty = { brand_name:'', segment:'', audience:'', tone:'Profissional, direto e humano.', primary_color:'#D8AF58', secondary_color:'#111111', typography:'Anton para títulos e Inter para textos', briefing:'', guardrails:'', visual_rules:'', differentiators:'', services:'', default_cta:'', instagram_handle:'', references_text:'', forbidden_terms:'', preset_slug:'editorial', recurring_elements:'', render_text:false, text_style:'', copy_rules:'', image_rules:'' }

// So estes campos vao para a API. Evita mandar id, user_id e timestamps de volta.
const FIELDS = Object.keys(empty)

const MAX_REFS = 6
const POLL_MS = 3000
const POLL_LIMIT = 60   // tres minutos

export default function Brand() {
  const { user } = useAuth()
  const { presets, pricing, refresh } = useBilling()
  const notify = useToast()
  const [brand, setBrand] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(DEMO_MODE)

  useEffect(() => {
    if (DEMO_MODE) { setBrand({...empty, brand_name:'Clínica Aurora', segment:'Clínica odontológica', audience:'Adultos que valorizam clareza, estética e atendimento particular.', briefing:'Posicionamento premium, objetivo e acessível.', guardrails:'Não prometer resultados. Não usar emojis. Evitar exageros.', visual_rules:'Fundo escuro, dourado como destaque, composição editorial e bastante respiro.'}); return }
    supabase.from('brand_profiles').select('*').eq('user_id', user.id).maybeSingle().then(({data}) => {
      if (data) setBrand({...empty, ...Object.fromEntries(FIELDS.map(k => [k, data[k] ?? empty[k]]))})
      setLoaded(true)
    })
  }, [user?.id])

  // ---- Referencias visuais -------------------------------------------
  // O upload vai direto do navegador para o Storage, com o JWT do usuario.
  // As policies do bucket garantem que ninguem escreve na pasta de outro.
  const [refs, setRefs] = useState([])
  const [upBusy, setUpBusy] = useState(false)

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
    if (refs.length + files.length > MAX_REFS) return notify.error(`Máximo de ${MAX_REFS} referências.`)
    setUpBusy(true); setMsg('')
    try{
      let position = refs.length
      for (const raw of files){
        if (!/^image\/(png|jpeg|webp)$/.test(raw.type)) throw new Error('Use PNG, JPG ou WEBP.')
        if (raw.size > 16 * 1024 * 1024) throw new Error('Cada imagem precisa ter no máximo 16 MB.')
        // Reduz antes de subir: a referência vai anexada a cada arte gerada,
        // então arquivo grande aqui vira upload grande em toda geração.
        const file = await shrinkImage(raw)
        const ext = file.type.split('/')[1].replace('jpeg','jpg')
        const path = `${user.id}/${uid()}.${ext}`
        const { error: upErr } = await supabase.storage.from('brand-references').upload(path, file, { contentType: file.type })
        if (upErr) throw upErr
        position += 1
        const { error: rowErr } = await supabase.from('brand_reference_images').insert({ user_id: user.id, storage_path: path, label: raw.name.slice(0,120), position })
        if (rowErr) throw rowErr
      }
      await loadRefs()
      notify.success('Referências enviadas.')
    }catch(e){ notify.error(e.message) } finally { setUpBusy(false) }
  }

  async function removeRef(row){
    setUpBusy(true); setMsg('')
    try{
      await supabase.storage.from('brand-references').remove([row.storage_path])
      await supabase.from('brand_reference_images').delete().eq('id', row.id)
      await loadRefs()
    }catch(e){ notify.error(e.message) } finally { setUpBusy(false) }
  }

  // ---- Autopreenchimento por leitura das imagens ----------------------
  // A analise e sugestao: ela popula o formulario e marca cada campo com a
  // origem. Nada vai para o banco sem o cliente revisar e salvar.
  const [suggested, setSuggested] = useState({})
  const [conflicts, setConflicts] = useState([])
  const [questions, setQuestions] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [manual, setManual] = useState(false)
  const timers = useRef([])
  // Retrato do formulario imediatamente antes da analise entrar. E o que o
  // botao de descartar devolve: sem isso, "descartar" so tiraria o selo e
  // deixaria o valor sugerido no lugar do que o cliente tinha escrito.
  const antes = useRef(null)
  const formAtual = useRef(brand)
  useEffect(() => { formAtual.current = brand })

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const cost = analysisCredits(pricing)
  const presetList = presets?.length ? presets : DEFAULT_PRESETS
  const presetName = slug => presetList.find(p => p.slug === slug)?.name || slug

  async function analyze(){
    if (DEMO_MODE) return notify.error('A análise não roda no modo demonstração.')
    if (!refs.length) return notify.error('Envie ao menos uma imagem de referência.')
    setAnalyzing(true); setMsg(''); setConflicts([]); setQuestions([])
    try{
      const started = await api('analyze-brand', { method:'POST', body:{} })
      await waitFor(started.job_id)
    }catch(e){
      setAnalyzing(false)
      notify.error(e.message)
    }
  }

  // Espera o worker. A analise roda em segundo plano porque ler varias
  // imagens passa do limite de tempo de uma funcao sincrona da plataforma.
  function waitFor(jobId){
    return new Promise(resolve => {
      let tries = 0
      const tick = async () => {
        tries += 1
        try{
          const { job } = await api(`analyze-brand-status?job_id=${encodeURIComponent(jobId)}`)
          if (job.status === 'ready'){
            applySuggestion(job.result)
            setAnalyzing(false)
            await refresh()
            notify.success('Análise pronta. Revise os campos marcados antes de salvar.')
            return resolve()
          }
          if (job.status === 'failed'){
            setAnalyzing(false)
            notify.error(job.error || 'Não foi possível analisar as imagens. Nenhum crédito foi cobrado.')
            return resolve()
          }
        }catch(e){
          setAnalyzing(false)
          notify.error(e.message)
          return resolve()
        }
        if (tries >= POLL_LIMIT){
          setAnalyzing(false)
          notify.error('A análise está demorando mais que o normal. Recarregue em instantes.')
          return resolve()
        }
        timers.current.push(setTimeout(tick, POLL_MS))
      }
      timers.current.push(setTimeout(tick, POLL_MS))
    })
  }

  function applySuggestion(res){
    if (!res?.fields) return
    antes.current = { ...formAtual.current }
    // Campo em conflito nao entra sozinho: quem decide entre as opcoes e o
    // cliente, no bloco do topo.
    const emConflito = new Set((res.conflicts || []).map(c => c.field))
    const next = {}
    const marks = {}
    for (const key of BRAND_FIELD_KEYS){
      const item = res.fields[key]
      if (!item || !item.value || emConflito.has(key)) continue
      next[key] = key === 'render_text' ? item.value === 'true' : item.value
      marks[key] = item
    }
    setBrand(b => ({ ...b, ...next }))
    setSuggested(marks)
    setConflicts(res.conflicts || [])
    setQuestions(res.questions || [])
    setManual(true)
  }

  function resolveConflict(field, value){
    set(field, field === 'render_text' ? value === 'true' : value)
    setConflicts(list => list.filter(c => c.field !== field))
  }

  function discardSuggestion(){
    const volta = antes.current || {}
    const marcados = Object.keys(suggested)
    setBrand(b => {
      const n = { ...b }
      for (const k of marcados) n[k] = volta[k] ?? empty[k]
      return n
    })
    setSuggested({}); setConflicts([]); setQuestions([])
    notify.success('Sugestões descartadas. Os campos voltaram ao que estavam.')
  }

  // Editar um campo tira o selo: a partir dali o valor e do cliente.
  function set(key, value){
    setBrand(b => ({ ...b, [key]: value }))
    setSuggested(s => { if (!s[key]) return s; const n = { ...s }; delete n[key]; return n })
  }

  const mark = key => {
    const s = suggested[key]
    if (!s) return null
    const confirmar = s.needs_user_input || s.confidence === 'low'
    return <i className={confirmar ? 'bb-tag check' : 'bb-tag'} title={s.source || 'Sugerido pela análise das imagens.'}>
      {confirmar ? 'confirme' : 'sugerido'}
    </i>
  }

  async function save(e){
    e.preventDefault(); setBusy(true); setMsg('')
    try{
      if(!DEMO_MODE) await api('save-brand',{method:'POST',body:Object.fromEntries(FIELDS.map(k=>[k,brand[k]??'']))})
      setSuggested({})
      notify.success('Brand Brain salvo. As próximas gerações já usam estas regras.')
    }catch(e){ notify.error(e.message) } finally { setBusy(false) }
  }

  // O guia so some quando ja existe marca preenchida, ou quando o cliente
  // escolhe seguir na mao. Formulario em branco e o ponto de desistencia:
  // a tela tem de dizer por onde comecar.
  const preenchido = Boolean(brand.brand_name?.trim() && brand.segment?.trim())
  const guia = !manual && !preenchido && loaded

  return <div className="page">
    <div className="page-title"><div><span className="eyebrow">BRAND BRAIN</span><h1>SUA MARCA COMO REGRA.</h1><p>Essas informações orientam as próximas copies e direções visuais.</p></div></div>

    <section className={`panel bb-start${guia ? ' guia' : ''}`}>
      <div className="panel-head"><div>
        <span className="eyebrow">COMECE PELO QUE VOCÊ JÁ PUBLICA</span>
        <h2>{guia ? 'NÃO ESCREVA NADA AINDA.' : 'REFERÊNCIAS DA MARCA'}</h2>
      </div></div>

      {guia && <p className="bb-lead">Descrever o próprio estilo é difícil e não precisa ser o seu trabalho. Suba de duas a quatro peças que representem a marca — post do feed, story, arte de campanha — e a análise lê delas a paleta, a tipografia, o acabamento e o tom, e preenche a ficha para você revisar.</p>}

      <ol className="bb-steps">
        <li className={refs.length ? 'ok' : 'now'}>
          <b>{refs.length ? <Check size={14}/> : '1'}</b>
          <div><strong>Suba as referências</strong><span>{refs.length ? `${refs.length} de ${MAX_REFS} enviadas` : `Até ${MAX_REFS} imagens, PNG, JPG ou WEBP`}</span></div>
        </li>
        <li className={refs.length ? 'now' : ''}>
          <b>2</b>
          <div><strong>Deixe a análise preencher</strong><span>Ou pule e escreva você mesmo, campo a campo</span></div>
        </li>
      </ol>

      <div className="ref-grid">
        {refs.map(row=><figure key={row.id}>
          {row.url&&<img src={row.url} alt={row.label||'Referência'} loading="lazy"/>}
          <button type="button" onClick={()=>removeRef(row)} disabled={upBusy||analyzing} aria-label="Remover referência"><Trash2 size={15}/></button>
        </figure>)}
        {refs.length<MAX_REFS&&<label className="ref-add">
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={uploadRefs} disabled={upBusy||analyzing} hidden/>
          {upBusy ? <Images size={22}/> : <Plus size={22}/>}<span>{upBusy?'Enviando':'Adicionar'}</span>
        </label>}
      </div>

      <div className="bb-actions">
        <button type="button" className="btn primary" onClick={analyze} disabled={analyzing||upBusy||!refs.length}>
          <Wand2 size={17}/>{analyzing ? 'ANALISANDO AS IMAGENS' : `ANALISAR E PREENCHER · ${number(cost)} CR`}
        </button>
        {guia && <button type="button" className="link-btn" onClick={()=>setManual(true)}>Prefiro preencher na mão</button>}
        {!guia && Object.keys(suggested).length > 0 && <button type="button" className="link-btn" onClick={discardSuggestion}>Descartar sugestões</button>}
      </div>

      {analyzing && <div className="bb-working">
        <span className="bb-spin"/>
        <div><strong>Lendo as suas peças</strong><span>Costuma levar de trinta segundos a dois minutos. Pode deixar a aba aberta.</span></div>
      </div>}

      <p className="hint">As referências também são anexadas a cada arte gerada — é o que reproduz mascote, paleta e acabamento. Coloque as melhores no começo.{refs.length ? '' : ' Sem imagem nenhuma, a análise não tem o que ler.'}</p>
    </section>

    {conflicts.length > 0 && <section className="panel bb-conflicts">
      <div className="panel-head"><div><span className="eyebrow">PRECISA DA SUA DECISÃO</span><h2>AS PEÇAS NÃO CONCORDAM.</h2></div></div>
      <p className="hint">A análise encontrou mais de uma resposta para estes pontos e não escolheu sozinha.</p>
      {conflicts.map(c => <div className="bb-conflict" key={c.field}>
        <div><AlertTriangle size={16}/><strong>{c.field === 'preset_slug' ? 'Direção visual' : c.field}</strong></div>
        <p>{c.issue}</p>
        <div className="bb-options">
          {c.options.map(op => <button type="button" key={op} className="small-btn" onClick={()=>resolveConflict(c.field, op)}>
            {c.field === 'preset_slug' ? presetName(op) : op}
          </button>)}
          <button type="button" className="link-btn" onClick={()=>setConflicts(list=>list.filter(x=>x.field!==c.field))}>Deixar como está</button>
        </div>
      </div>)}
    </section>}

    {questions.length > 0 && <section className="panel bb-questions">
      <div className="panel-head"><div><span className="eyebrow">O QUE A IMAGEM NÃO CONTA</span><h2>SÓ VOCÊ SABE RESPONDER.</h2></div></div>
      <ul>{questions.map((q,i) => <li key={i}><Sparkles size={14}/>{q}</li>)}</ul>
      <p className="hint">Nada disso foi inventado nos campos. Preencha o que fizer sentido e ignore o resto.</p>
    </section>}

    <form className={`brand-form${analyzing ? ' working' : ''}`} onSubmit={save} aria-busy={analyzing}>

      <section className="panel"><div className="panel-head"><div><span className="eyebrow">IDENTIDADE</span><h2>BASE DA MARCA</h2></div></div>
        <div className="form-grid">
          <label>Nome da marca{mark('brand_name')}<input value={brand.brand_name} onChange={e=>set('brand_name',e.target.value)} /></label>
          <label>Segmento{mark('segment')}<input value={brand.segment} onChange={e=>set('segment',e.target.value)} /></label>
          <label>Perfil no Instagram{mark('instagram_handle')}<input value={brand.instagram_handle} onChange={e=>set('instagram_handle',e.target.value)} placeholder="@suamarca"/></label>
          <label>Tipografia{mark('typography')}<input value={brand.typography} onChange={e=>set('typography',e.target.value)}/></label>
          <label>Cor principal{mark('primary_color')}<div className="color-input"><input type="color" value={brand.primary_color} onChange={e=>set('primary_color',e.target.value)}/><input value={brand.primary_color} onChange={e=>set('primary_color',e.target.value)}/></div></label>
          <label>Cor secundária{mark('secondary_color')}<div className="color-input"><input type="color" value={brand.secondary_color} onChange={e=>set('secondary_color',e.target.value)}/><input value={brand.secondary_color} onChange={e=>set('secondary_color',e.target.value)}/></div></label>
        </div>
      </section>

      <section className="panel"><div className="panel-head"><div><span className="eyebrow">COMUNICAÇÃO</span><h2>O QUE A MARCA DIZ E COMO DIZ.</h2></div></div>
        <div className="form-grid">
          <label className="wide">Público{mark('audience')}<textarea value={brand.audience} onChange={e=>set('audience',e.target.value)}/></label>
          <label className="wide">Tom de voz{mark('tone')}<textarea value={brand.tone} onChange={e=>set('tone',e.target.value)}/></label>
          <label>Diferenciais{mark('differentiators')}<textarea value={brand.differentiators} onChange={e=>set('differentiators',e.target.value)}/></label>
          <label>Serviços principais{mark('services')}<textarea value={brand.services} onChange={e=>set('services',e.target.value)}/></label>
          <label className="wide">CTA padrão{mark('default_cta')}<input value={brand.default_cta} onChange={e=>set('default_cta',e.target.value)}/></label>
          <label className="wide">Regras de escrita{mark('copy_rules')}<textarea rows="4" value={brand.copy_rules} onChange={e=>set('copy_rules',e.target.value)} placeholder="Deixe vazio para usar o padrão da Achilles. Preencha para mandar você: tamanho da legenda, quantidade de hashtags, se pode emoji, o que quiser."/><small className="field-hint">O que você escrever aqui substitui por inteiro o estilo padrão da plataforma.</small></label>
        </div>
      </section>

      <section className="panel"><div className="panel-head"><div><span className="eyebrow">DIREÇÃO VISUAL</span><h2>COMO A MARCA APARECE.</h2></div></div>
        <div className="field-head"><span className="eyebrow">PRESET{mark('preset_slug')}</span><small>O caminho de direção de arte que a plataforma segue.</small></div>
        <div className="preset-grid">{presetList.map(p=><button type="button" key={p.slug} className={brand.preset_slug===p.slug?'active':''} onClick={()=>set('preset_slug',p.slug)}><strong>{p.name}</strong><span>{p.summary}</span></button>)}</div>

        <div className="form-grid">
          <label className="wide">Regras visuais{mark('visual_rules')}<textarea rows="4" value={brand.visual_rules} onChange={e=>set('visual_rules',e.target.value)} placeholder="Fundo escuro, dourado como destaque, composição editorial, muito respiro."/></label>
          <label className="wide">Referências visuais{mark('references_text')}<textarea rows="4" value={brand.references_text} onChange={e=>set('references_text',e.target.value)} placeholder="Descreva ou cole links de perfis e campanhas que representam o padrão que você quer."/></label>
          <label className="wide">Elementos recorrentes{mark('recurring_elements')}<textarea rows="3" value={brand.recurring_elements} onChange={e=>set('recurring_elements',e.target.value)} placeholder="O que aparece em toda peça: mascote, tipo de interface, motivos gráficos, textura de fundo."/></label>
          <label className="wide">Regras de acabamento da arte{mark('image_rules')}<textarea rows="3" value={brand.image_rules} onChange={e=>set('image_rules',e.target.value)} placeholder="Deixe vazio para usar o padrão. Preencha para definir o acabamento: colagem, moldura, textura, o que a sua marca usar."/><small className="field-hint">Substitui por inteiro o acabamento padrão da plataforma.</small></label>
        </div>

        <div className="field-head"><span className="eyebrow">TEXTO NA ARTE{mark('render_text')}</span><small>Define o padrão da marca. Cada geração ainda pode escolher diferente.</small></div>
        <div className="switch-row">
          <button type="button" className={brand.render_text?'switch on':'switch'} onClick={()=>set('render_text',!brand.render_text)} aria-pressed={brand.render_text}><i/></button>
          <div><strong>{brand.render_text?'A arte já vem com o título escrito':'A arte vem limpa, sem texto'}</strong><span>{brand.render_text?'Pronta para publicar. O modelo pode errar uma letra, e aí é só refazer a peça.':'Você aplica a tipografia depois, no seu editor. Controle total.'}</span></div>
        </div>
        <div className="form-grid">
          <label className="wide">Estilo da tipografia{mark('text_style')}<textarea rows="3" value={brand.text_style} onChange={e=>set('text_style',e.target.value)} placeholder="Tipografia condensada pesada em caixa alta. Título em branco com uma palavra destacada na cor principal."/></label>
        </div>
      </section>

      <section className="panel"><div className="panel-head"><div><span className="eyebrow">LIMITES</span><h2>BRIEFING E GUARDRAILS.</h2></div></div>
        <div className="form-grid">
          <label className="wide">Briefing{mark('briefing')}<textarea rows="5" value={brand.briefing} onChange={e=>set('briefing',e.target.value)}/></label>
          <label className="wide">Guardrails{mark('guardrails')}<textarea rows="5" value={brand.guardrails} onChange={e=>set('guardrails',e.target.value)} placeholder="Não prometer resultado. Não citar concorrente. Não usar emoji."/></label>
          <label className="wide">Termos proibidos{mark('forbidden_terms')}<textarea rows="3" value={brand.forbidden_terms} onChange={e=>set('forbidden_terms',e.target.value)} placeholder="Palavras que nunca podem aparecer, separadas por vírgula."/></label>
        </div>
      </section>

      {msg&&<div className="form-message">{msg}</div>}
      <button className="btn primary" disabled={busy}><Save size={18}/>{busy?'SALVANDO':'SALVAR BRAND BRAIN'}</button>
    </form>
  </div>
}
