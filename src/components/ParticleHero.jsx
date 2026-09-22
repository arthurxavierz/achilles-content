import React, { useEffect, useRef } from 'react'

const GOLD = [181, 134, 35]

export default function ParticleHero() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let dpr = 1
    let particles = []
    let streaks = []
    let raf = 0
    let last = 0
    let visible = true

    function makeParticle(fromEdge = false) {
      const depth = Math.random()
      const x = fromEdge ? -30 - Math.random() * width * 0.2 : Math.random() * width
      const baseY = Math.random() * height
      const y = baseY
      return {
        x,
        baseY,
        y,
        previousX: x,
        previousY: y,
        speed: 0.16 + depth * 0.5,
        amplitude: 10 + Math.random() * 54,
        frequency: 0.002 + Math.random() * 0.005,
        phase: Math.random() * Math.PI * 2,
        radius: 0.55 + depth * 1.35,
        alpha: 0.12 + depth * 0.42
      }
    }

    function makeStreak(fromEdge = false) {
      return {
        x: fromEdge ? -220 : Math.random() * width,
        y: height * (0.12 + Math.random() * 0.76),
        speed: 0.85 + Math.random() * 1.65,
        length: 70 + Math.random() * 150,
        alpha: 0.08 + Math.random() * 0.14,
        drift: (Math.random() - 0.5) * 0.08
      }
    }

    function seed() {
      const particleCount = Math.min(130, Math.max(64, Math.round((width * height) / 10500)))
      particles = Array.from({ length: particleCount }, () => makeParticle())
      streaks = Array.from({ length: width < 700 ? 4 : 8 }, () => makeStreak())
    }

    function resize() {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
      draw(0, 0)
    }

    function draw(delta, now) {
      ctx.clearRect(0, 0, width, height)
      const step = Math.min(delta || 16.67, 40) / 16.67

      for (const streak of streaks) {
        streak.x += streak.speed * step
        streak.y += streak.drift * step
        if (streak.x - streak.length > width) Object.assign(streak, makeStreak(true))

        const gradient = ctx.createLinearGradient(streak.x - streak.length, streak.y, streak.x, streak.y)
        gradient.addColorStop(0, 'rgba(181,134,35,0)')
        gradient.addColorStop(0.72, `rgba(${GOLD.join(',')},${streak.alpha})`)
        gradient.addColorStop(1, 'rgba(230,195,108,.38)')
        ctx.strokeStyle = gradient
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(streak.x - streak.length, streak.y)
        ctx.lineTo(streak.x, streak.y)
        ctx.stroke()
      }

      for (const particle of particles) {
        particle.previousX = particle.x
        particle.previousY = particle.y
        particle.x += particle.speed * step
        particle.y = particle.baseY + Math.sin(particle.x * particle.frequency + particle.phase + now * 0.00012) * particle.amplitude
        if (particle.x > width + 35) Object.assign(particle, makeParticle(true))

        ctx.strokeStyle = `rgba(${GOLD.join(',')},${particle.alpha * 0.22})`
        ctx.lineWidth = Math.max(0.5, particle.radius * 0.55)
        ctx.beginPath()
        ctx.moveTo(particle.previousX, particle.previousY)
        ctx.lineTo(particle.x, particle.y)
        ctx.stroke()

        ctx.fillStyle = `rgba(${GOLD.join(',')},${particle.alpha})`
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    function frame(now) {
      if (visible) draw(now - (last || now), now)
      last = now
      raf = requestAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
    observer.observe(canvas)
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    if (!reduced) raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      resizeObserver.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
}
