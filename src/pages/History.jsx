import React, { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { Archive, ArrowRight, Download, RotateCcw, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEMO_MODE } from '../lib/config'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { dateTime, number } from '../lib/format'
import { useToast } from '../components/Toast'

const STATUS={draft:'Rascunho',copy_queued:'Escrevendo a copy',copy_ready:'Copy pronta',copy_approved:'Copy aprovada',processing:'Gerando artes',images_ready:'Entregue',failed:'Falhou'}

const demoRows=[
{id:'d1',theme:'Processos que dependem de uma pessoa',format:'carousel',status:'images_ready',copy_cost:150,image_cost:500,image_quality:'medium',created_at:new Date().toISOString(),copy_json:{headline:'SEU PROCESSO CONTINUA SEM VOCÊ?',caption:'Quando a operação depende de memória, a ausência vira gargalo.',hashtags:['#gestao','#processos']},image_count:5},
{id:'d2',theme:'Autoridade sem exagero',format:'post',status:'copy_approved',copy_cost:50,image_cost:0,created_at:new Date(Date.now()-86400000).toISOString(),copy_json:{headline:'AUTORIDADE NÃO PRECISA DE EXAGERO.',caption:'Clareza também posiciona.',hashtags:['#marca']},image_count:1}
]

export default function History(){
  const {user}=useAuth()
  const notify=useToast()
  const [rows,setRows]=useState(DEMO_MODE?demoRows:[])
  const [query,setQuery]=useState('')
  const [format,setFormat]=useState('all')
  const [selected,setSelected]=useState(null)
  const [urls,setUrls]=useState([])
  const [busy,setBusy]=useState(false)
  const [verArquivadas,setVerArquivadas]=useState(false)

  useEffect(()=>{
    if(DEMO_MODE||!user?.id) return
    let q=supabase.from('generations').select('*').eq('user_id',user.id)
    if(!verArquivadas) q=q.is('archived_at',null)
    q.order('created_at',{ascending:false}).limit(200).then(({data})=>setRows(data||[]))
  },[user?.id,verArquivadas])

  const filtered=useMemo(()=>rows.filter(r=>(format==='all'||r.format===format)&&String(r.theme||'').toLowerCase().includes(query.toLowerCase())),[rows,query,format])

  async function open(row){
    setSelected(row); setUrls([])
    if(DEMO_MODE) return
    if(row.status!=='images_ready') return
    setBusy(true)
    try{ const out=await api('sign-generation-urls',{method:'POST',body:{generation_id:row.id}}); setUrls(out.images||[]) }
    catch(e){ notify.error(e.message) } finally{ setBusy(false) }
  }

  // A URL assinada vale uma hora. Gaveta aberta ha muito tempo falha aqui,
  // e o cliente precisa saber que e so reabrir.
  async function download(url,name){
    try{
      const blob=await fetch(url).then(r=>r.blob())
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name||'arte.png'
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href)
    }catch{ notify.error('O link expirou. Feche e abra a geração de novo.') }
  }

  async function all(){
    if(!urls.length) return
    try{
      const zip=new JSZip()
      await Promise.all(urls.map(async x=>zip.file(x.name||'arte.png', await fetch(x.url).then(r=>r.blob()))))
      const blob=await zip.generateAsync({type:'blob'})
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='achilles-content.zip'; a.click(); URL.revokeObjectURL(a.href)
      notify.success('ZIP baixado.')
    }catch{ notify.error('Não foi possível montar o ZIP. Baixe as artes uma a uma.') }
  }

  const copy=selected?.copy_json||{}

  return <div className="page">
    <div className="page-title"><div><span className="eyebrow">HISTÓRICO</span><h1>TUDO O QUE JÁ FOI CRIADO.</h1><p>Busque, revise e baixe entregas anteriores.</p></div></div>

    <section className="panel">
      <div className="filters">
        <label><Search size={17}/><input placeholder="Buscar por tema" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <select value={format} onChange={e=>setFormat(e.target.value)}><option value="all">Todos os formatos</option><option value="post">Post</option><option value="story">Story</option><option value="carousel">Carrossel</option></select>
        <button type="button" className={`small-btn ${verArquivadas?'ok':''}`} onClick={()=>setVerArquivadas(v=>!v)}>
          <Archive size={15}/>{verArquivadas?'MOSTRANDO ARQUIVADAS':'VER ARQUIVADAS'}
        </button>
      </div>
      <div className="history-list">
        {filtered.map(r=><button key={r.id} onClick={()=>open(r)}>
          <div><strong>{r.theme}</strong><span>{r.format} · {dateTime(r.created_at)}</span></div>
          <div><b>{number((r.copy_cost||0)+(r.image_cost||0))} cr</b><span className={r.status==='images_ready'?'on':r.status==='failed'?'off':''}>{r.archived_at?'Arquivada':(STATUS[r.status]||r.status)}</span></div>
        </button>)}
        {!filtered.length&&<div className="empty">Nenhuma geração encontrada.</div>}
      </div>
    </section>

    {selected&&<div className="drawer-back" onClick={()=>setSelected(null)}><aside className="drawer" onClick={e=>e.stopPropagation()}>
      <button className="drawer-x" onClick={()=>setSelected(null)} aria-label="Fechar"><X/></button>
      <span className="eyebrow">DETALHE DA GERAÇÃO</span>
      <h2>{copy.headline||selected.theme}</h2>
      <p>{copy.caption}</p>
      {copy.hashtags?.length>0&&<p className="hashtags">{copy.hashtags.join(' ')}</p>}
      <div className="detail-meta">
        <span>Formato<strong>{selected.format}</strong></span>
        <span>Créditos<strong>{number((selected.copy_cost||0)+(selected.image_cost||0))}</strong></span>
        <span>Data<strong>{dateTime(selected.created_at)}</strong></span>
      </div>
      {copy.slides?.length>0&&<div className="slide-read">{copy.slides.map((s,i)=><div key={i}><small>SLIDE {i+1}</small><strong>{s.title}</strong><p>{s.subtitle}</p></div>)}</div>}
      {busy&&<div className="empty">Gerando links de acesso às imagens.</div>}
      <div className="thumb-grid">{urls.map((x,i)=><figure key={i}><img src={x.url} alt={`Arte ${x.position}`} loading="lazy"/><button onClick={()=>download(x.url,x.name)}><Download size={16}/>Baixar</button></figure>)}</div>
      {urls.length>0&&<button className="btn primary" onClick={all}><Download size={17}/>BAIXAR TODAS EM ZIP</button>}

      {selected.archived_at&&<div className="resume-box">
          <strong>Esta geração está arquivada.</strong>
          <p>Ela fica fora da lista principal. Desarquive para voltar a trabalhar nela.</p>
          <button className="btn secondary" disabled={busy} onClick={async()=>{
            setBusy(true)
            try{
              await api('archive-generation',{method:'POST',body:{generation_id:selected.id,archived:false}})
              notify.success('Geração desarquivada.')
              setSelected(s=>({...s,archived_at:null})); setVerArquivadas(v=>v)
              setRows(r=>r.map(x=>x.id===selected.id?{...x,archived_at:null}:x))
            }catch(e){ notify.error(e.message) } finally{ setBusy(false) }
          }}><RotateCcw size={16}/>DESARQUIVAR</button>
        </div>}

      {!selected.archived_at&&['copy_ready','copy_approved','processing','failed','copy_queued'].includes(selected.status)&&selected.copy_json&&
        <div className="resume-box">
          <strong>{selected.status==='failed'?'Esta geração falhou nas artes.':selected.status==='processing'?'Esta geração ainda está em andamento.':'Esta copy ainda não virou arte.'}</strong>
          <p>{selected.status==='failed'
            ? 'Os créditos das artes não entregues já foram estornados. A copy continua paga e aprovada: retome para gerar as artes sem escrever nada de novo.'
            : selected.status==='processing'
              ? 'Abra no estúdio para acompanhar o andamento.'
              : 'Retome no estúdio para aprovar e gerar as artes.'}</p>
          <Link className="btn primary" to={`/app/criar?geracao=${selected.id}`}>CONTINUAR NO ESTÚDIO<ArrowRight size={17}/></Link>
        </div>}
    </aside></div>}
  </div>
}
