import React, { useEffect, useState } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEFAULT_PACKS, DEFAULT_PLANS, DEFAULT_PRESETS, DEFAULT_PRICING, FORMATS, FREE_SIGNUP_CREDITS, copyCredits, imageCredits, totalCredits } from '../../shared/pricing'
import { DEMO_MODE } from '../lib/config'
import { normalizePacks, normalizePlans } from '../lib/normalize'
import { money, number } from '../lib/format'
import { CONTACT, waLink } from '../lib/contact'
import ParticleHero from '../components/ParticleHero'
import Reveal from '../components/Reveal'
import SiteFooter from '../components/SiteFooter'

const wa = waLink('Olá, quero conhecer o Achilles Content.')

const faqs = [
  ['O que é um crédito?', 'Crédito é a unidade usada para gerar copies e imagens dentro do Achilles Content. Cada operação tem um custo fixo e transparente, exibido antes de você confirmar.'],
  ['Quantos créditos ganho para testar?', `Toda conta nova recebe ${FREE_SIGNUP_CREDITS} créditos de cortesia. Dá para gerar uma copy completa e uma arte, sem cartão e sem compromisso.`],
  ['Os créditos acumulam?', 'Os créditos do plano renovam a cada ciclo e o saldo anterior expira. Os créditos avulsos comprados em pacote não expiram nunca.'],
  ['Como funciona o pagamento?', 'Você gera um QR Code PIX dentro da plataforma e paga pelo app do seu banco. A Achilles confere o pagamento e libera os créditos na sua conta.'],
  ['Posso trocar de plano?', 'Sim. O upgrade vale a partir do pagamento confirmado. O downgrade entra no ciclo seguinte.'],
  ['Quem é o dono das artes?', 'As artes geradas para sua conta ficam disponíveis para uso da sua marca, respeitando os termos do serviço.'],
  ['E se uma geração falhar?', 'O sistema estorna automaticamente os créditos das peças que não foram entregues. Você não paga por arte que não recebeu.']
]

export default function Landing() {
  const [open, setOpen] = useState(0)
  const [plans, setPlans] = useState(DEFAULT_PLANS)
  const [packs, setPacks] = useState(DEFAULT_PACKS)
  const [pricing, setPricing] = useState(DEFAULT_PRICING)
  const [presets, setPresets] = useState(DEFAULT_PRESETS)

  // A landing le o catalogo publico. Reajuste de preco no banco aparece aqui
  // sem precisar de deploy.
  useEffect(() => {
    if (DEMO_MODE) return
    fetch('/.netlify/functions/list-plans').then(r => r.json()).then(d => {
      if (d.plans?.length) setPlans(normalizePlans(d.plans))
      if (d.packs?.length) setPacks(normalizePacks(d.packs))
    }).catch(() => {})
    fetch('/.netlify/functions/list-pricing').then(r => r.json()).then(d => {
      if (d.pricing && Object.keys(d.pricing).length) setPricing(d.pricing)
      if (d.presets?.length) setPresets(d.presets)
    }).catch(() => {})
  }, [])

  return <div className="landing">
    <header className="public-nav"><Link to="/" className="wordmark"><img src="/wordmark.png" alt="Achilles"/><small>CONTENT</small></Link><nav><a href="#como">Como funciona</a><a href="#creditos">Créditos</a><a href="#planos">Planos</a><Link to="/entrar" className="nav-login">Entrar</Link></nav></header>

    <section className="hero">
      <ParticleHero/>
      <div className="hero-inner">
        <span className="eyebrow hero-in" style={{animationDelay:'80ms'}}>CONTEÚDO COM IDENTIDADE</span>
        <h1 className="hero-in" style={{animationDelay:'160ms'}}>CONTEÚDO DA SUA MARCA.<br/><em>SEM COMEÇAR DO ZERO.</em></h1>
        <p className="hero-in" style={{animationDelay:'260ms'}}>Defina sua identidade uma vez. Gere copies e artes alinhadas à sua marca sempre que precisar. Você aprova o texto antes de gastar crédito com imagem.</p>
        <div className="hero-actions hero-in" style={{animationDelay:'360ms'}}>
          <Link to="/criar-conta" className="btn primary">COMEÇAR COM {FREE_SIGNUP_CREDITS} CRÉDITOS<ArrowRight size={18}/></Link>
          <a href={wa} className="btn secondary">FALAR COM A EQUIPE</a>
        </div>
        <small className="hero-note hero-in" style={{animationDelay:'460ms'}}>Sem cartão. Sem cobrança automática. Você paga por PIX quando decidir continuar.</small>
      </div>
    </section>

    <Reveal as="section" className="steps" id="como">
      <div className="section-head"><span className="eyebrow">COMO FUNCIONA</span><h2>DO TEMA À ARTE.</h2></div>
      <div className="step-grid">{[
        ['01','Informe o tema','Diga o assunto e o objetivo da publicação.'],
        ['02','Receba a copy','O sistema escreve seguindo o seu Brand Brain.'],
        ['03','Aprove','Revise, ajuste e aprove antes de gastar com imagem.'],
        ['04','Receba as artes','A direção de arte é montada e o progresso aparece no painel.']
      ].map(x=><article key={x[0]}><b>{x[0]}</b><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</div>
    </Reveal>

    <Reveal as="section" className="deliveries" id="creditos">
      <div className="section-head"><span className="eyebrow">TRANSPARÊNCIA</span><h2>VOCÊ SABE O QUE VAI GASTAR.</h2><p>Cada operação tem custo fixo em créditos, mostrado antes de confirmar.</p></div>
      <div className="delivery-grid">{FORMATS.map(item=><article key={item.slug}>
        <span>{item.label.toUpperCase()}</span>
        <h3>{number(totalCredits(pricing,item.slug,'standard'))} CRÉDITOS</h3>
        <p>Copy: {number(copyCredits(pricing,item.slug))} créditos. Artes: {item.imageCount} {item.imageCount>1?'peças':'peça'} a {number(imageCredits(pricing,'standard'))} créditos cada, na qualidade Padrão.</p>
      </article>)}</div>
      <div className="quality-compare">
        <article><span className="eyebrow">IMAGEM PADRÃO</span><strong>{number(imageCredits(pricing,'standard'))} créditos</strong><p>Pronta para publicar. É a escolha do dia a dia.</p></article>
        <article className="featured"><span className="eyebrow">IMAGEM ASSINATURA</span><strong>{number(imageCredits(pricing,'signature'))} créditos</strong><p>Máxima fidelidade e detalhe, com direção de arte guiada por referência. Para peças de campanha.</p></article>
      </div>
    </Reveal>

    <Reveal as="section" className="brand-section">
      <div>
        <span className="eyebrow">BRAND BRAIN E DIREÇÃO DE ARTE</span>
        <h2>SUA IDENTIDADE ENTRA UMA VEZ. O SISTEMA USA SEMPRE.</h2>
        <p>Tom, público, cores, regras visuais, referências e guardrails ficam ligados à sua conta. Antes de cada arte, o sistema monta uma direção fechada de luz, paleta e composição, e mantém ela igual em todos os slides do carrossel.</p>
      </div>
      <div className="brand-preview">
        <div><small>PRESETS DE DIREÇÃO</small><strong>{presets.length} estilos</strong></div>
        {presets.slice(0,3).map(p=><div key={p.slug}><small>{p.name.toUpperCase()}</small><strong>{p.summary}</strong></div>)}
        <div className="color-row"><i/><i/></div>
      </div>
    </Reveal>

    <Reveal as="section" className="plans" id="planos">
      <div className="section-head"><span className="eyebrow">PLANOS</span><h2>CRÉDITOS PARA O SEU RITMO.</h2></div>
      <div className="plan-grid four">{plans.map(plan=><article key={plan.slug} className={plan.badge?'featured':''}>
        {plan.badge&&<span className="tag">{plan.badge}</span>}
        <h3>{plan.name}</h3>
        <div className="price">{money(plan.priceCents)}<small>/mês</small></div>
        <strong>{number(plan.monthlyCredits)} créditos por ciclo</strong>
        <ul>
          <li>{plan.brands ? `${plan.brands} ${plan.brands===1?'marca':'marcas'}` : 'Marcas ilimitadas'}</li>
          <li>Histórico: {plan.history}</li>
          <li>Suporte: {plan.support||'Prioritário'}</li>
        </ul>
        <Link to="/criar-conta" className="btn primary">CONTRATAR</Link>
      </article>)}</div>
      <div className="pack-strip">
        <span className="eyebrow">SEM ASSINAR</span>
        <p>Pacotes avulsos que não expiram: {packs.map(p=>`${number(p.credits)} por ${money(p.priceCents)}`).join(' · ')}.</p>
      </div>
    </Reveal>

    <Reveal as="section" className="faq">
      <div className="section-head"><span className="eyebrow">PERGUNTAS FREQUENTES</span><h2>O QUE PRECISA FICAR CLARO.</h2></div>
      <div>{faqs.map(([q,a],i)=><button key={q} className="faq-item" onClick={()=>setOpen(open===i?-1:i)}><span><strong>{q}</strong><ChevronDown className={open===i?'rot':''}/></span>{open===i&&<p>{a}</p>}</button>)}</div>
    </Reveal>

    <Reveal as="section" className="final-cta">
      <span className="eyebrow">ACHILLES CONTENT</span>
      <h2>PRONTO PARA COLOCAR SUA MARCA NO FLUXO?</h2>
      <p>Comece com {FREE_SIGNUP_CREDITS} créditos de cortesia ou fale com a equipe pelo WhatsApp {CONTACT.phoneLabel}.</p>
      <div><Link className="btn primary" to="/criar-conta">CRIAR MINHA CONTA</Link><a className="btn secondary" href={wa}>FALAR NO WHATSAPP</a></div>
    </Reveal>

    <SiteFooter/>
  </div>
}
