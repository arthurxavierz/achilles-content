import React from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, Instagram, LifeBuoy, Mail, MessageCircle } from 'lucide-react'
import { CONTACT, waLink } from '../lib/contact'

// Rodape da area logada. Serve como atalho de suporte: o cliente nao
// deveria ter que sair do painel para achar o WhatsApp da Achilles.
export default function AppFooter() {
  return <footer className="app-footer">
    <div className="support-row">
      <div className="support-head">
        <LifeBuoy size={19}/>
        <div><strong>Precisa de ajuda?</strong><span>Fale com a equipe da Achilles. Atendimento em horário comercial.</span></div>
      </div>
      <div className="support-actions">
        <a className="btn primary" href={waLink('Olá, preciso de ajuda com o Achilles Content.')} target="_blank" rel="noreferrer"><MessageCircle size={17}/>CHAMAR NO WHATSAPP</a>
        <a className="btn secondary" href={`mailto:${CONTACT.email}`}><Mail size={17}/>E-MAIL</a>
      </div>
    </div>

    <div className="app-footer-base">
      <small>Achilles Content · {new Date().getFullYear()} Achilles Media</small>
      <div className="app-footer-links">
        <Link to="/app/planos"><CreditCard size={14}/>Planos e créditos</Link>
        <a href={CONTACT.instagram} target="_blank" rel="noreferrer"><Instagram size={14}/>{CONTACT.instagramHandle}</a>
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/termos">Termos</Link>
      </div>
    </div>
  </footer>
}
