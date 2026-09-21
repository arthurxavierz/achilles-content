import React from 'react'
import { Link } from 'react-router-dom'
import { Instagram, Mail, MapPin, MessageCircle } from 'lucide-react'
import Brandmark from './Brandmark'
import { CONTACT, waLink } from '../lib/contact'

// Rodape publico. Espelha o do site da Achilles: navegacao, solucoes e
// contato, com tudo clicavel.
export default function SiteFooter() {
  return <footer className="site-footer">
    <div className="footer-grid">
      <div className="footer-brand">
        <Brandmark size={42} plate={false} />
        <p>Presença digital de alto nível, automações com IA e sistemas inteligentes para empresas. Atendimento remoto em todo o Brasil.</p>
      </div>

      <nav>
        <span className="eyebrow">NAVEGAÇÃO</span>
        <Link to="/">Início</Link>
        <a href="#como">Como funciona</a>
        <a href="#creditos">Créditos</a>
        <a href="#planos">Planos</a>
        <Link to="/criar-conta">Criar conta</Link>
        <Link to="/entrar">Entrar</Link>
      </nav>

      <nav>
        <span className="eyebrow">SOLUÇÕES</span>
        <a href={CONTACT.site} target="_blank" rel="noreferrer">Presença Digital</a>
        <a href={CONTACT.site} target="_blank" rel="noreferrer">Inteligência Aplicada</a>
        <a href={CONTACT.site} target="_blank" rel="noreferrer">Automação de Processos</a>
        <a href={CONTACT.site} target="_blank" rel="noreferrer">Inteligência de Dados</a>
      </nav>

      <nav className="footer-contact">
        <span className="eyebrow">CONTATO</span>
        <a href={waLink()} target="_blank" rel="noreferrer"><MessageCircle size={15}/>WhatsApp: {CONTACT.phoneLabel}</a>
        <a href={`mailto:${CONTACT.email}`}><Mail size={15}/>{CONTACT.email}</a>
        <a href={CONTACT.instagram} target="_blank" rel="noreferrer"><Instagram size={15}/>{CONTACT.instagramHandle}</a>
        <span className="footer-place"><MapPin size={15}/>{CONTACT.city}</span>
      </nav>
    </div>

    <div className="footer-base">
      <small>Copyright {new Date().getFullYear()} Achilles Media. Todos os direitos reservados.</small>
      <div className="footer-legal">
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/termos">Termos de uso</Link>
      </div>
    </div>

    <a className="wa-float" href={waLink()} target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp"><MessageCircle size={26}/></a>
  </footer>
}
