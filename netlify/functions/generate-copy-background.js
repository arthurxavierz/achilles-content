import { loadSettings,normalizeCopy,openaiFetch,service,textCostUsd } from './_shared.js'

// O trabalho pesado da copy. Roda como Background Function porque a versão
// síncrona era morta pela plataforma antes de terminar, e o estorno morria
// junto: o crédito saía e não voltava.

const schema={type:'object',additionalProperties:false,properties:{headline:{type:'string'},slides:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},subtitle:{type:'string'}},required:['title','subtitle']}},caption:{type:'string'},hashtags:{type:'array',maxItems:30,items:{type:'string'}}},required:['headline','slides','caption','hashtags']}

const field=(label,value)=>value?`${label}: ${value}`:null

// O estilo e sugestao da plataforma. Se a marca escreveu as proprias
// regras, elas substituem o padrao por inteiro.
function buildPrompt({theme,format,brand,defaultStyle,slideCount}){
  const style=String(brand?.copy_rules||'').trim() || defaultStyle || ''
  const n=Math.max(1,Number(slideCount)||1)
  const slides=format==='carousel'
    ? `exatamente ${n} ${n===1?'slide':'slides'} encadeados, cada um avançando o raciocínio do anterior`
    : 'exatamente 1 slide'
  const marca=[
    field('Marca',brand?.brand_name), field('Segmento',brand?.segment),
    field('Público',brand?.audience), field('Tom de voz',brand?.tone),
    field('Diferenciais',brand?.differentiators), field('Serviços',brand?.services),
    field('CTA padrão',brand?.default_cta), field('Briefing',brand?.briefing),
    field('Guardrails',brand?.guardrails), field('Termos proibidos',brand?.forbidden_terms)
  ].filter(Boolean).join('\n')

  return `Você escreve para redes sociais em português do Brasil, no padrão de uma agência que cobra caro pelo que entrega.

TEMA DA PUBLICAÇÃO
${theme}

MARCA
${marca||'Marca sem Brand Brain preenchido. Escreva de forma neutra e profissional.'}

FORMATO
${format}. Gere ${slides}.

REGRAS DE ESCRITA
${style}
Respeite integralmente os guardrails da marca e nunca use os termos proibidos.
Escreva headline, títulos e subtítulos em uma única linha, sem quebra de linha no meio. A quebra é decidida na arte, não no texto.`
}

export async function handler(event){
  const svc=service()
  let generation=null
  try{
    if((event.headers['x-job-secret']||'')!==(process.env.INTERNAL_JOB_SECRET||''))return{statusCode:403}
    const {generation_id}=JSON.parse(event.body||'{}')

    const {data:g,error}=await svc.from('generations').select('*').eq('id',generation_id).single()
    if(error||!g)return{statusCode:404}
    generation=g
    if(g.copy_json)return{statusCode:200}   // já produzida, nada a fazer

    await svc.from('generations').update({status:'copy_queued',copy_started_at:new Date().toISOString()}).eq('id',g.id)

    const settings=await loadSettings(svc)
    const {data:brand}=await svc.from('brand_profiles').select('*').eq('user_id',g.user_id).maybeSingle()

    const raw=await openaiFetch('https://api.openai.com/v1/responses',
      {method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},
       body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL,input:buildPrompt({theme:g.theme,format:g.format,brand,defaultStyle:settings.copy_style_default,slideCount:g.image_count}),text:{format:{type:'json_schema',name:'content_copy',strict:true,schema}}})},
      {label:'copy',timeoutMs:Number(settings.openai_text_timeout_ms||90000),retries:Number(settings.openai_retries??2)})

    const output=raw.output_text||raw.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text
    if(!output)throw new Error('A copy voltou vazia do serviço de geração.')

    // Normaliza antes de salvar: o modelo quebra linha no título, e o
    // <input> do estúdio apaga a quebra sem pôr espaço no lugar.
    const copy=normalizeCopy(JSON.parse(output))
    await svc.from('generations').update({copy_json:copy,status:'copy_ready',copy_error:null}).eq('id',g.id)
    await svc.rpc('add_generation_cost',{p_generation_id:g.id,p_cost:textCostUsd(raw.usage)})
    return{statusCode:200}

  }catch(error){
    const userMessage=error?.userMessage||'Não foi possível gerar a copy.'
    console.error('falha na copy',generation?.id,error?.detail||error?.message)
    if(generation){
      // Estorna uma única vez, mesmo que a função seja invocada de novo.
      const {data:claimed}=await svc.rpc('claim_copy_refund',{p_generation_id:generation.id})
      if(claimed!==false){
        await svc.rpc('refund_credits',{
          p_user_id:generation.user_id,
          p_plan:Number(generation.copy_charged_plan||0),
          p_extra:Number(generation.copy_charged_extra||0),
          p_reason:'Estorno da copy não entregue',
          p_reference_id:generation.id
        })
      }
      await svc.from('generations').update({
        status:'failed',
        copy_error:`${userMessage} Os créditos da copy foram estornados.`.slice(0,500)
      }).eq('id',generation.id)
    }
    return{statusCode:500}
  }
}
