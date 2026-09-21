import Brandmark from './Brandmark'
import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error(error, info) }
  render() {
    if (this.state.error) return <main className="fatal"><Brandmark size={46}/><h1>ALGO SAIU DO FLUXO.</h1><p>Recarregue a página. Se o problema continuar, fale com a Achilles Media.</p><button onClick={() => location.reload()}>Recarregar</button></main>
    return this.props.children
  }
}
