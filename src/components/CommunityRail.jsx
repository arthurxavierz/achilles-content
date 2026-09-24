import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { COMMUNITY_ART } from '../lib/community'

// Vitrine das artes geradas na plataforma.
//
// Três peças na tela, a do meio em escala cheia, trocando sozinha a cada
// cinco segundos. O acervo tem dez, então o que passa não é a mesma coisa
// em looping curto.
//
// A volta é contínua porque a lista é renderizada três vezes e o carrossel
// vive na cópia do meio. Ao sair dela, ele salta para a posição equivalente
// com a transição desligada por um quadro: o olho não vê o salto, e não
// existe aquele rebobinar de dez peças quando a última passa.

const STEP_MS = 5000
const SLIDE_MS = 780

export default function CommunityRail({ items = COMMUNITY_ART }) {
  const count = items.length
  const loop = count ? [...items, ...items, ...items] : []

  const [index, setIndex] = useState(count)
  const [snap, setSnap] = useState(false)
  const [paused, setPaused] = useState(false)
  const [broken, setBroken] = useState({})
  const reduced = useRef(false)

  useEffect(() => { reduced.current = matchMedia('(prefers-reduced-motion: reduce)').matches }, [])

  // Avança sozinho. Para enquanto o ponteiro está em cima: quem parou para
  // olhar uma arte não quer que ela fuja.
  useEffect(() => {
    if (paused || count < 2 || reduced.current) return
    const timer = setInterval(() => setIndex(value => value + 1), STEP_MS)
    return () => clearInterval(timer)
  }, [paused, count])

  // Recentraliza na cópia do meio assim que a transição termina.
  useEffect(() => {
    if (!count || (index >= count && index < count * 2)) return
    const timer = setTimeout(() => {
      setSnap(true)
      setIndex(count + ((index % count) + count) % count)
    }, SLIDE_MS)
    return () => clearTimeout(timer)
  }, [index, count])

  useEffect(() => {
    if (!snap) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false)))
    return () => cancelAnimationFrame(raf)
  }, [snap])

  if (!count) return null

  const go = step => setIndex(value => value + step)
  // O índice passeia fora da cópia do meio entre a transição e o salto, e
  // pode ficar negativo ao voltar: o resto tem que ser sempre positivo.
  const current = ((index % count) + count) % count

  return <div
    className="rail"
    onMouseEnter={() => setPaused(true)}
    onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={() => setPaused(false)}
  >
    <div className="rail-window">
      <div
        className={`rail-track${snap ? ' no-move' : ''}`}
        style={{ '--i': String(index) }}
      >
        {loop.map((item, position) => {
          const active = position === index
          const failed = broken[item.src]
          return <figure key={`${item.src}-${position}`} className={`rail-card${active ? ' is-active' : ''}`} aria-hidden={active ? undefined : 'true'}>
            {failed
              ? <div className="rail-fallback"><img src="/favicon.png" alt="" /><span>Achilles Content</span></div>
              : <img
                  src={item.src}
                  alt={active ? 'Arte gerada no Achilles Content' : ''}
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                  onError={() => setBroken(map => ({ ...map, [item.src]: true }))}
                />}
            {item.tag && <figcaption>{item.tag}</figcaption>}
          </figure>
        })}
      </div>
    </div>

    <div className="rail-controls">
      <button type="button" onClick={() => go(-1)} aria-label="Arte anterior"><ChevronLeft size={19} /></button>
      <div className="rail-dots">{items.map((item, i) =>
        <button
          key={item.src}
          type="button"
          className={i === current ? 'on' : ''}
          onClick={() => setIndex(count + i)}
          aria-label={`Ir para a arte ${i + 1}`}
          aria-current={i === current ? 'true' : undefined}
        />
      )}</div>
      <button type="button" onClick={() => go(1)} aria-label="Próxima arte"><ChevronRight size={19} /></button>
    </div>
  </div>
}
