import React, { useEffect, useState } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEFAULT_PLANS, FORMAT_PRICING } from '../../shared/pricing'
import { DEMO_MODE } from '../lib/config'
import { publicApi } from '../lib/api'
import { normalizePlans } from '../lib/normalize'
import { money } from '../lib/format'

const wa = 'https://wa.me/5541988491690?text=Ol%C3%A1%2C%20quero%20conhecer%20o%20Achilles%20Content.'
const faqs = [
  ['O que é um crédito?', 'Crédito é a unidade usada para gerar copies e imagens dentro do Achilles Content.'],
  ['Os créditos acumulam?', 'Créditos do plano renovam a cada ciclo. Créditos avulsos não expiram.'],
  ['Posso comprar créditos avulsos?', 'Sim. Os pacotes complementam o saldo e não alteram sua assinatura.'],
  ['Posso trocar de plano?', 'Sim. Upgrades podem ser aplicados imediatamente. Downgrades entram no ciclo seguinte.'],
  ['Quem é o dono das artes?', 'As artes geradas para sua conta ficam disponíveis para uso da sua marca, respeitando os termos do serviço.'],
  ['Qual o prazo de entrega?', 'A geração começa após a aprovação da copy. O andamento aparece em tempo real no estúdio.']
]

export default function Landing() {
  const [open, setOpen] = useState(0)
  // Preco e creditos vem do banco para a pagina publica nunca divergir da cobranca.
  // O texto de marketing (badge, suporte) continua curado em shared/pricing.js.
  const [plans, setPlans] = useState(DEFAULT_PLANS)

  useEffect(() => {
    if (DEMO_MODE) return
    publicApi('list-plans')
      .then(out => {
        const live = new Map(normalizePlans(out.plans).map(p => [p.slug, p]))
        setPlans(DEFAULT_PLANS.map(p => live.has(p.slug) ? { ...p, ...live.get(p.slug) } : p))
      })
      .catch(() => { /* a landing continua com os valores padrao */ })
  }, [])
  return <div className="landing">
    <header className="public-nav"><Link to="/" className="logo"><span className="brand-mark">A</span><div><strong>ACHILLES</strong><small>CONTENT</small></div></Link><nav><a href="#como">Como funciona</a><a href="#planos">Planos</a><Link to="/entrar" className="nav-login">Entrar</Link></nav></header>
    <section className="hero"><div><span className="eyebrow">CONTEÚDO COM IDENTIDADE</span><h1>CONTEÚDO DA SUA MARCA.<br/><em>SEM COMEÇAR DO ZERO.</em></h1><p>Defina sua identidade uma vez. Gere copies e artes alinhadas à sua marca sempre que precisar.</p><div className="hero-actions"><a href="#planos" className="btn primary">VER PLANOS<ArrowRight size={18}/></a><a href={wa} className="btn secondary">FALAR COM A EQUIPE</a></div></div><div className="hero-mock"><div className="mock-screen"><span>ACHILLES CONTENT</span><strong>Seu próximo conteúdo começa com uma ideia.</strong><div className="mock-field">Digite o tema da publicação</div><button>GERAR COPY</button></div></div></section>
    <section className="proof"><div className="section-head"><span className="eyebrow">PROVA VISUAL</span><h2>UMA MARCA. MUITAS ENTREGAS.</h2></div><div className="proof-track">{Array.from({length:6}).map((_,i)=><div className="post-placeholder" key={i}><span>POST {String(i+1).padStart(2,'0')}</span><strong>ESPAÇO PARA POST REAL</strong><small>Substituir por print de entrega</small></div>)}</div></section>
    <section className="steps" id="como"><div className="section-head"><span className="eyebrow">COMO FUNCIONA</span><h2>DO TEMA À ARTE.</h2></div><div className="step-grid">{[['01','Informe o tema','Diga o assunto e o objetivo da publicação.'],['02','Receba a copy','O sistema escreve seguindo seu Brand Brain.'],['03','Aprove','Revise, ajuste e aprove antes de gastar com imagem.'],['04','Receba as artes','A geração começa e o progresso aparece no painel.']].map(x=><article key={x[0]}><b>{x[0]}</b><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</div></section>
    <section className="deliveries"><div className="section-head"><span className="eyebrow">ENTREGAS</span><h2>ESCOLHA O FORMATO.</h2></div><div className="delivery-grid">{Object.values(FORMAT_PRICING).map(item=><article key={item.slug}><span>{item.label.toUpperCase()}</span><h3>{item.totalCredits} CRÉDITOS</h3><p>Copy: {item.copyCredits}. Imagens: {item.imageCount} {item.imageCount>1?'artes':'arte'} por {item.imageCreditsEach} créditos cada.</p></article>)}</div></section>
    <section className="brand-section"><div><span className="eyebrow">BRAND BRAIN</span><h2>SUA IDENTIDADE ENTRA UMA VEZ. O SISTEMA USA SEMPRE.</h2><p>Tom, público, cores, regras visuais, diferenciais e guardrails ficam ligados à sua conta e orientam cada nova geração.</p></div><div className="brand-preview"><div><small>MARCA</small><strong>Clínica Aurora</strong></div><div><small>TOM</small><strong>Profissional, humano e direto</strong></div><div className="color-row"><i/><i/></div></div></section>
    <section className="plans" id="planos"><div className="section-head"><span className="eyebrow">PLANOS</span><h2>CRÉDITOS PARA O SEU RITMO.</h2></div><div className="plan-grid">{plans.map(plan=><article key={plan.slug} className={plan.badge?'featured':''}>{plan.badge&&<span className="tag">{plan.badge}</span>}<h3>{plan.name}</h3><div className="price">{money(plan.priceCents)}<small>/mês</small></div><strong>{plan.monthlyCredits} créditos por ciclo</strong><ul><li>{plan.brands ? `${plan.brands} ${plan.brands===1?'marca':'marcas'}` : 'Marcas ilimitadas'}</li><li>Histórico: {plan.history}</li><li>Suporte: {plan.support}</li></ul><Link to="/entrar" className="btn primary">CONTRATAR</Link></article>)}</div></section>
    <section className="faq"><div className="section-head"><span className="eyebrow">PERGUNTAS FREQUENTES</span><h2>O QUE PRECISA FICAR CLARO.</h2></div><div>{faqs.map(([q,a],i)=><button key={q} className="faq-item" onClick={()=>setOpen(open===i?-1:i)}><span><strong>{q}</strong><ChevronDown className={open===i?'rot':''}/></span>{open===i&&<p>{a}</p>}</button>)}</div></section>
    <section className="final-cta"><span className="eyebrow">ACHILLES CONTENT</span><h2>PRONTO PARA COLOCAR SUA MARCA NO FLUXO?</h2><p>Fale com a equipe pelo WhatsApp 41 98849-1690.</p><div><a className="btn primary" href={wa}>FALAR NO WHATSAPP</a><a className="btn secondary" href="#planos">VER PLANOS</a></div></section>
    <footer><div className="logo"><span className="brand-mark">A</span><div><strong>ACHILLES</strong><small>CONTENT</small></div></div><span>41 98849-1690</span><div><Link to="/privacidade">Privacidade</Link><Link to="/termos">Termos de uso</Link></div></footer>
  </div>
}
