import React, { useEffect, useRef } from 'react'

// Fundo animado da hero, no tema claro.
//
// Em fundo creme a regra se inverte: a partícula precisa ser ouro escuro,
// e o modo "lighter" não serve, porque somar luz sobre branco não produz
// nada. Tudo aqui é source-over com alfa contido.
//
// Cinco camadas, um canvas, um loop:
//  1. Aura: manchas douradas que derivam devagar e aquecem o creme.
//  2. Poeira: motes com teias entre vizinhos próximos e cintilação.
//  3. Feixes: partículas que correm de fora para dentro alimentando a marca.
//  4. Marca: partículas que convergem para o desenho da logo. Os alvos saem
//     do canal alpha de /logo.png, então se a marca mudar, a formação muda.
//  5. Varredura: uma faixa de luz percorre a marca depois de formada.
//
// A cada ciclo um pulso espalha tudo e o desenho se refaz.

const PULSE_MS = 10000
const GOLD = '157,112,23'      // --gold-deep
const GOLD_LIT = '201,154,50'  // --gold

export default function ParticleHero() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0, height = 0
    let motes = [], marks = [], beams = [], targets = []
    let raf = 0, last = 0, elapsed = 0, pulse = -1
    let visible = true, running = true
    let pointerX = 0, pointerY = 0, parX = 0, parY = 0

    function resize() {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
      placeTargets()
    }

    // A hero é centralizada, então a marca fica atrás do texto, grande e
    // discreta. O brilho branco central do CSS preserva a leitura.
    function markBox() {
      const h = Math.min(height * 0.86, 700)
      return { w: h * 0.34, h, cx: width / 2, cy: height * 0.5 }
    }

    function seed() {
      const n = Math.min(120, Math.round((width * height) / 13000))
      motes = Array.from({ length: n }, () => ({
        x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.17, vy: (Math.random() - 0.5) * 0.17,
        r: Math.random() * 1.4 + 0.4, a: Math.random() * 0.26 + 0.1,
        tw: Math.random() * Math.PI * 2, tws: 0.4 + Math.random() * 1.2
      }))
      beams = Array.from({ length: Math.min(24, Math.round(n / 4)) }, () => spawnBeam(true))
    }

    function spawnBeam(anywhere) {
      const box = markBox()
      const angle = Math.random() * Math.PI * 2
      const far = Math.max(width, height) * (anywhere ? 0.3 + Math.random() * 0.7 : 0.8)
      return {
        x: box.cx + Math.cos(angle) * far,
        y: box.cy + Math.sin(angle) * far,
        t: anywhere ? Math.random() : 0,
        speed: 0.0015 + Math.random() * 0.0026,
        r: Math.random() * 1.1 + 0.45,
        tx: box.cx + (Math.random() - 0.5) * box.w,
        ty: box.cy + (Math.random() - 0.5) * box.h
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
          vx: old ? old.vx : 0, vy: old ? old.vy : 0,
          phase: old ? old.phase : Math.random() * Math.PI * 2,
          r: Math.random() * 1.25 + 0.5,
          ny: t.y
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
        for (let y = 0; y < off.height; y += 2)
          for (let x = 0; x < off.width; x += 2)
            if (data[(y * off.width + x) * 4 + 3] > 130) found.push({ x: x / off.width, y: y / off.height })
        for (let i = found.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[found[i], found[j]] = [found[j], found[i]]
        }
        targets = found.slice(0, 520)
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
      const k = dt / 16.67
      const t = elapsed / 1000
      ctx.clearRect(0, 0, width, height)

      parX += (pointerX - parX) * 0.04 * k
      parY += (pointerY - parY) * 0.04 * k

      const box = markBox()
      const cx = box.cx + parX * 22, cy = box.cy + parY * 16

      // --- 1. aura ---
      for (const a of [
        { x: cx + Math.cos(t * 0.17) * width * 0.16, y: cy + Math.sin(t * 0.21) * height * 0.14, r: box.h * 0.95, a: 0.10 },
        { x: cx + Math.cos(t * 0.11 + 2) * width * 0.22, y: cy + Math.sin(t * 0.14 + 1) * height * 0.18, r: box.h * 0.75, a: 0.075 }
      ]) {
        const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r)
        g.addColorStop(0, `rgba(${GOLD_LIT},${a.a})`)
        g.addColorStop(0.5, `rgba(${GOLD},${a.a * 0.4})`)
        g.addColorStop(1, `rgba(${GOLD},0)`)
        ctx.fillStyle = g
        ctx.fillRect(a.x - a.r, a.y - a.r, a.r * 2, a.r * 2)
      }

      // --- 2. poeira e teias ---
      for (const m of motes) {
        m.x += m.vx * k; m.y += m.vy * k; m.tw += 0.02 * m.tws * k
        if (m.x < -20) m.x = width + 20; else if (m.x > width + 20) m.x = -20
        if (m.y < -20) m.y = height + 20; else if (m.y > height + 20) m.y = -20
      }
      ctx.lineWidth = 1
      for (let i = 0; i < motes.length; i++) {
        const a = motes[i]
        for (let j = i + 1; j < motes.length; j++) {
          const b = motes[j]
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy
          if (d2 < 15000) {
            ctx.strokeStyle = `rgba(${GOLD},${0.07 * (1 - d2 / 15000)})`
            ctx.beginPath(); ctx.moveTo(a.x + parX * 7, a.y + parY * 5); ctx.lineTo(b.x + parX * 7, b.y + parY * 5); ctx.stroke()
          }
        }
        const twinkle = 0.6 + 0.4 * Math.sin(a.tw)
        ctx.fillStyle = `rgba(${GOLD},${a.a * twinkle})`
        ctx.beginPath(); ctx.arc(a.x + parX * 7, a.y + parY * 5, a.r, 0, Math.PI * 2); ctx.fill()
      }

      // --- 3. feixes alimentando a marca ---
      for (const b of beams) {
        b.t += b.speed * k
        if (b.t >= 1) { Object.assign(b, spawnBeam(false)); continue }
        const e = 1 - Math.pow(1 - b.t, 2.2)
        const x = b.x + (b.tx + parX * 22 - b.x) * e
        const y = b.y + (b.ty + parY * 16 - b.y) * e
        const px = b.x + (b.tx + parX * 22 - b.x) * Math.max(0, e - 0.055)
        const py = b.y + (b.ty + parY * 16 - b.y) * Math.max(0, e - 0.055)
        const fade = Math.sin(Math.min(1, b.t) * Math.PI)
        const grad = ctx.createLinearGradient(px, py, x, y)
        grad.addColorStop(0, `rgba(${GOLD},0)`)
        grad.addColorStop(1, `rgba(${GOLD},${0.42 * fade})`)
        ctx.strokeStyle = grad; ctx.lineWidth = b.r
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke()
      }

      // --- 4. a marca se formando ---
      const settle = Math.min(1, sincePulse / 2.4)
      const pull = 0.006 + 0.052 * settle * settle
      const burst = sincePulse < 0.45 ? (1 - sincePulse / 0.45) * 7 : 0
      const sweep = sincePulse > 3 ? ((sincePulse - 3) % 4) / 4 : -1

      for (const p of marks) {
        p.phase += 0.014 * k
        const tx = p.tx + parX * 22, ty = p.ty + parY * 16
        const dx = tx - p.x, dy = ty - p.y
        p.vx += dx * pull * k; p.vy += dy * pull * k
        if (burst) {
          const d = Math.hypot(dx, dy) || 1
          p.vx -= (dx / d) * burst * Math.random() * k
          p.vy -= (dy / d) * burst * Math.random() * k
        }
        p.vx += Math.cos(p.phase) * 0.018 * k
        p.vy += Math.sin(p.phase * 1.3) * 0.018 * k
        p.vx *= 0.9; p.vy *= 0.9
        p.x += p.vx * k; p.y += p.vy * k

        const near = 1 - Math.min(1, Math.hypot(tx - p.x, ty - p.y) / 70)
        // Alfa contido: a marca fica atrás do texto e não pode disputar leitura.
        let alpha = 0.07 + near * 0.30
        let radius = p.r * (0.7 + near * 0.55)
        if (sweep >= 0) {
          const d = Math.abs(p.ny - sweep)
          if (d < 0.09) { const f = 1 - d / 0.09; alpha += f * 0.26; radius *= 1 + f * 0.6 }
        }
        ctx.fillStyle = `rgba(${near > 0.5 ? GOLD : GOLD_LIT},${alpha})`
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill()
      }
    }

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0 })
    io.observe(canvas)
    const onVisibility = () => { visible = !document.hidden }
    document.addEventListener('visibilitychange', onVisibility)

    const onPointer = e => {
      if (e.pointerType === 'touch') return
      pointerX = (e.clientX / innerWidth - 0.5) * 2
      pointerY = (e.clientY / innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    loadMark()

    const cleanup = () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect(); io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pointermove', onPointer)
    }

    if (reduced) {
      const timer = setTimeout(() => { for (let i = 0; i < 240; i++) draw(16.67, 99); draw(16.67, 99) }, 260)
      return () => { clearTimeout(timer); cleanup() }
    }

    raf = requestAnimationFrame(frame)
    return cleanup
  }, [])

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
}
