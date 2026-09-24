import React, { useEffect, useRef } from 'react'

// Fundo animado da hero, sobre o dourado.
//
// A marca é o assunto: as partículas convergem para o desenho exato de
// /logo.png e param em cima dele. O resto da cena existe para dar
// profundidade ao dourado, nunca para disputar leitura com o título.
//
// Três camadas, um canvas, um loop:
//  1. Brilho: manchas quentes que derivam devagar sobre o dourado.
//  2. Poeira: motes de luz que sobem devagar e cintilam.
//  3. Marca: partículas que convergem para o desenho da logo.
//
// Quatro decisões que valem registro:
//
// Nada aqui acompanha o cursor. O paralaxe de antes obrigava a recalcular a
// cena inteira a cada movimento do mouse, e o que o olho via era atraso, não
// resposta. Movimento de fundo não precisa de interação.
//
// Não há mais teia entre partículas vizinhas. Ligar cada mote a cada outro é
// trabalho quadrático: 120 motes custavam 7 mil medidas de distância por
// quadro para produzir linhas que quase não se viam.
//
// Os alvos saem de uma GRADE sobre o desenho, não de um sorteio. Sorteio
// deixa aglomerado e buraco, e o contorno vira mancha; grade cobre parelho,
// e é isso que faz a nuvem virar a logo de verdade. O passo da grade é
// calculado do tamanho que a marca tem na tela, então o espaçamento entre
// partículas é o mesmo no monitor e no celular.
//
// E cada partícula é uma imagem pronta, desenhada com drawImage, em vez de
// um arco traçado de novo a cada quadro. São milhares por quadro: o custo de
// abrir caminho e preencher, multiplicado por isso, é o que trava.

const PULSE_MS = 11000
const MAX_MARKS = 2700

export default function ParticleHero() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0, height = 0
    let motes = [], marks = [], mask = null, dotR = 2.6
    let raf = 0, last = 0, elapsed = 0, pulse = -1
    let visible = true, running = true

    // Duas moedas de luz, desenhadas uma vez. Núcleo cheio e borda macia:
    // cheia demais serrilha, macia demais borra o contorno da marca.
    function sprite(r, g, b) {
      const S = 64
      const off = document.createElement('canvas')
      off.width = off.height = S
      const c = off.getContext('2d')
      const grad = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
      grad.addColorStop(0, `rgba(${r},${g},${b},1)`)
      grad.addColorStop(0.58, `rgba(${r},${g},${b},1)`)
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
      c.fillStyle = grad
      c.fillRect(0, 0, S, S)
      return off
    }
    const dotLight = sprite(255, 255, 255)
    const dotWarm = sprite(255, 244, 214)

    function resize() {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
      buildTargets()
    }

    // A hero é centralizada, então a marca fica atrás do texto.
    function markBox() {
      const h = Math.min(height * 0.82, 660)
      return { w: h * 0.34, h, cx: width / 2, cy: height * 0.5 }
    }

    function seed() {
      const n = Math.min(70, Math.round((width * height) / 26000))
      motes = Array.from({ length: n }, () => ({
        x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.1, vy: -(0.05 + Math.random() * 0.12),
        r: Math.random() * 1.3 + 0.5, a: Math.random() * 0.3 + 0.12,
        tw: Math.random() * Math.PI * 2, tws: 0.4 + Math.random() * 1.2
      }))
    }

    function buildTargets() {
      if (!mask) return
      const box = markBox()
      const scale = box.w / mask.w
      // No celular a marca ocupa quase a mesma altura, então o alívio não
      // pode vir do tamanho: vem de espalhar mais as partículas.
      const spacing = width < 700 ? 8 : 6
      let step = Math.max(2, Math.round(spacing / scale))

      const collect = s => {
        const found = []
        for (let y = 0; y < mask.h; y += s) {
          for (let x = 0; x < mask.w; x += s) {
            if (mask.bits[y * mask.w + x]) found.push({ x: x / mask.w, y: y / mask.h })
          }
        }
        return found
      }
      let found = collect(step)
      while (found.length > MAX_MARKS) { step += 1; found = collect(step) }

      // O raio segue o espaçamento real na tela: as moedas quase se tocam,
      // o que dá desenho contínuo sem virar borrão.
      dotR = Math.max(1.5, step * scale * 0.58)

      marks = found.map((t, i) => {
        const tx = box.cx + (t.x - 0.5) * box.w
        const ty = box.cy + (t.y - 0.5) * box.h
        const old = marks[i]
        return {
          tx, ty,
          x: old ? old.x : box.cx + (Math.random() - 0.5) * width,
          y: old ? old.y : box.cy + (Math.random() - 0.5) * height,
          vx: old ? old.vx : 0, vy: old ? old.vy : 0,
          phase: old ? old.phase : Math.random() * Math.PI * 2,
          jitter: 0.86 + Math.random() * 0.28,
          ny: t.y
        }
      })
    }

    // Guarda o desenho como mapa de bits uma vez. O corte de alpha é alto de
    // propósito: pega o miolo da marca e descarta a borda esfumada.
    function loadMark() {
      const img = new Image()
      img.onload = () => {
        const S = 174
        const off = document.createElement('canvas')
        off.width = S
        off.height = Math.max(1, Math.round(S * img.height / img.width))
        const octx = off.getContext('2d', { willReadFrequently: true })
        if (!octx) return
        octx.drawImage(img, 0, 0, off.width, off.height)
        let data
        try { data = octx.getImageData(0, 0, off.width, off.height).data } catch { return }
        const bits = new Uint8Array(off.width * off.height)
        for (let i = 0; i < bits.length; i++) bits[i] = data[i * 4 + 3] > 150 ? 1 : 0
        mask = { w: off.width, h: off.height, bits }
        buildTargets()
      }
      img.src = '/logo.png'
    }

    function frame(now) {
      if (!running) return
      const dt = Math.min(48, now - (last || now))
      last = now
      if (visible) {
        elapsed += dt
        if (elapsed - pulse > PULSE_MS) pulse = elapsed
        draw(dt, (elapsed - pulse) / 1000)
      }
      raf = requestAnimationFrame(frame)
    }

    function draw(dt, sincePulse) {
      const k = dt / 16.67
      const t = elapsed / 1000
      ctx.clearRect(0, 0, width, height)
      ctx.globalAlpha = 1

      const box = markBox()

      // --- 1. brilho quente ---
      for (const a of [
        { x: box.cx + Math.cos(t * 0.15) * width * 0.2, y: box.cy + Math.sin(t * 0.19) * height * 0.16, r: box.h * 0.95, a: 0.12 },
        { x: box.cx + Math.cos(t * 0.1 + 2) * width * 0.26, y: box.cy + Math.sin(t * 0.13 + 1) * height * 0.2, r: box.h * 0.7, a: 0.08 }
      ]) {
        const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r)
        g.addColorStop(0, `rgba(255,244,214,${a.a})`)
        g.addColorStop(1, 'rgba(255,244,214,0)')
        ctx.fillStyle = g
        ctx.fillRect(a.x - a.r, a.y - a.r, a.r * 2, a.r * 2)
      }

      // --- 2. poeira de luz ---
      let alpha = -1
      for (const m of motes) {
        m.x += m.vx * k
        m.y += m.vy * k
        m.tw += 0.02 * m.tws * k
        if (m.x < -20) m.x = width + 20
        else if (m.x > width + 20) m.x = -20
        if (m.y < -20) m.y = height + 20
        const a = Math.round(m.a * (0.55 + 0.45 * Math.sin(m.tw)) * 32) / 32
        if (a !== alpha) { alpha = a; ctx.globalAlpha = a }
        ctx.drawImage(dotLight, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2)
      }

      // --- 3. a marca se formando ---
      // Atração forte e atrito alto: a partícula chega e fica parada em cima
      // do alvo. Com atração fraca ela orbita, e orbitando o contorno borra.
      const settle = Math.min(1, sincePulse / 2)
      const pull = 0.01 + 0.1 * settle * settle
      const burst = sincePulse < 0.4 ? (1 - sincePulse / 0.4) * 6.5 : 0
      const sweep = sincePulse > 2.8 ? ((sincePulse - 2.8) % 4.5) / 4.5 : -1

      alpha = -1
      for (const p of marks) {
        p.phase += 0.01 * k
        const dx = p.tx - p.x, dy = p.ty - p.y
        p.vx += dx * pull * k
        p.vy += dy * pull * k
        if (burst) {
          const d = Math.hypot(dx, dy) || 1
          p.vx -= (dx / d) * burst * Math.random() * k
          p.vy -= (dy / d) * burst * Math.random() * k
        }
        p.vx += Math.cos(p.phase) * 0.005 * k
        p.vy += Math.sin(p.phase * 1.3) * 0.005 * k
        p.vx *= 0.82
        p.vy *= 0.82
        p.x += p.vx * k
        p.y += p.vy * k

        const near = 1 - Math.min(1, Math.hypot(p.tx - p.x, p.ty - p.y) / 60)
        // Formada, a marca é nítida; mas fica atrás do título, então o teto
        // de alfa é o que o texto branco aguenta ter por trás.
        let a = 0.05 + near * near * 0.4
        let r = dotR * p.jitter * (0.66 + near * 0.34)
        if (sweep >= 0) {
          const d = Math.abs(p.ny - sweep)
          if (d < 0.08) {
            const f = 1 - d / 0.08
            a += f * near * 0.28
            r *= 1 + f * 0.35
          }
        }
        a = Math.round(Math.min(1, a) * 32) / 32
        if (a !== alpha) { alpha = a; ctx.globalAlpha = a }
        ctx.drawImage(near > 0.6 ? dotLight : dotWarm, p.x - r, p.y - r, r * 2, r * 2)
      }
      ctx.globalAlpha = 1
    }

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0 })
    io.observe(canvas)
    const onVisibility = () => { visible = !document.hidden }
    document.addEventListener('visibilitychange', onVisibility)

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    loadMark()

    const cleanup = () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }

    // Sem animação: desenha a marca já formada e para.
    if (reduced) {
      const timer = setTimeout(() => {
        for (let i = 0; i < 240; i++) draw(16.67, 99)
        draw(16.67, 99)
      }, 260)
      return () => { clearTimeout(timer); cleanup() }
    }

    raf = requestAnimationFrame(frame)
    return cleanup
  }, [])

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
}
