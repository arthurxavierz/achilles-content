import React, { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { Download, Search, X } from 'lucide-react'
import { DEMO_MODE } from '../lib/config'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { dateTime } from '../lib/format'

const STATUS_LABELS = {
  draft: 'Rascunho',
  copy_ready: 'Copy pronta',
  copy_approved: 'Copy aprovada',
  processing: 'Gerando artes',
  images_ready: 'Concluída',
  failed: 'Falhou'
}

const demoRows = [
  {
    id: 'd1', theme: 'Processos que dependem de uma pessoa', format: 'carousel', status: 'images_ready',
    copy_cost: 2, image_cost: 10, created_at: new Date().toISOString(), image_count: 5,
    copy_json: { headline: 'SEU PROCESSO CONTINUA SEM VOCÊ?', caption: 'Quando a operação depende de memória, a ausência vira gargalo.', hashtags: ['#gestao', '#processos'] }
  },
  {
    id: 'd2', theme: 'Autoridade sem exagero', format: 'post', status: 'copy_approved',
    copy_cost: 1, image_cost: 0, created_at: new Date(Date.now() - 86400000).toISOString(), image_count: 1,
    copy_json: { headline: 'AUTORIDADE NÃO PRECISA DE EXAGERO.', caption: 'Clareza também posiciona.', hashtags: ['#marca'] }
  }
]

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

export default function History() {
  const { user } = useAuth()
  const [rows, setRows] = useState(DEMO_MODE ? demoRows : [])
  const [query, setQuery] = useState('')
  const [format, setFormat] = useState('all')
  const [selected, setSelected] = useState(null)
  const [urls, setUrls] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (DEMO_MODE || !user?.id) return
    supabase.from('generations').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data, error: e }) => { if (e) setError(e.message); else setRows(data || []) })
  }, [user?.id])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return rows.filter(r =>
      (format === 'all' || r.format === format) &&
      (!term || String(r.theme || '').toLowerCase().includes(term))
    )
  }, [rows, query, format])

  async function open(row) {
    setSelected(row)
    setUrls([])
    setError('')
    if (DEMO_MODE) {
      setUrls(Array.from({ length: row.image_count || 0 }, (_, i) => ({ position: i + 1, url: '', name: `arte-${i + 1}.png`, demo: true })))
      return
    }
    if (row.status !== 'images_ready') return
    setBusy(true)
    try {
      // O banco guarda o caminho. A URL assinada e criada agora e vale uma hora.
      const out = await api('sign-generation-urls', { method: 'POST', body: { generation_id: row.id } })
      setUrls(out.images || [])
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function downloadAll() {
    const real = urls.filter(x => !x.demo)
    if (!real.length) return
    setBusy(true)
    try {
      const zip = new JSZip()
      await Promise.all(real.map(async x => zip.file(x.name || `arte-${x.position}.png`, await fetch(x.url).then(r => r.blob()))))
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'achilles-content.zip'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const copy = selected?.copy_json || {}

  return <div className="page">
    <div className="page-title">
      <div>
        <span className="eyebrow">HISTÓRICO</span>
        <h1>TUDO O QUE JÁ FOI CRIADO.</h1>
        <p>Busque, revise e baixe entregas anteriores.</p>
      </div>
    </div>

    <section className="panel">
      <div className="filters">
        <label><Search size={17} /><input placeholder="Buscar por tema" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <select value={format} onChange={e => setFormat(e.target.value)}>
          <option value="all">Todos os formatos</option>
          <option value="post">Post</option>
          <option value="story">Story</option>
          <option value="carousel">Carrossel</option>
        </select>
      </div>
      {error && <div className="form-message error">{error}</div>}
      <div className="history-list">
        {filtered.map(r => <button key={r.id} onClick={() => open(r)}>
          <div>
            <strong>{r.theme || 'Sem tema'}</strong>
            <span>{r.format} · {dateTime(r.created_at)}</span>
          </div>
          <div>
            <b>{(r.copy_cost || 0) + (r.image_cost || 0)} cr</b>
            <span>{STATUS_LABELS[r.status] || r.status}</span>
          </div>
        </button>)}
        {!filtered.length && <div className="empty">Nenhuma geração encontrada.</div>}
      </div>
    </section>

    {selected && <div className="drawer-back" onClick={() => setSelected(null)}>
      <aside className="drawer" onClick={e => e.stopPropagation()}>
        <button className="drawer-x" onClick={() => setSelected(null)} aria-label="Fechar"><X /></button>
        <span className="eyebrow">DETALHE DA GERAÇÃO</span>
        <h2>{selected.theme || 'Sem tema'}</h2>

        {copy.headline && <p className="drawer-headline">{copy.headline}</p>}
        {copy.caption && <p>{copy.caption}</p>}
        {Array.isArray(copy.hashtags) && copy.hashtags.length > 0 && <p className="hashtags">{copy.hashtags.join(' ')}</p>}

        <div className="detail-meta">
          <span>Formato<strong>{selected.format}</strong></span>
          <span>Créditos<strong>{(selected.copy_cost || 0) + (selected.image_cost || 0)}</strong></span>
          <span>Data<strong>{dateTime(selected.created_at)}</strong></span>
        </div>

        {copy.caption && <button className="btn secondary" onClick={() => navigator.clipboard.writeText(copy.caption)}>
          COPIAR LEGENDA
        </button>}

        {busy && <div className="empty">Atualizando acesso às imagens.</div>}

        <div className="thumb-grid">
          {urls.map(x => <figure key={x.position}>
            {x.demo
              ? <div className="thumb">ARTE {x.position}</div>
              : <img src={x.url} alt={`Arte ${x.position}`} loading="lazy" />}
            {!x.demo && <button onClick={() => downloadBlob(x.url, x.name).catch(e => setError(e.message))}>
              <Download size={16} />Baixar
            </button>}
          </figure>)}
        </div>

        {!urls.length && !busy && selected.status !== 'images_ready' &&
          <div className="empty">Esta geração ainda não tem artes concluídas.</div>}

        {urls.filter(x => !x.demo).length > 1 && <button className="btn primary" disabled={busy} onClick={downloadAll}>
          <Download size={17} />BAIXAR TODAS EM ZIP
        </button>}
      </aside>
    </div>}
  </div>
}
