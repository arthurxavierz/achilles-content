import React, { useEffect, useRef } from 'react'

// Fundo animado da hero. Dois sistemas no mesmo canvas, para um loop só:
//
//  1. Poeira: motes dourados que vagam devagar, com linhas entre vizinhos
//     próximos. É o "pó" do fundo, discreto de propósito.
//  2. Marca: partículas que convergem para o desenho da logo. Os alvos não
//     são desenhados na mão: amostramos o canal alpha de /logo.png, então
//     se a marca mudar, a formação muda junto.
//
// A cada ciclo um pulso espalha as partículas e elas se reagrupam. É isso
// que dá a leitura de "partículas formando alguma coisa".

const GOLD = [216, 175, 88]
const PULSE_MS = 9000

export default function ParticleHero() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0, height = 0, dpr = 1
    let motes = [], marks = [], targets = []
    let raf = 0, last = 0, elapsed = 0, pulse = -1
    let visible = true, running = true

    function resize() {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seedMotes()
      placeTargets()
    }

    function seedMotes() {
      // Densidade por área, com teto: notebook antigo não pode engasgar.
      const count = Math.min(110, Math.round((width * height) / 14000))
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: Math.random() * 1.5 + 0.4,
        a: Math.random() * 0.4 + 0.12
      }))
    }

    // A marca fica na metade direita no desktop e centralizada quando a
    // hero empilha no celular.
    function markBox() {
      const stacked = width < 900
      const h = Math.min(height * (stacked ? 0.52 : 0.78), stacked ? 320 : 460)
      const w = h * 0.34
      return {
        w, h,
        cx: stacked ? width / 2 : width * 0.74,
        cy: stacked ? height * 0.72 : height / 2
      }
    }

    function placeTargets() {
      if (!targets.length) return
      const box = markBox()
      marks = targets.map((t, i) => {
        const tx = box.cx + (t.x - 0.5) * box.w
        const ty = box.cy + (t.y - 0.5) * box.h
        const old = marks[i]
        return {
          tx, ty,
          x: old ? old.x : box.cx + (Math.random() - 0.5) * width,
          y: old ? old.y : box.cy + (Math.random() - 0.5) * height,
          vx: old ? old.vx : 0,
          vy: old ? old.vy : 0,
          // Fase própria: sem isso a marca "respira" toda junta e fica robótica.
          phase: old ? old.phase : Math.random() * Math.PI * 2,
          r: Math.random() * 1.3 + 0.55
        }
      })
    }

    function loadMark() {
      const img = new Image()
      img.onload = () => {
        const S = 150
        const off = document.createElement('canvas')
        off.width = S; off.height = Math.round(S * img.height / img.width)
        const octx = off.getContext('2d', { willReadFrequently: true })
        if (!octx) return
        octx.drawImage(img, 0, 0, off.width, off.height)
        let data
        try { data = octx.getImageData(0, 0, off.width, off.height).data } catch { return }

        const found = []
        const step = 2
        for (let y = 0; y < off.height; y += step) {
          for (let x = 0; x < off.width; x += step) {
            if (data[(y * off.width + x) * 4 + 3] > 130) {
              found.push({ x: x / off.width, y: y / off.height })
            }
          }
        }
        // Amostra uniforme até um teto, embaralhando antes para não pegar
        // só a parte de cima do desenho.
        for (let i = found.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[found[i], found[j]] = [found[j], found[i]]
        }
        targets = found.slice(0, 460)
        placeTargets()
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
      ctx.clearRect(0, 0, width, height)
      const k = dt / 16.67

      // --- poeira e teias ---
      ctx.lineWidth = 1
      for (const m of motes) {
        m.x += m.vx * k; m.y += m.vy * k
        if (m.x < -20) m.x = width + 20; else if (m.x > width + 20) m.x = -20
        if (m.y < -20) m.y = height + 20; else if (m.y > height + 20) m.y = -20
      }
      for (let i = 0; i < motes.length; i++) {
        const a = motes[i]
        for (let j = i + 1; j < motes.length; j++) {
          const b = motes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < 15000) {
            ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${0.085 * (1 - d2 / 15000)})`
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          }
        }
        ctx.fillStyle = `rgba(242,217,143,${a.a})`
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill()
      }

      // --- a marca se formando ---
      // Logo após o pulso a atração é fraca e as partículas se espalham;
      // depois ela cresce e o desenho se refaz.
      const settle = Math.min(1, sincePulse / 2.4)
      const pull = 0.006 + 0.052 * settle * settle
      const burst = sincePulse < 0.45 ? (1 - sincePulse / 0.45) * 7 : 0

      for (const p of marks) {
        p.phase += 0.014 * k
        const dx = p.tx - p.x, dy = p.ty - p.y
        p.vx += dx * pull * k
        p.vy += dy * pull * k
        if (burst) {
          const d = Math.hypot(dx, dy) || 1
          p.vx -= (dx / d) * burst * Math.random() * k
          p.vy -= (dy / d) * burst * Math.random() * k
        }
        // Ruído que mantém a marca viva depois de formada.
        p.vx += Math.cos(p.phase) * 0.018 * k
        p.vy += Math.sin(p.phase * 1.3) * 0.018 * k
        p.vx *= 0.9; p.vy *= 0.9
        p.x += p.vx * k; p.y += p.vy * k

        const near = 1 - Math.min(1, Math.hypot(p.tx - p.x, p.ty - p.y) / 70)
        const alpha = 0.16 + near * 0.72
        ctx.fillStyle = `rgba(${242 - Math.round(near * 20)},${217 + Math.round(near * 20)},${143 + Math.round(near * 60)},${alpha})`
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.7 + near * 0.6), 0, Math.PI * 2); ctx.fill()
      }

      // Brilho difuso atrás da formação, para a marca não flutuar no vazio.
      const box = markBox()
      const glow = ctx.createRadialGradient(box.cx, box.cy, 0, box.cx, box.cy, box.h * 0.85)
      glow.addColorStop(0, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.10)`)
      glow.addColorStop(1, 'rgba(216,175,88,0)')
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = glow
      ctx.fillRect(box.cx - box.h, box.cy - box.h, box.h * 2, box.h * 2)
      ctx.globalCompositeOperation = 'source-over'
    }

    // Parado fora da tela e em aba escondida: não gasta bateria à toa.
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0 })
    io.observe(canvas)
    const onVisibility = () => { visible = !document.hidden }
    document.addEventListener('visibilitychange', onVisibility)

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    resize()
    loadMark()

    if (reduced) {
      // Sem movimento: desenha o estado formado uma vez e para por aí.
      const settleOnce = () => { for (let i = 0; i < 260; i++) draw(16.67, 99) ; ctx.clearRect(0,0,width,height); draw(16.67, 99) }
      const t = setTimeout(settleOnce, 260)
      return () => { clearTimeout(t); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVisibility) }
    }

    raf = requestAnimationFrame(frame)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect(); io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
}
