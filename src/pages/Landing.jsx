import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Fingerprint,
  Gauge,
  Layers3,
  Mail,
  Menu,
  MessageCircle,
  Palette,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
  Zap
} from 'lucide-react'
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

const steps = [
  ['01', 'Brand Brain', 'Você registra tom de voz, público, cores, referências e limites da marca.'],
  ['02', 'Copy aprovada', 'A IA escreve posts, stories e carrosséis antes de qualquer gasto com imagem.'],
  ['03', 'Direção de arte', 'O sistema transforma a copy aprovada em briefing visual com paleta, luz e composição.'],
  ['04', 'Entrega pronta', 'As artes entram na fila, ficam no histórico e podem ser baixadas quando estiverem prontas.']
]

const features = [
  ['Identidade viva', 'A marca deixa de depender de memória solta em conversas e vira regra operacional.', Fingerprint],
  ['Carrosséis consistentes', 'Slides seguem a mesma direção visual, sem variar estilo a cada imagem gerada.', Layers3],
  ['Crédito transparente', 'O custo aparece antes de confirmar, com separação entre copy, arte padrão e arte assinatura.', Gauge],
  ['Fluxo de aprovação', 'Texto primeiro, imagem depois. A equipe decide antes de consumir os créditos mais caros.', ShieldCheck],
  ['Presets premium', 'Editorial, cinematográfico, luxo quente, dark tech e outros caminhos prontos para campanha.', Palette],
  ['Histórico de produção', 'Tudo que foi criado permanece organizado para reuso, revisão e controle do cliente.', BarChart3]
]

const proof = [
  ['1 briefing', 'vira copy, direção e arte final no mesmo fluxo'],
  ['200 créditos', 'para testar sem cartão na primeira conta'],
  ['3 formatos', 'post, story e carrossel com custo previsível'],
  ['2 qualidades', 'padrão para rotina e assinatura para peças-chave']
]

const faqs = [
  ['O que é o Achilles Content?', 'É uma plataforma da Achilles para criar copies e artes com IA mantendo a identidade da marca. Você cadastra o Brand Brain uma vez e usa esse contexto nas próximas gerações.'],
  ['O que é um crédito?', 'Crédito é a unidade usada para gerar copies e imagens. Cada operação tem custo fixo e transparente, exibido antes da confirmação.'],
  ['Quantos créditos ganho para testar?', `Toda conta nova recebe ${FREE_SIGNUP_CREDITS} créditos de cortesia. Dá para gerar uma copy completa e uma arte, sem cartão e sem compromisso.`],
  ['Os créditos acumulam?', 'Os créditos do plano renovam a cada ciclo e o saldo anterior expira. Os créditos avulsos comprados em pacote não expiram.'],
  ['Como funciona o pagamento?', 'Você gera um QR Code PIX dentro da plataforma e paga pelo app do banco. A Achilles confere o pagamento e libera os créditos na conta.'],
  ['Posso trocar de plano?', 'Sim. O upgrade vale a partir do pagamento confirmado. O downgrade entra no ciclo seguinte.'],
  ['Quem é o dono das artes?', 'As artes geradas para sua conta ficam disponíveis para uso da sua marca, respeitando os termos do serviço.'],
  ['E se uma geração falhar?', 'O sistema estorna automaticamente os créditos das peças que não foram entregues. Você não paga por arte que não recebeu.']
]

export default function Landing() {
  const [open, setOpen] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
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

  const planRange = useMemo(() => {
    const sorted = [...plans].sort((a, b) => a.priceCents - b.priceCents)
    return [sorted[0], sorted[sorted.length - 1]]
  }, [plans])

  const closeMenu = () => setMenuOpen(false)

  return <div className="landing landing-v15">
    <header className="public-nav campaign-nav">
      <div className="nav-shell">
        <Link to="/" className="wordmark" onClick={closeMenu}><img src="/wordmark.png" alt="Achilles" /><small>CONTENT</small></Link>
        <nav id="landing-navigation" className={menuOpen ? 'open' : ''}>
          <a href="#app" onClick={closeMenu}>O app</a>
          <a href="#como" onClick={closeMenu}>Como funciona</a>
          <a href="#recursos" onClick={closeMenu}>Recursos</a>
          <a href="#planos" onClick={closeMenu}>Planos</a>
          <a href="#faq" onClick={closeMenu}>Dúvidas</a>
          <Link to="/entrar" className="mobile-login" onClick={closeMenu}>Entrar</Link>
        </nav>
        <div className="nav-actions">
          <Link to="/entrar" className="nav-login">Entrar</Link>
          <Link to="/criar-conta" className="nav-start">Começar agora</Link>
          <button className="nav-toggle" type="button" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-controls="landing-navigation" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
    </header>

    <section className="hero campaign-hero">
      <ParticleHero />
      <div className="hero-inner campaign-hero-inner">
        <span className="eyebrow hero-in" style={{ animationDelay: '80ms' }}>CONTEÚDO COM IDENTIDADE, ESCALA E DIREÇÃO</span>
        <h1 className="hero-in" style={{ animationDelay: '160ms' }}>Sua marca em ritmo de campanha.</h1>
        <p className="hero-in" style={{ animationDelay: '260ms' }}>Copy, direção de arte e imagens no mesmo fluxo. Você define a identidade uma vez, aprova cada etapa e publica mais sem deixar sua marca com cara de template.</p>
        <div className="hero-actions hero-in" style={{ animationDelay: '360ms' }}>
          <Link to="/criar-conta" className="btn primary">Começar com {FREE_SIGNUP_CREDITS} créditos <ArrowRight size={18} /></Link>
          <a href={wa} className="btn secondary">Falar com a equipe</a>
        </div>
        <div className="hero-ledger hero-in" style={{ animationDelay: '460ms' }}>
          <span>Copy primeiro</span>
          <span>Aprovação antes da imagem</span>
          <span>Pagamento por PIX</span>
        </div>
      </div>
      <div className="hero-scroll" aria-hidden="true"><span>ROLE</span><i/></div>
    </section>

    <main>
      <Reveal as="section" className="intro-band section-band" id="app">
        <div className="section-shell intro-grid">
          <div className="section-copy">
            <span className="eyebrow">ACHILLES CONTENT</span>
            <h2>Um estúdio de conteúdo para marcas que não podem parecer genéricas.</h2>
            <p>A plataforma foi pensada para negócios que precisam publicar com frequência, mas sem perder voz, estética e critério. O cliente não começa do zero em cada post: a base da marca guia o texto, a direção de arte e o padrão de entrega.</p>
          </div>
          <div className="product-console" aria-label="Prévia do fluxo do Achilles Content">
            <div className="console-top"><span /><span /><span /></div>
            <div className="console-row active"><Wand2 size={17} /><strong>Briefing</strong><span>Tema da campanha</span></div>
            <div className="console-row"><Sparkles size={17} /><strong>Copy</strong><span>{number(copyCredits(pricing, 'carousel'))} créditos</span></div>
            <div className="console-row"><Palette size={17} /><strong>Arte assinatura</strong><span>{number(imageCredits(pricing, 'signature'))} créditos</span></div>
            <div className="console-progress"><i style={{ width: '72%' }} /></div>
            <small>Direção visual travada antes da geração das imagens.</small>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="steps-band section-band warm-band" id="como">
        <div className="section-shell">
          <div className="section-head split-head">
            <div><span className="eyebrow">COMO FUNCIONA</span><h2>Do tema à peça final, sem improviso.</h2></div>
            <p>Uma sequência simples para operação diária, com controle no ponto certo: aprovar a ideia antes de pagar pela imagem.</p>
          </div>
          <div className="campaign-steps">{steps.map(([n, title, text]) =>
            <article key={n}>
              <b>{n}</b>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          )}</div>
        </div>
      </Reveal>

      <Reveal as="section" className="resources-band section-band" id="recursos">
        <div className="section-shell">
          <div className="section-head">
            <span className="eyebrow">RECURSOS E DIFERENCIAIS</span>
            <h2>Feito para acelerar sem desmontar a marca.</h2>
          </div>
          <div className="feature-mosaic">{features.map(([title, text, Icon], index) =>
            <article key={title} className={index === 1 || index === 4 ? 'wide' : ''}>
              <Icon size={22} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          )}</div>
        </div>
      </Reveal>

      <Reveal as="section" className="formats-band section-band" id="creditos">
        <div className="section-shell format-grid">
          <div className="section-copy">
            <span className="eyebrow">CRÉDITOS SEM SURPRESA</span>
            <h2>Você sabe o custo antes de gerar.</h2>
            <p>Cada formato mostra copy, quantidade de imagens e total estimado. A equipe decide com clareza se quer rotina eficiente ou acabamento assinatura para momentos importantes.</p>
          </div>
          <div className="format-stack">{FORMATS.map(item =>
            <article key={item.slug}>
              <span>{item.label}</span>
              <strong>{number(totalCredits(pricing, item.slug, 'standard'))} créditos</strong>
              <p>Copy: {number(copyCredits(pricing, item.slug))}. Artes: {item.imageCount} {item.imageCount > 1 ? 'peças' : 'peça'} no padrão.</p>
            </article>
          )}</div>
        </div>
      </Reveal>

      <Reveal as="section" className="about-band section-band">
        <div className="section-shell about-grid">
          <div className="about-manifesto" aria-label="Pilares da Achilles Media">
            <span className="about-monogram">A</span>
            <div><b>01</b><strong>Estratégia</strong><span>antes da ferramenta</span></div>
            <div><b>02</b><strong>Sistema</strong><span>antes do improviso</span></div>
            <div><b>03</b><strong>Identidade</strong><span>em cada entrega</span></div>
          </div>
          <div className="section-copy">
            <span className="eyebrow">SOBRE A ACHILLES</span>
            <h2>Presença digital, automação e IA trabalhando no mesmo caminho.</h2>
            <p>A Achilles Content nasce dentro da Achilles Media para transformar estratégia em execução recorrente. O foco não é gerar imagem solta: é criar um sistema que ajuda marcas a manterem posicionamento, velocidade e padrão visual.</p>
            <a className="text-link" href={CONTACT.site} target="_blank" rel="noreferrer">Conhecer a Achilles Media <ArrowRight size={16} /></a>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="proof-band section-band">
        <div className="section-shell">
          <div className="proof-ribbon">{proof.map(([value, label]) =>
            <article key={value}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          )}</div>
        </div>
      </Reveal>

      <Reveal as="section" className="pricing-section section-band" id="planos">
        <div className="section-shell">
          <div className="section-head split-head pricing-head">
            <div><span className="eyebrow">PLANOS</span><h2>Uma vitrine de créditos com presença de palco.</h2></div>
            <p>De {planRange[0] ? money(planRange[0].priceCents) : 'R$ 0'} a {planRange[1] ? money(planRange[1].priceCents) : 'R$ 0'} por mês, com pacotes avulsos para picos de campanha.</p>
          </div>
          <div className="pricing-stage">{plans.map((plan, index) =>
            <article key={plan.slug} className={plan.badge ? 'spotlight' : ''}>
              <div className="plan-orbit"><span>{String(index + 1).padStart(2, '0')}</span>{plan.badge && <b>{plan.badge}</b>}</div>
              <h3>{plan.name}</h3>
              <div className="price">{money(plan.priceCents)}<small>/mês</small></div>
              <strong>{number(plan.monthlyCredits)} créditos por ciclo</strong>
              <ul>
                <li><Check size={15} />{plan.brands ? `${plan.brands} ${plan.brands === 1 ? 'marca' : 'marcas'}` : 'Marcas ilimitadas'}</li>
                <li><Check size={15} />Histórico: {plan.history}</li>
                <li><Check size={15} />Suporte: {plan.support || 'Prioritário'}</li>
              </ul>
              <Link to="/criar-conta" className="btn primary">Escolher plano</Link>
            </article>
          )}</div>
          <div className="packs-runway">
            <span className="eyebrow">PACOTES AVULSOS</span>
            <div>{packs.map(p => <p key={p.slug}><strong>{number(p.credits)}</strong><span>{money(p.priceCents)}</span></p>)}</div>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="presets-band section-band">
        <div className="section-shell presets-grid">
          <div className="section-copy">
            <span className="eyebrow">DIREÇÃO VISUAL</span>
            <h2>Presets com cara de campanha, não de template.</h2>
            <p>A plataforma já nasce com caminhos de direção para conteúdo premium. Cada preset orienta luz, composição, atmosfera e consistência entre slides.</p>
          </div>
          <div className="preset-wall">{presets.slice(0, 8).map((preset, index) =>
            <article key={preset.slug}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{preset.name}</strong>
              <p>{preset.summary}</p>
            </article>
          )}</div>
        </div>
      </Reveal>

      <Reveal as="section" className="faq-section section-band" id="faq">
        <div className="section-shell faq-grid">
          <div className="faq-panel">
            <span className="eyebrow">DÚVIDAS FREQUENTES</span>
            <h2>Clareza para comprar, testar e operar.</h2>
            <p>As respostas principais ficam abertas em uma área de consulta rápida, com a mesma objetividade que o produto promete no uso diário.</p>
            <div className="faq-contact">
              <a href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} />WhatsApp</a>
              <a href={`mailto:${CONTACT.email}`}><Mail size={18} />E-mail</a>
            </div>
          </div>
          <div className="faq-list">{faqs.map(([q, a], i) =>
            <button key={q} className="faq-item" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
              <span><strong>{q}</strong><ChevronDown className={open === i ? 'rot' : ''} /></span>
              {open === i && <p>{a}</p>}
            </button>
          )}</div>
        </div>
      </Reveal>

      <Reveal as="section" className="contact-band section-band">
        <div className="section-shell contact-grid">
          <div>
            <span className="eyebrow">ÚLTIMA CHAMADA</span>
            <h2>Coloque sua marca em um fluxo de criação mais inteligente.</h2>
          </div>
          <div>
            <p>Comece com {FREE_SIGNUP_CREDITS} créditos de cortesia ou fale com a Achilles para entender o melhor plano para sua rotina de conteúdo.</p>
            <div className="contact-actions">
              <Link className="btn primary" to="/criar-conta">Criar minha conta <Zap size={17} /></Link>
              <a className="btn secondary" href={wa} target="_blank" rel="noreferrer">Falar no WhatsApp</a>
            </div>
          </div>
        </div>
      </Reveal>
    </main>

    <SiteFooter />
  </div>
}
