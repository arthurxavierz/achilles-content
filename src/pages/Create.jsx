import React, { useEffect, useMemo, useState } from 'react'
import { Check, Copy as CopyIcon, Download, Image as ImageIcon, RefreshCw, Sparkles } from 'lucide-react'
import JSZip from 'jszip'
import { FORMATS, QUALITIES, copyCredits, formatOf, imageCredits, imagesCredits } from '../../shared/pricing'
import { DEMO_MODE } from '../lib/config'
import { api } from '../lib/api'
import { number, uid } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'
import { useToast } from '../components/Toast'

const demoCopy = format => ({ headline:'SEU PROCESSO CONTINUA SEM VOCÊ?', slides: format==='carousel' ? [
  {title:'SEU PROCESSO CONTINUA SEM VOCÊ?',subtitle:'Quando tudo depende de uma pessoa, o problema não é falta de esforço. É falta de processo.'},
  {title:'O GARGALO APARECE NO SILÊNCIO.',subtitle:'Tarefas param, respostas atrasam e ninguém sabe exatamente o próximo passo.'},
  {title:'PROCESSO BOM NÃO DEPENDE DE MEMÓRIA.',subtitle:'Ele orienta, registra e conduz a operação mesmo quando alguém não está disponível.'},
  {title:'MENOS OPERAÇÃO. MAIS CONTROLE.',subtitle:'Automação bem aplicada reduz ruído e devolve tempo para o que realmente exige decisão.'},
  {title:'O QUE HOJE PARARIA SEM VOCÊ?',subtitle:'Leia a legenda e identifique onde sua operação ainda depende demais de pessoas.'}
] : [{title:'SEU PROCESSO CONTINUA SEM VOCÊ?',subtitle:'Estruture antes que a ausência vire gargalo.'}], caption:'Se uma tarefa importante para porque alguém não está disponível, existe uma dependência operacional que merece atenção. Organizar o processo é o primeiro passo para ganhar previsibilidade e escala.', hashtags:['#gestao','#processos','#automacao','#achillesmedia'] })

export default function Create() {
  const { profile } = useAuth()
  const { demoSpend, refresh, pricing, presets } = useBilling()
  const notify = useToast()
  const [format,setFormat]=useState('carousel')
  const [quality,setQuality]=useState('standard')
  const [preset,setPreset]=useState('')
  const [renderText,setRenderText]=useState(null)   // null = herda o padrão da marca
  const [theme,setTheme]=useState('')
  const [step,setStep]=useState(1)
  const [copy,setCopy]=useState(null)
  const [generationId,setGenerationId]=useState(null)
  const [busy,setBusy]=useState(false)
  const [job,setJob]=useState(null)
  const [images,setImages]=useState([])
  const [error,setError]=useState('')

  // O aviso inline fica no contexto da etapa; o toast garante que o cliente
  // veja o retorno mesmo com o formulario rolado.
  const fail = m => { setError(m); notify.error(m) }

  useEffect(()=>{ if(!preset && presets?.length) setPreset(presets[0].slug) },[presets])

  const spec=formatOf(format)
  const balance=(profile?.credits_plan||0)+(profile?.credits_extra||0)
  const costCopy=copyCredits(pricing,format)
  const costEach=imageCredits(pricing,quality)
  const costImages=imagesCredits(pricing,format,quality)
  const costTotal=costCopy+costImages
  const canCopy=balance>=costCopy
  const canImages=balance>=costImages

  async function generateCopy(){
    if(!theme.trim()) return fail('Informe o tema da publicação.')
    if(!canCopy) return fail(`Faltam ${number(costCopy-balance)} créditos para gerar a copy.`)
    setBusy(true); setError('')
    try{
      if(DEMO_MODE){ await new Promise(r=>setTimeout(r,900)); demoSpend(costCopy); setCopy(demoCopy(format)); setGenerationId(uid()) }
      else { const out=await api('generate-copy',{method:'POST',body:{theme,format,idempotency_key:uid()}}); setCopy(out.copy); setGenerationId(out.generation_id); await refresh() }
      setStep(2); notify.success('Copy gerada. Revise antes de aprovar.')
    }catch(e){ fail(e.message) } finally { setBusy(false) }
  }

  async function approve(){
    setBusy(true); setError('')
    try{ if(!DEMO_MODE) await api('approve-copy',{method:'POST',body:{generation_id:generationId,copy}}); setStep(3); notify.success('Copy aprovada. Agora é só gerar as artes.') }
    catch(e){ fail(e.message) } finally { setBusy(false) }
  }

  async function generateImages(){
    if(!canImages) return fail(`Faltam ${number(costImages-balance)} créditos para gerar as artes.`)
    setBusy(true); setError('')
    try{
      if(DEMO_MODE){
        demoSpend(costImages); setJob({status:'processing',done:0,total:spec.imageCount}); setStep(4)
        let n=0; const timer=setInterval(()=>{ n++; setJob(j=>({...j,done:n,status:n>=spec.imageCount?'done':'processing'})); if(n>=spec.imageCount) clearInterval(timer) },650)
      } else {
        const out=await api('generate-images',{method:'POST',body:{generation_id:generationId,quality,preset_slug:preset,...(renderText===null?{}:{render_text:renderText}),idempotency_key:uid()}})
        setJob({id:out.job_id,status:'queued',done:0,total:spec.imageCount}); setStep(4); await refresh()
        notify.info('Geração iniciada. Pode levar alguns minutos, e você acompanha aqui.')
      }
    }catch(e){ fail(e.message) } finally { setBusy(false) }
  }

  // Enquanto o job roda, o painel pergunta o andamento. Ao terminar, busca as
  // URLs assinadas: o bucket e privado, o link vale uma hora.
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
    const zip=new JSZip()
    await Promise.all(images.map(async x=>zip.file(x.name||'arte.png', await fetch(x.url).then(r=>r.blob()))))
    try{
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
      setImages([]); setJob({id:out.job_id,status:'queued',done:position-1,total:position}); await refresh()
      notify.info(`Refazendo a arte ${position}.`)
    }catch(e){ fail(e.message) } finally { setBusy(false) }
  }

  function restart(){ setStep(1); setCopy(null); setGenerationId(null); setJob(null); setImages([]); setTheme(''); setError('') }

  const progress=job?Math.round(((job.done||0)/(job.total||1))*100):0
  const presetInfo=useMemo(()=>presets?.find(p=>p.slug===preset),[presets,preset])

  return <div className="page">
    <div className="page-title"><div><span className="eyebrow">ESTÚDIO</span><h1>DA IDEIA À ARTE.</h1><p>Copy primeiro. Aprovação depois. Imagem só quando estiver pronta para seguir.</p></div><div className="cost-chip"><span>SALDO</span><strong>{number(balance)}</strong></div></div>
    <div className="studio-steps">{['Briefing','Copy','Aprovação','Artes'].map((x,i)=><div className={step>=i+1?'active':''} key={x}><b>{i+1}</b><span>{x}</span></div>)}</div>

    {step===1&&<section className="panel studio-card">
      <span className="eyebrow">ETAPA 01</span><h2>O QUE VOCÊ QUER PUBLICAR?</h2>
      <div className="format-tabs">{FORMATS.map(x=><button type="button" className={format===x.slug?'active':''} onClick={()=>setFormat(x.slug)} key={x.slug}><strong>{x.label}</strong><span>{number(copyCredits(pricing,x.slug)+imagesCredits(pricing,x.slug,quality))} créditos completo</span></button>)}</div>
      <label>Tema ou orientação<textarea rows="5" value={theme} onChange={e=>setTheme(e.target.value)} placeholder="Exemplo: quero conscientizar gestores sobre processos que dependem de uma única pessoa."/></label>

      <div className="field-head"><span className="eyebrow">DIREÇÃO DE ARTE</span><small>Define a estética das imagens desta geração.</small></div>
      <div className="preset-grid">{(presets||[]).map(p=><button type="button" key={p.slug} className={preset===p.slug?'active':''} onClick={()=>setPreset(p.slug)}><strong>{p.name}</strong><span>{p.summary}</span></button>)}</div>

      <div className="field-head"><span className="eyebrow">TEXTO NA ARTE</span><small>Sem escolher, vale o padrão do seu Brand Brain.</small></div>
      <div className="quality-grid">
        <button type="button" className={renderText===false?'active':''} onClick={()=>setRenderText(false)}><strong>Arte limpa</strong><span>Sem texto. Você aplica a tipografia depois, no seu editor.</span></button>
        <button type="button" className={renderText===true?'active':''} onClick={()=>setRenderText(true)}><strong>Arte fechada</strong><span>O título da copy vai escrito na imagem, pronta para publicar.</span></button>
      </div>

      <div className="field-head"><span className="eyebrow">QUALIDADE DA IMAGEM</span><small>Cobrada só na etapa das artes.</small></div>
      <div className="quality-grid">{QUALITIES.map(q=><button type="button" key={q.slug} className={quality===q.slug?'active':''} onClick={()=>setQuality(q.slug)}>{q.slug==='signature'&&<Sparkles size={15}/>}<strong>{q.label}</strong><span>{q.hint}</span><b>{number(imageCredits(pricing,q.slug))} cr por arte</b></button>)}</div>

      <div className="charge-preview three">
        <div><span>Custo agora, a copy</span><strong>{number(costCopy)}</strong></div>
        <div><span>Depois, {spec.imageCount} {spec.imageCount===1?'arte':'artes'}</span><strong>{number(costImages)}</strong></div>
        <div><span>Total da entrega</span><strong>{number(costTotal)}</strong></div>
      </div>
      {error&&<div className="form-message error">{error}</div>}
      <button className="btn primary" disabled={busy} onClick={generateCopy}>{busy?<RefreshCw className="spin"/>:'GERAR COPY'}</button>
    </section>}

    {step===2&&copy&&<section className="panel studio-card">
      <span className="eyebrow">ETAPA 02</span><h2>REVISE ANTES DE APROVAR.</h2>
      <label>Headline<input value={copy.headline||''} onChange={e=>setCopy(c=>({...c,headline:e.target.value}))}/></label>
      <div className="slide-editor">{copy.slides?.map((s,i)=><div key={i}><small>SLIDE {i+1}</small><input value={s.title} onChange={e=>setCopy(c=>({...c,slides:c.slides.map((x,n)=>n===i?{...x,title:e.target.value}:x)}))}/><textarea value={s.subtitle} onChange={e=>setCopy(c=>({...c,slides:c.slides.map((x,n)=>n===i?{...x,subtitle:e.target.value}:x)}))}/></div>)}</div>
      <label>Legenda<textarea rows="6" value={copy.caption||''} onChange={e=>setCopy(c=>({...c,caption:e.target.value}))}/></label>
      <label>Hashtags<input value={(copy.hashtags||[]).join(' ')} onChange={e=>setCopy(c=>({...c,hashtags:e.target.value.split(/\s+/).filter(Boolean)}))}/></label>
      {error&&<div className="form-message error">{error}</div>}
      <div className="action-row"><button className="btn secondary" onClick={()=>navigator.clipboard.writeText(copy.caption||'').then(()=>notify.success('Legenda copiada.')).catch(()=>notify.error('Não foi possível copiar a legenda.'))}><CopyIcon size={17}/>COPIAR LEGENDA</button><button className="btn primary" disabled={busy} onClick={approve}><Check size={18}/>APROVAR COPY</button></div>
    </section>}

    {step===3&&<section className="panel studio-card approval">
      <div className="approval-ring"><Check/></div>
      <span className="eyebrow">COPY APROVADA</span><h2>PRONTA PARA VIRAR ARTE.</h2>
      <p>Serão geradas {spec.imageCount} {spec.imageCount===1?'imagem':'imagens'} no preset {presetInfo?.name||'padrão'}, qualidade {quality==='signature'?'Assinatura':'Padrão'}, a {number(costEach)} créditos cada.</p>
      <div className="charge-preview"><div><span>Custo desta etapa</span><strong>{number(costImages)}</strong></div><div><span>Saldo após gerar</span><strong>{number(Math.max(0,balance-costImages))}</strong></div></div>
      {error&&<div className="form-message error">{error}</div>}
      <button className="btn primary" disabled={busy} onClick={generateImages}><ImageIcon size={18}/>GERAR ARTES</button>
    </section>}

    {step===4&&<section className="panel studio-card wide">
      <span className="eyebrow">GERAÇÃO</span><h2>{job?.status==='done'?'ARTES PRONTAS.':job?.status==='failed'?'A GERAÇÃO FALHOU.':'CONSTRUINDO SUAS ARTES.'}</h2>
      {job?.status==='failed'&&<div className="form-message error">{job.error||'Falha na geração. Os créditos das artes não entregues foram estornados.'}<br/>Sua copy continua aprovada: use TENTAR DE NOVO e nada do texto é refeito.</div>}
      <div className="job-progress"><div><span style={{width:`${progress}%`}}/></div><strong>{job?.done||0} de {job?.total||spec.imageCount} imagens</strong></div>
      <div className={`art-grid ${spec.imageCount===1?'single':''}`}>{Array.from({length:spec.imageCount}).map((_,i)=>{
        const art=images.find(x=>x.position===i+1)
        if(art) return <figure className="art-card ready" key={i}><img src={art.url} alt={`Arte ${i+1}`} loading="lazy"/><figcaption><button onClick={()=>download(art.url,art.name)}><Download size={15}/>Baixar</button><button onClick={()=>regenerate(i+1)} disabled={busy}><RefreshCw size={15}/>Refazer</button></figcaption></figure>
        if(DEMO_MODE&&i<(job?.done||0)) return <div className="art-card ready demo" key={i}><span>ACHILLES CONTENT</span><strong>{copy?.slides?.[i]?.title||copy?.headline}</strong></div>
        return <div className="art-card" key={i}><RefreshCw className={job?.status==='processing'||job?.status==='queued'?'spin':''}/><small>ARTE {i+1}</small></div>
      })}</div>
      {error&&<div className="form-message error">{error}</div>}
      <div className="action-row">
        <button className="btn secondary" onClick={restart}>NOVA GERAÇÃO</button>
        {job?.status==='failed'&&<button className="btn primary" disabled={busy} onClick={generateImages}><RefreshCw size={17}/>TENTAR DE NOVO</button>}
        {images.length>0&&<button className="btn primary" onClick={downloadAll}><Download size={17}/>BAIXAR TODAS EM ZIP</button>}
      </div>
    </section>}
  </div>
}
