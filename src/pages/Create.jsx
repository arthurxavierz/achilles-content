import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, Check, Copy as CopyIcon, Download, Image as ImageIcon, PenLine, RefreshCw, Shuffle, Sparkles, Wand2 } from 'lucide-react'
import JSZip from 'jszip'
import { CAROUSEL_MAX, FORMATS, QUALITIES, artCount, copyCredits, formatOf, imageCredits, imagesCredits, themeCredits } from '../../shared/pricing'
import { DEMO_MODE } from '../lib/config'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { number, uid } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'
import { useToast } from '../components/Toast'

const TITULOS_DEMO = ['SEU PROCESSO CONTINUA SEM VOCÊ?','O GARGALO APARECE NO SILÊNCIO.','PROCESSO BOM NÃO DEPENDE DE MEMÓRIA.','MENOS OPERAÇÃO. MAIS CONTROLE.','O QUE HOJE PARARIA SEM VOCÊ?']
const demoCopy = (format, n) => ({
  headline: TITULOS_DEMO[0],
  slides: Array.from({ length: format === 'carousel' ? n : 1 }, (_, i) => ({
    title: TITULOS_DEMO[i] || `SLIDE ${i + 1}`,
    subtitle: 'Quando tudo depende de uma pessoa, o problema não é falta de esforço. É falta de processo.'
  })),
  caption: 'Se uma tarefa importante para porque alguém não está disponível, existe uma dependência operacional que merece atenção.',
  hashtags: ['#gestao', '#processos', '#automacao', '#achillesmedia']
})

// Esqueleto para quem vai escrever a copy à mão.
const copyVazia = n => ({ headline:'', slides: Array.from({length:n},()=>({title:'',subtitle:''})), caption:'', hashtags:[] })

export default function Create() {
  const { profile } = useAuth()
  const { demoSpend, refresh, pricing, presets } = useBilling()
  const notify = useToast()

  const [format,setFormat]=useState('carousel')
  const [wanted,setWanted]=useState(CAROUSEL_MAX)     // quantas artes no carrossel
  const [quality,setQuality]=useState('standard')
  const [preset,setPreset]=useState('')
  const [renderText,setRenderText]=useState(null)     // null = herda o padrão da marca
  const [copyMode,setCopyMode]=useState('ai')         // 'ai' | 'manual'
  const [theme,setTheme]=useState('')
  const [step,setStep]=useState(1)
  const [copy,setCopy]=useState(null)
  const [copySource,setCopySource]=useState('ai')
  const [generationId,setGenerationId]=useState(null)
  const [busy,setBusy]=useState(false)
  const [themeBusy,setThemeBusy]=useState(false)
  const [job,setJob]=useState(null)
  const [images,setImages]=useState([])
  const [error,setError]=useState('')
  const [params,setParams]=useSearchParams()
  const [resuming,setResuming]=useState(false)
  const [copyWait,setCopyWait]=useState(false)

  // O aviso inline fica no contexto da etapa; o toast garante que o cliente
  // veja o retorno mesmo com o formulário rolado.
  const fail = m => { setError(m); notify.error(m) }

  useEffect(()=>{ if(!preset && presets?.length) setPreset(presets[0].slug) },[presets])

  const count=artCount(format,wanted)
  const balance=(profile?.credits_plan||0)+(profile?.credits_extra||0)
  const costCopy=copyMode==='manual'?0:copyCredits(pricing,format)
  const costEach=imageCredits(pricing,quality)
  const costImages=imagesCredits(pricing,format,quality,count)
  const costTheme=themeCredits(pricing)
  const canCopy=balance>=costCopy
  const canImages=balance>=costImages

  // As artes na tela seguem o job, não o estado local do formulário. Antes
  // seguiam o formato selecionado, e uma dessincronia mostrava um cartão só
  // enquanto o contador dizia "5 de 5".
  const artTotal=job?.total || images.length || count

  // ---- retomada de geração existente -------------------------------------
  useEffect(()=>{
    const id=params.get('geracao')
    if(DEMO_MODE||!id||id===generationId) return
    setResuming(true)
    ;(async()=>{
      try{
        const {data:g,error:gErr}=await supabase.from('generations').select('*').eq('id',id).maybeSingle()
        if(gErr||!g) throw new Error('Geração não encontrada.')
        setGenerationId(g.id); setFormat(g.format); setTheme(g.theme||'')
        setWanted(g.image_count||CAROUSEL_MAX)
        setCopySource(g.copy_source||'ai')
        setCopyMode(g.copy_source==='manual'?'manual':'ai')
        if(g.copy_json) setCopy(g.copy_json)
        if(g.preset_slug) setPreset(g.preset_slug)
        if(g.image_quality) setQuality(g.image_quality==='high'?'signature':'standard')

        if(g.status==='images_ready'){
          setJob({status:'done',done:g.image_count,total:g.image_count}); setStep(4)
        }else if(g.status==='processing'){
          const {data:jb}=await supabase.from('generation_jobs').select('id,status,done_count,total_count,last_error').eq('generation_id',g.id).maybeSingle()
          if(jb){ setJob({id:jb.id,status:jb.status,done:jb.done_count,total:jb.total_count,error:jb.last_error}); setStep(4) }
          else setStep(3)
        }else if(g.status==='failed'){
          const {data:jb}=await supabase.from('generation_jobs').select('last_error').eq('generation_id',g.id).maybeSingle()
          if(g.copy_json){ setStep(3); if(jb?.last_error) setError(jb.last_error) }
          else { notify.error(g.copy_error||'Esta geração falhou antes da copy e já foi estornada.'); setStep(1) }
        }else if(g.status==='copy_queued'||g.status==='draft'){ setCopyWait(true); setStep(1) }
        else if(g.status==='copy_approved'){ setStep(3) }
        else if(g.copy_json){ setStep(2) }
        else setStep(1)
      }catch(e){ notify.error(e.message) }
      finally{ setResuming(false); setParams({},{replace:true}) }
    })()
  },[params])

  // ---- tema aleatório ----------------------------------------------------
  async function suggestTheme(){
    if(DEMO_MODE) return notify.info('Sugestão de tema indisponível no modo demonstração.')
    if(balance<costTheme) return fail(`Faltam ${number(costTheme-balance)} créditos para sugerir um tema.`)
    setThemeBusy(true); setError('')
    try{
      const out=await api('suggest-theme',{method:'POST'})
      setTheme(out.theme); await refresh()
      notify.success('Tema sugerido. Ajuste o texto se quiser.')
    }catch(e){ fail(e.message) } finally{ setThemeBusy(false) }
  }

  // ---- etapa 1 -----------------------------------------------------------
  async function avancar(){
    if(copyMode==='manual'){
      // Nada é cobrado: o cliente escreve, e a geração só nasce no banco
      // quando ele aprovar o próprio texto.
      setCopy(copyVazia(count)); setCopySource('manual'); setGenerationId(null); setError(''); setStep(2)
      return
    }
    if(!theme.trim()) return fail('Informe o tema da publicação ou use o tema aleatório.')
    if(!canCopy) return fail(`Faltam ${number(costCopy-balance)} créditos para gerar a copy.`)
    setBusy(true); setError('')
    try{
      if(DEMO_MODE){
        await new Promise(r=>setTimeout(r,900)); demoSpend(costCopy)
        setCopy(demoCopy(format,count)); setCopySource('ai'); setGenerationId(uid()); setStep(2)
        notify.success('Copy gerada. Revise antes de aprovar.')
      } else {
        const out=await api('generate-copy',{method:'POST',body:{theme,format,image_count:count,idempotency_key:uid()}})
        setGenerationId(out.generation_id); setCopySource('ai'); await refresh()
        if(out.copy){ setCopy(out.copy); setStep(2); notify.success('Copy gerada. Revise antes de aprovar.') }
        else { setCopyWait(true); notify.info('Escrevendo a copy. Leva alguns segundos.') }
      }
    }catch(e){ fail(e.message) } finally { setBusy(false) }
  }

  // A copy é assíncrona: o estúdio pergunta o andamento dela.
  useEffect(()=>{
    if(DEMO_MODE||!copyWait||!generationId) return
    const timer=setInterval(async()=>{
      try{
        const out=await api(`generation-status?generation_id=${encodeURIComponent(generationId)}`)
        const g=out.generation
        if(g?.copy){ setCopy(g.copy); setCopyWait(false); setStep(2); await refresh(); notify.success('Copy gerada. Revise antes de aprovar.') }
        else if(g?.status==='failed'){ setCopyWait(false); fail(g.error||'Não foi possível gerar a copy. Os créditos foram estornados.'); await refresh() }
      }catch{}
    },2500)
    return ()=>clearInterval(timer)
  },[copyWait,generationId])

  // ---- etapa 2 -----------------------------------------------------------
  async function approve(){
    if(!copy?.headline?.trim()) return fail('A headline não pode ficar vazia.')
    if(copy.slides?.some(s=>!s.title?.trim())) return fail('Todo slide precisa de um título.')
    setBusy(true); setError('')
    try{
      if(DEMO_MODE){ setStep(3) }
      else if(copySource==='manual'&&!generationId){
        const out=await api('save-manual-copy',{method:'POST',body:{format,image_count:count,theme,copy,idempotency_key:uid()}})
        setGenerationId(out.generation_id); setStep(3)
      }else{
        await api('approve-copy',{method:'POST',body:{generation_id:generationId,copy}})
        setStep(3)
      }
      notify.success('Copy aprovada. Agora é só gerar as artes.')
    }catch(e){ fail(e.message) } finally { setBusy(false) }
  }

  async function redoCopy(){
    if(DEMO_MODE) return notify.info('Indisponível no modo demonstração.')
    if(!confirm(`Refazer a copy custa ${number(copyCredits(pricing,format))} créditos. O texto atual é descartado. Continuar?`)) return
    setBusy(true); setError('')
    try{
      await api('regenerate-copy',{method:'POST',body:{generation_id:generationId}})
      setCopy(null); setCopyWait(true); setStep(1); await refresh()
      notify.info('Reescrevendo a copy.')
    }catch(e){ fail(e.message) } finally{ setBusy(false) }
  }

  async function archive(){
    if(!generationId) return restart()
    if(DEMO_MODE) return notify.info('Indisponível no modo demonstração.')
    if(!confirm('Arquivar esta copy? Ela sai do fluxo e fica guardada no histórico, sem gerar artes.')) return
    setBusy(true)
    try{
      await api('archive-generation',{method:'POST',body:{generation_id:generationId,archived:true}})
      notify.success('Copy arquivada. Você a encontra no histórico.')
      restart()
    }catch(e){ fail(e.message) } finally{ setBusy(false) }
  }

  // ---- etapas 3 e 4 ------------------------------------------------------
  async function generateImages(){
    if(!canImages) return fail(`Faltam ${number(costImages-balance)} créditos para gerar as artes.`)
    setBusy(true); setError('')
    try{
      if(DEMO_MODE){
        demoSpend(costImages); setJob({status:'processing',done:0,total:count}); setStep(4)
        let n=0; const timer=setInterval(()=>{ n++; setJob(j=>({...j,done:n,status:n>=count?'done':'processing'})); if(n>=count) clearInterval(timer) },650)
      } else {
        const out=await api('generate-images',{method:'POST',body:{generation_id:generationId,quality,preset_slug:preset,...(renderText===null?{}:{render_text:renderText}),idempotency_key:uid()}})
        setJob({id:out.job_id,status:'queued',done:0,total:count}); setStep(4); await refresh()
        notify.info('Geração iniciada. Pode fechar esta página: ela continua e fica no histórico.')
      }
    }catch(e){ fail(e.message) } finally { setBusy(false) }
  }

  useEffect(()=>{
    if(DEMO_MODE||!job?.id||job.status==='done'||job.status==='failed') return
    const timer=setInterval(async()=>{ try{ const out=await api(`generation-status?job_id=${encodeURIComponent(job.id)}`); setJob(j=>({...j,...out.job})) }catch{} },3000)
    return ()=>clearInterval(timer)
  },[job?.id,job?.status])

  useEffect(()=>{
    if(DEMO_MODE||job?.status!=='done'||!generationId) return
    api('sign-generation-urls',{method:'POST',body:{generation_id:generationId}})
      .then(out=>{ setImages(out.images||[]); notify.success('Artes prontas.') })
      .catch(()=>notify.error('As artes ficaram prontas, mas o link falhou. Abra o histórico.'))
    refresh()
  },[job?.status,generationId])

  async function download(url,name){
    try{
      const blob=await fetch(url).then(r=>r.blob())
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name||'arte.png'
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href)
    }catch{ notify.error('O link da imagem expirou. Abra o histórico para baixar de novo.') }
  }

  async function downloadAll(){
    if(!images.length) return
    try{
      const zip=new JSZip()
      await Promise.all(images.map(async x=>zip.file(x.name||'arte.png', await fetch(x.url).then(r=>r.blob()))))
      const blob=await zip.generateAsync({type:'blob'})
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='achilles-content.zip'; a.click(); URL.revokeObjectURL(a.href)
      notify.success('ZIP baixado.')
    }catch{ notify.error('Não foi possível montar o ZIP. Baixe as artes uma a uma.') }
  }

  async function regenerate(position){
    if(DEMO_MODE) return
    setBusy(true); setError('')
    try{
      const out=await api('regenerate-image',{method:'POST',body:{generation_id:generationId,position,quality}})
      setImages([]); setJob({id:out.job_id,status:'queued',done:position-1,total:artTotal}); await refresh()
      notify.info(`Refazendo a arte ${position}.`)
    }catch(e){ fail(e.message) } finally{ setBusy(false) }
  }

  function copiar(texto,rotulo){
    navigator.clipboard.writeText(texto||'')
      .then(()=>notify.success(`${rotulo} copiada.`))
      .catch(()=>notify.error(`Não foi possível copiar: ${rotulo.toLowerCase()}.`))
  }

  function restart(){
    setStep(1); setCopy(null); setGenerationId(null); setJob(null); setImages([])
    setTheme(''); setError(''); setCopyWait(false); setCopySource(copyMode)
  }

  const progress=job?Math.round(((job.done||0)/(job.total||1))*100):0
  const presetInfo=useMemo(()=>presets?.find(p=>p.slug===preset),[presets,preset])
  const gerando=job?.status==='processing'||job?.status==='queued'

  return <div className="page">
    <div className="page-title"><div><span className="eyebrow">ESTÚDIO</span><h1>DA IDEIA À ARTE.</h1><p>Você decide se o texto é nosso ou seu. A arte só é cobrada quando você aprova.</p></div><div className="cost-chip"><span>SALDO</span><strong>{number(balance)}</strong></div></div>
    {resuming&&<div className="form-message">Abrindo a geração do histórico.</div>}
    <div className="studio-steps">{['Briefing','Copy','Aprovação','Artes'].map((x,i)=><div className={step>=i+1?'active':''} key={x}><b>{i+1}</b><span>{x}</span></div>)}</div>

    {step===1&&<section className="panel studio-card">
      <span className="eyebrow">ETAPA 01</span><h2>O QUE VOCÊ QUER PUBLICAR?</h2>

      <div className="format-tabs">{FORMATS.map(x=><button type="button" className={format===x.slug?'active':''} onClick={()=>setFormat(x.slug)} key={x.slug}>
        <strong>{x.label}</strong><span>{x.slug==='carousel'?`até ${CAROUSEL_MAX} artes`:'1 arte'}</span>
      </button>)}</div>

      {format==='carousel'&&<>
        <div className="field-head"><span className="eyebrow">QUANTAS ARTES</span><small>Cada arte é cobrada separadamente.</small></div>
        <div className="count-picker">{Array.from({length:CAROUSEL_MAX},(_,i)=>i+1).map(n=>
          <button type="button" key={n} className={count===n?'active':''} onClick={()=>setWanted(n)} aria-pressed={count===n}>{n}</button>)}
        </div>
      </>}

      <div className="field-head"><span className="eyebrow">DE ONDE VEM O TEXTO</span><small>A arte não depende de gerar copy aqui.</small></div>
      <div className="quality-grid">
        <button type="button" className={copyMode==='ai'?'active':''} onClick={()=>setCopyMode('ai')}>
          <Wand2 size={15}/><strong>Gerar com IA</strong>
          <span>Escrevemos a partir do tema e do seu Brand Brain.</span>
          <b>{number(copyCredits(pricing,format))} cr</b>
        </button>
        <button type="button" className={copyMode==='manual'?'active':''} onClick={()=>setCopyMode('manual')}>
          <PenLine size={15}/><strong>Escrever eu mesmo</strong>
          <span>Você digita a copy, ou só a descrição da cena.</span>
          <b>sem custo</b>
        </button>
      </div>

      {copyMode==='ai'&&<>
        <div className="field-head"><span className="eyebrow">TEMA</span><small>Uma frase basta. A copy cuida do detalhe.</small></div>
        <textarea rows="4" value={theme} onChange={e=>setTheme(e.target.value)} placeholder="Exemplo: post sobre preparação para o vestibular com CTA final para a matrícula."/>
        <button type="button" className="small-btn theme-dice" disabled={themeBusy||busy} onClick={suggestTheme}>
          {themeBusy?<RefreshCw size={15} className="spin"/>:<Shuffle size={15}/>}
          TEMA ALEATÓRIO · {number(costTheme)} CR
        </button>
      </>}

      <div className="field-head"><span className="eyebrow">DIREÇÃO DE ARTE</span><small>Define a estética das imagens desta geração.</small></div>
      <div className="preset-grid">{(presets||[]).map(p=><button type="button" key={p.slug} className={preset===p.slug?'active':''} onClick={()=>setPreset(p.slug)}><strong>{p.name}</strong><span>{p.summary}</span></button>)}</div>

      <div className="field-head"><span className="eyebrow">TEXTO NA ARTE</span><small>Sem escolher, vale o padrão do seu Brand Brain.</small></div>
      <div className="quality-grid">
        <button type="button" className={renderText===false?'active':''} onClick={()=>setRenderText(false)}><strong>Arte limpa</strong><span>Sem texto. Você aplica a tipografia depois.</span></button>
        <button type="button" className={renderText===true?'active':''} onClick={()=>setRenderText(true)}><strong>Arte fechada</strong><span>O título vai escrito na imagem, pronta para publicar.</span></button>
      </div>

      <div className="field-head"><span className="eyebrow">QUALIDADE DA IMAGEM</span><small>Cobrada só na etapa das artes.</small></div>
      <div className="quality-grid">{QUALITIES.map(q=><button type="button" key={q.slug} className={quality===q.slug?'active':''} onClick={()=>setQuality(q.slug)}>{q.slug==='signature'&&<Sparkles size={15}/>}<strong>{q.label}</strong><span>{q.hint}</span><b>{number(imageCredits(pricing,q.slug))} cr por arte</b></button>)}</div>

      <div className="charge-preview three">
        <div><span>{copyMode==='manual'?'Texto escrito por você':'Custo agora, a copy'}</span><strong>{number(costCopy)}</strong></div>
        <div><span>Depois, {count} {count===1?'arte':'artes'}</span><strong>{number(costImages)}</strong></div>
        <div><span>Total da entrega</span><strong>{number(costCopy+costImages)}</strong></div>
      </div>

      {error&&<div className="form-message error">{error}</div>}
      {copyWait&&<div className="form-message"><RefreshCw size={15} className="spin"/> Escrevendo a copy. Pode fechar esta página: a geração fica no histórico e você retoma de lá.</div>}
      <button className="btn primary" disabled={busy||copyWait} onClick={avancar}>
        {busy||copyWait?<RefreshCw className="spin"/>:copyMode==='manual'?'ESCREVER A COPY':'GERAR COPY'}
      </button>
    </section>}

    {step===2&&copy&&<section className="panel studio-card">
      <span className="eyebrow">ETAPA 02</span><h2>{copySource==='manual'?'ESCREVA A SUA COPY.':'REVISE ANTES DE APROVAR.'}</h2>
      <label>Headline<input value={copy.headline||''} onChange={e=>setCopy(c=>({...c,headline:e.target.value}))} placeholder="A frase principal da peça"/></label>
      <div className="slide-editor">{copy.slides?.map((s,i)=><div key={i}>
        <small>SLIDE {i+1}</small>
        <input value={s.title} onChange={e=>setCopy(c=>({...c,slides:c.slides.map((x,n)=>n===i?{...x,title:e.target.value}:x)}))} placeholder="Título do slide"/>
        <textarea value={s.subtitle} onChange={e=>setCopy(c=>({...c,slides:c.slides.map((x,n)=>n===i?{...x,subtitle:e.target.value}:x)}))} placeholder="Apoio do título, ou a descrição da cena que você quer na arte"/>
      </div>)}</div>
      <label>Legenda<textarea rows="6" value={copy.caption||''} onChange={e=>setCopy(c=>({...c,caption:e.target.value}))}/></label>
      <label>Hashtags<input value={(copy.hashtags||[]).join(' ')} onChange={e=>setCopy(c=>({...c,hashtags:e.target.value.split(/\s+/).filter(Boolean)}))}/></label>
      {error&&<div className="form-message error">{error}</div>}
      <div className="action-row">
        {copySource==='ai'&&generationId&&<button className="btn secondary" disabled={busy} onClick={redoCopy}><RefreshCw size={16}/>REFAZER COPY · {number(copyCredits(pricing,format))} CR</button>}
        <button className="btn secondary" disabled={busy} onClick={archive}><Archive size={16}/>ARQUIVAR</button>
        <button className="btn primary" disabled={busy} onClick={approve}><Check size={18}/>APROVAR COPY</button>
      </div>
    </section>}

    {step===3&&<section className="panel studio-card approval">
      <div className="approval-ring"><Check/></div>
      <span className="eyebrow">COPY APROVADA</span><h2>PRONTA PARA VIRAR ARTE.</h2>
      <p>Serão geradas {count} {count===1?'imagem':'imagens'} no preset {presetInfo?.name||'padrão'}, qualidade {quality==='signature'?'Assinatura':'Padrão'}, a {number(costEach)} créditos cada.</p>
      <div className="charge-preview"><div><span>Custo desta etapa</span><strong>{number(costImages)}</strong></div><div><span>Saldo após gerar</span><strong>{number(Math.max(0,balance-costImages))}</strong></div></div>
      {error&&<div className="form-message error">{error}</div>}
      <button className="btn primary" disabled={busy} onClick={generateImages}><ImageIcon size={18}/>GERAR ARTES</button>
    </section>}

    {step===4&&<section className="panel studio-card wide">
      <span className="eyebrow">GERAÇÃO</span>
      <h2>{job?.status==='done'?'ARTES PRONTAS.':job?.status==='failed'?'A GERAÇÃO FALHOU.':'CONSTRUINDO SUAS ARTES.'}</h2>
      {job?.status==='failed'&&<div className="form-message error">{job.error||'Falha na geração. Os créditos das artes não entregues foram estornados.'}<br/>Sua copy continua aprovada: use TENTAR DE NOVO e nada do texto é refeito.</div>}
      <div className="job-progress"><div><span style={{width:`${progress}%`}}/></div><strong>{job?.done||0} de {artTotal} {artTotal===1?'imagem':'imagens'}</strong></div>

      <div className={`art-grid ${artTotal===1?'single':''}`}>{Array.from({length:artTotal}).map((_,i)=>{
        const art=images.find(x=>x.position===i+1)
        if(art) return <figure className="art-card ready" key={i}><img src={art.url} alt={`Arte ${i+1}`} loading="lazy"/><figcaption><button onClick={()=>download(art.url,art.name)}><Download size={15}/>Baixar</button><button onClick={()=>regenerate(i+1)} disabled={busy}><RefreshCw size={15}/>Refazer</button></figcaption></figure>
        if(DEMO_MODE&&i<(job?.done||0)) return <div className="art-card ready demo" key={i}><span>ACHILLES CONTENT</span><strong>{copy?.slides?.[i]?.title||copy?.headline}</strong></div>
        // Sem número: a ordem de conclusão não é a ordem dos cartões, e
        // rotular "ARTE 1" enquanto a quarta era gerada confundia.
        return <div className="art-card" key={i}><RefreshCw className={gerando?'spin':''}/><small>{gerando?'GERANDO ARTE':'AGUARDANDO'}</small></div>
      })}</div>

      {copy&&(copy.caption||copy.headline||copy.hashtags?.length>0)&&<div className="copy-output">
        <div className="panel-head"><div><span className="eyebrow">TEXTO DA PUBLICAÇÃO</span><h2>PRONTO PARA COLAR.</h2></div></div>
        {copy.headline&&<div className="copy-block"><small>HEADLINE</small><p>{copy.headline}</p><button className="small-btn" onClick={()=>copiar(copy.headline,'Headline')}><CopyIcon size={14}/>COPIAR</button></div>}
        {copy.caption&&<div className="copy-block"><small>LEGENDA</small><p>{copy.caption}</p><button className="small-btn" onClick={()=>copiar(copy.caption,'Legenda')}><CopyIcon size={14}/>COPIAR</button></div>}
        {copy.hashtags?.length>0&&<div className="copy-block"><small>HASHTAGS</small><p className="hashtags">{copy.hashtags.join(' ')}</p><button className="small-btn" onClick={()=>copiar(copy.hashtags.join(' '),'Hashtags')}><CopyIcon size={14}/>COPIAR</button></div>}
        {copy.slides?.length>1&&<div className="copy-block"><small>SEQUÊNCIA DOS SLIDES</small><p className="slide-list">{copy.slides.map((s,i)=>`${i+1}. ${s.title}`).join('\n')}</p><button className="small-btn" onClick={()=>copiar(copy.slides.map((s,i)=>`${i+1}. ${s.title}\n${s.subtitle||''}`).join('\n\n'),'Sequência dos slides')}><CopyIcon size={14}/>COPIAR</button></div>}
      </div>}

      {error&&<div className="form-message error">{error}</div>}
      <div className="action-row">
        <button className="btn secondary" onClick={restart}>NOVA GERAÇÃO</button>
        {job?.status==='failed'&&<button className="btn primary" disabled={busy} onClick={generateImages}><RefreshCw size={17}/>TENTAR DE NOVO</button>}
        {images.length>0&&<button className="btn primary" onClick={downloadAll}><Download size={17}/>BAIXAR TODAS EM ZIP</button>}
      </div>
    </section>}
  </div>
}
