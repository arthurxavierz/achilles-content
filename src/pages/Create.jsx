import React, { useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy as CopyIcon, Download, Image as ImageIcon, RefreshCw, RotateCcw } from 'lucide-react'
import JSZip from 'jszip'
import { FORMAT_PRICING } from '../../shared/pricing'
import { DEMO_MODE } from '../lib/config'
import { api } from '../lib/api'
import { uid } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBilling } from '../context/BillingContext'

const demoCopy = format => ({
  headline: 'SEU PROCESSO CONTINUA SEM VOCÊ?',
  slides: format === 'carousel' ? [
    { title: 'SEU PROCESSO CONTINUA SEM VOCÊ?', subtitle: 'Quando tudo depende de uma pessoa, o problema não é falta de esforço. É falta de processo.' },
    { title: 'O GARGALO APARECE NO SILÊNCIO.', subtitle: 'Tarefas param, respostas atrasam e ninguém sabe exatamente o próximo passo.' },
    { title: 'PROCESSO BOM NÃO DEPENDE DE MEMÓRIA.', subtitle: 'Ele orienta, registra e conduz a operação mesmo quando alguém não está disponível.' },
    { title: 'MENOS OPERAÇÃO. MAIS CONTROLE.', subtitle: 'Automação bem aplicada reduz ruído e devolve tempo para o que realmente exige decisão.' },
    { title: 'O QUE HOJE PARARIA SEM VOCÊ?', subtitle: 'Leia a legenda e identifique onde sua operação ainda depende demais de pessoas.' }
  ] : [{ title: 'SEU PROCESSO CONTINUA SEM VOCÊ?', subtitle: 'Estruture antes que a ausência vire gargalo.' }],
  caption: 'Se uma tarefa importante para porque alguém não está disponível, existe uma dependência operacional que merece atenção. Organizar o processo é o primeiro passo para ganhar previsibilidade e escala.',
  hashtags: ['#gestao', '#processos', '#automacao', '#achillesmedia']
})

async function downloadBlob(url, name) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Não foi possível baixar a arte.')
  const blob = await response.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name || 'arte.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

export default function Create() {
  const { profile } = useAuth()
  const { demoSpend, refresh } = useBilling()
  const [format, setFormat] = useState('carousel')
  const [theme, setTheme] = useState('')
  const [step, setStep] = useState(1)
  const [copy, setCopy] = useState(null)
  const [generationId, setGenerationId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState(null)
  const [images, setImages] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const price = FORMAT_PRICING[format]
  const total = (profile?.credits_plan || 0) + (profile?.credits_extra || 0)
  const imagesCost = price.imageCreditsEach * price.imageCount
  const canCopy = total >= price.copyCredits
  const canImages = total >= imagesCost

  async function generateCopy() {
    if (!theme.trim()) return setError('Informe o tema da publicação.')
    if (!canCopy) return setError(`Faltam ${price.copyCredits - total} créditos para gerar a copy.`)
    setBusy(true); setError('')
    try {
      if (DEMO_MODE) {
        await new Promise(r => setTimeout(r, 900))
        demoSpend(price.copyCredits)
        setCopy(demoCopy(format))
        setGenerationId(uid())
      } else {
        const out = await api('generate-copy', { method: 'POST', body: { theme, format, idempotency_key: uid() } })
        setCopy(out.copy)
        setGenerationId(out.generation_id)
        await refresh()
      }
      setStep(2)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function approve() {
    setBusy(true); setError('')
    try {
      if (!DEMO_MODE) await api('approve-copy', { method: 'POST', body: { generation_id: generationId, copy } })
      setStep(3)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function startImages() {
    if (!canImages) return setError(`Faltam ${imagesCost - total} créditos para gerar as imagens.`)
    setBusy(true); setError(''); setNotice('')
    try {
      if (DEMO_MODE) {
        demoSpend(imagesCost)
        setJob({ status: 'processing', done: 0, total: price.imageCount })
        setStep(4)
        let n = 0
        const timer = setInterval(() => {
          n++
          setJob(j => ({ ...j, done: n, status: n >= price.imageCount ? 'done' : 'processing' }))
          if (n >= price.imageCount) clearInterval(timer)
        }, 650)
      } else {
        const out = await api('generate-images', { method: 'POST', body: { generation_id: generationId } })
        setJob({ id: out.job_id, status: 'queued', done: 0, total: price.imageCount })
        setImages([])
        setStep(4)
        if (out.retried) setNotice('Retomamos de onde parou. Só as imagens que faltavam foram cobradas.')
        await refresh()
      }
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  // Acompanha o job ate terminar.
  useEffect(() => {
    if (DEMO_MODE || !job?.id) return
    if (job.status === 'done' || job.status === 'failed') return
    const timer = setInterval(async () => {
      try {
        const out = await api(`generation-status?job_id=${encodeURIComponent(job.id)}`)
        setJob(current => ({ ...current, ...out.job }))
      } catch {
        // Uma falha de rede isolada nao encerra o acompanhamento.
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [job?.id, job?.status])

  // Fim do job: uma falha estorna creditos, entao o saldo precisa ser relido.
  useEffect(() => {
    if (DEMO_MODE || !job?.id) return
    if (job.status !== 'done' && job.status !== 'failed') return
    refresh()
  }, [job?.id, job?.status])

  // Terminou: busca as URLs assinadas e mostra as artes de verdade.
  useEffect(() => {
    if (DEMO_MODE || job?.status !== 'done' || !generationId || images.length) return
    let cancelled = false
    api('sign-generation-urls', { method: 'POST', body: { generation_id: generationId } })
      .then(out => { if (!cancelled) setImages(out.images || []) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [job?.status, generationId])

  async function regenerate(position) {
    setError(''); setNotice('')
    try {
      const out = await api('regenerate-image', { method: 'POST', body: { generation_id: generationId, position } })
      setImages([])
      setJob({ id: out.job_id, status: 'queued', done: 0, total: 1 })
      await refresh()
    } catch (e) { setError(e.message) }
  }

  async function downloadAll() {
    if (!images.length) return
    setBusy(true)
    try {
      const zip = new JSZip()
      await Promise.all(images.map(async x => zip.file(x.name || `arte-${x.position}.png`, await fetch(x.url).then(r => r.blob()))))
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'achilles-content.zip'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const done = job?.done || 0
  const jobTotal = job?.total || price.imageCount
  const progress = Math.round((done / Math.max(1, jobTotal)) * 100)
  const failed = job?.status === 'failed'

  return <div className="page">
    <div className="page-title">
      <div>
        <span className="eyebrow">ESTÚDIO</span>
        <h1>DA IDEIA À ARTE.</h1>
        <p>Copy primeiro. Aprovação depois. Imagem só quando estiver pronta para seguir.</p>
      </div>
    </div>

    <div className="studio-steps">
      {['Briefing', 'Copy', 'Aprovação', 'Artes'].map((x, i) =>
        <div className={step >= i + 1 ? 'active' : ''} key={x}><b>{i + 1}</b><span>{x}</span></div>)}
    </div>

    {step === 1 && <section className="panel studio-card">
      <span className="eyebrow">ETAPA 01</span>
      <h2>O QUE VOCÊ QUER PUBLICAR?</h2>
      <div className="format-tabs">
        {Object.values(FORMAT_PRICING).map(x =>
          <button className={format === x.slug ? 'active' : ''} onClick={() => setFormat(x.slug)} key={x.slug}>
            <strong>{x.label}</strong><span>{x.totalCredits} créditos completo</span>
          </button>)}
      </div>
      <label>Tema ou orientação
        <textarea rows="5" value={theme} onChange={e => setTheme(e.target.value)}
          placeholder="Exemplo: quero conscientizar gestores sobre processos que dependem de uma única pessoa." />
      </label>
      <div className="charge-preview">
        <div><span>Custo agora</span><strong>{price.copyCredits} {price.copyCredits === 1 ? 'crédito' : 'créditos'}</strong></div>
        <div><span>Saldo após a copy</span><strong>{total - price.copyCredits}</strong></div>
      </div>
      {error && <div className="form-message error">{error}</div>}
      <button className="btn primary" disabled={busy} onClick={generateCopy}>
        {busy ? <RefreshCw className="spin" /> : 'GERAR COPY'}
      </button>
    </section>}

    {step === 2 && copy && <section className="panel studio-card">
      <span className="eyebrow">ETAPA 02</span>
      <h2>REVISE ANTES DE APROVAR.</h2>
      <label>Headline
        <input value={copy.headline || ''} onChange={e => setCopy(c => ({ ...c, headline: e.target.value }))} />
      </label>
      <div className="slide-editor">
        {copy.slides?.map((s, i) => <div key={i}>
          <small>SLIDE {i + 1}</small>
          <input value={s.title} onChange={e => setCopy(c => ({ ...c, slides: c.slides.map((x, n) => n === i ? { ...x, title: e.target.value } : x) }))} />
          <textarea value={s.subtitle} onChange={e => setCopy(c => ({ ...c, slides: c.slides.map((x, n) => n === i ? { ...x, subtitle: e.target.value } : x) }))} />
        </div>)}
      </div>
      <label>Legenda
        <textarea rows="6" value={copy.caption || ''} onChange={e => setCopy(c => ({ ...c, caption: e.target.value }))} />
      </label>
      <label>Hashtags
        <input value={(copy.hashtags || []).join(' ')} onChange={e => setCopy(c => ({ ...c, hashtags: e.target.value.split(/\s+/).filter(Boolean) }))} />
      </label>
      {error && <div className="form-message error">{error}</div>}
      <div className="action-row">
        <button className="btn secondary" onClick={() => navigator.clipboard.writeText(copy.caption || '')}>
          <CopyIcon size={17} />COPIAR LEGENDA
        </button>
        <button className="btn primary" disabled={busy} onClick={approve}><Check size={18} />APROVAR COPY</button>
      </div>
    </section>}

    {step === 3 && <section className="panel studio-card approval">
      <div className="approval-ring"><Check /></div>
      <span className="eyebrow">COPY APROVADA</span>
      <h2>PRONTA PARA VIRAR ARTE.</h2>
      <p>Serão geradas {price.imageCount} {price.imageCount === 1 ? 'imagem' : 'imagens'}. Cada imagem custa {price.imageCreditsEach} créditos.</p>
      <div className="charge-preview">
        <div><span>Custo desta etapa</span><strong>{imagesCost} créditos</strong></div>
        <div><span>Saldo após gerar</span><strong>{total - imagesCost}</strong></div>
      </div>
      {error && <div className="form-message error">{error}</div>}
      <button className="btn primary" disabled={busy} onClick={startImages}><ImageIcon size={18} />GERAR ARTES</button>
    </section>}

    {step === 4 && <section className="panel studio-card">
      <span className="eyebrow">GERAÇÃO</span>
      <h2>{failed ? 'A GERAÇÃO PAROU.' : job?.status === 'done' ? 'ARTES PRONTAS.' : 'CONSTRUINDO SUAS ARTES.'}</h2>

      {failed && <div className="alert warn">
        <AlertTriangle size={18} />
        <div>
          <strong>Não conseguimos concluir.</strong>
          <span>{job?.error || 'Falha na geração.'} Os créditos das imagens não produzidas já foram estornados.</span>
        </div>
      </div>}
      {notice && <div className="form-message">{notice}</div>}
      {error && <div className="form-message error">{error}</div>}

      {!failed && <div className="job-progress">
        <div><span style={{ width: `${progress}%` }} /></div>
        <strong>{done} de {jobTotal} imagens</strong>
      </div>}

      <div className="art-grid">
        {Array.from({ length: price.imageCount }).map((_, i) => {
          const image = images.find(x => x.position === i + 1)
          if (image) return <figure className="art-card ready" key={i}>
            <img src={image.url} alt={`Arte ${i + 1}`} loading="lazy" />
            <figcaption>
              <button onClick={() => downloadBlob(image.url, image.name).catch(e => setError(e.message))}>
                <Download size={16} />BAIXAR
              </button>
              {!DEMO_MODE && <button className="ghost" onClick={() => regenerate(i + 1)} title={`Refazer por ${price.imageCreditsEach} créditos`}>
                <RotateCcw size={15} />REFAZER
              </button>}
            </figcaption>
          </figure>

          // Sem URL ainda: em demo mostramos o placeholder, em produção o estado real.
          return <div className={`art-card ${DEMO_MODE && i < done ? 'ready' : ''}`} key={i}>
            {DEMO_MODE && i < done
              ? <><span>ACHILLES CONTENT</span><strong>{copy?.slides?.[i]?.title || copy?.headline}</strong></>
              : <><RefreshCw className={failed ? '' : 'spin'} /><small>ARTE {i + 1}</small></>}
          </div>
        })}
      </div>

      <div className="action-row">
        {failed && <button className="btn primary" disabled={busy} onClick={startImages}>
          <RotateCcw size={17} />TENTAR NOVAMENTE
        </button>}
        {images.length > 1 && <button className="btn secondary" disabled={busy} onClick={downloadAll}>
          <Download size={17} />BAIXAR TODAS EM ZIP
        </button>}
      </div>
    </section>}
  </div>
}
