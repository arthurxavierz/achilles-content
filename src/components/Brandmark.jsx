import React from 'react'

// A marca vive em public/logo.png: branca sobre transparente, feita para o
// fundo escuro da interface. Antes era a letra "A" desenhada em CSS.
export default function Brandmark({ size = 38, plate = true, className = '' }) {
  if (!plate) return <img className={`mark-plain ${className}`} src="/logo.png" alt="Achilles" style={{ height: size }} />
  return <span className={`brand-mark ${className}`} style={{ width: size, height: size }}>
    <img src="/logo.png" alt="Achilles" />
  </span>
}

export function Wordmark({ to, small = 'CONTENT' }) {
  return <><Brandmark /><div><strong>ACHILLES</strong><small>{small}</small></div></>
}
