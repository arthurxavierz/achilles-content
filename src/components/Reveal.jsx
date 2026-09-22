import React, { useEffect, useRef, useState } from 'react'

// Revela o conteúdo quando ele entra na tela. Um observer por elemento,
// desligado assim que dispara: animação de entrada não precisa ficar
// escutando o scroll a vida toda.
export default function Reveal({ children, delay = 0, as: Tag = 'div', className = '', ...rest }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(true); return }

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect() }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })

    io.observe(el)
    return () => io.disconnect()
  }, [])

  return <Tag ref={ref} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>{children}</Tag>
}
