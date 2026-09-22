import { FORMATS,assertSpendCeiling,body,copySlug,imageCount,json,loadCatalog,loadSettings,method,normalizeCopy,priceOf,rateLimit,requireUser,safeError,text,textCostUsd } from './_shared.js'

const schema={type:'object',additionalProperties:false,properties:{headline:{type:'string'},slides:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},subtitle:{type:'string'}},required:['title','subtitle']}},caption:{type:'string'},hashtags:{type:'array',maxItems:30,items:{type:'string'}}},required:['headline','slides','caption','hashtags']}

const field=(label,value)=>value?`${label}: ${value}`:null

// O estilo de escrita e sugestao da plataforma, nao lei. Se a marca
// escreveu as proprias regras, elas substituem o padrao por inteiro.
function buildPrompt({theme,format,brand,defaultStyle}){
  const style=String(brand?.copy_rules||'').trim() || defaultStyle || ''
  const slides=format==='carousel'?'exatamente 5 slides encadeados, cada um avançando o raciocínio do anterior':'exatamente 1 slide'
  const marca=[
    field('Marca',brand?.brand_name),
    field('Segmento',brand?.segment),
    field('Público',brand?.audience),
    field('Tom de voz',brand?.tone),
    field('Diferenciais',brand?.differentiators),
    field('Serviços',brand?.services),
    field('CTA padrão',brand?.default_cta),
    field('Briefing',brand?.briefing),
    field('Guardrails',brand?.guardrails),
    field('Termos proibidos',brand?.forbidden_terms)
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
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'generate-copy',10)
    await assertSpendCeiling(auth.service)

    const input=await body(event)
    const theme=text(input.theme,1200,true)
    const format=FORMATS.includes(input.format)?input.format:null
    if(!format)throw Object.assign(new Error('Formato inválido'),{statusCode:400})
    const requestId=text(input.idempotency_key,120,true)

    const {data:existing}=await auth.service.from('generations').select('id,copy_json,status').eq('user_id',auth.user.id).eq('request_id',requestId).maybeSingle()
    if(existing?.copy_json)return json(200,{generation_id:existing.id,copy:existing.copy_json,reused:true})

    const catalog=await loadCatalog(auth.service)
    const cost=priceOf(catalog,copySlug(format)).credits

    const {data:g,error:gerr}=await auth.service.from('generations').insert({user_id:auth.user.id,format,theme,status:'draft',copy_cost:cost,image_count:imageCount(format),request_id:requestId}).select('id').single()
    if(gerr)throw gerr

    const {data:spent,error:serr}=await auth.service.rpc('spend_credits',{p_user_id:auth.user.id,p_amount:cost,p_reason:`Copy ${format}`,p_reference_id:g.id})
    if(serr)throw serr
    if(!spent?.ok){await auth.service.from('generations').delete().eq('id',g.id);throw Object.assign(new Error('Saldo insuficiente'),{statusCode:402})}

    try{
      const {data:brand}=await auth.service.from('brand_profiles').select('*').eq('user_id',auth.user.id).maybeSingle()
      const settings=await loadSettings(auth.service)
      const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL,input:buildPrompt({theme,format,brand,defaultStyle:settings.copy_style_default}),text:{format:{type:'json_schema',name:'content_copy',strict:true,schema}}})})
      if(!res.ok)throw new Error(`OpenAI ${res.status}`)
      const raw=await res.json()
      const output=raw.output_text||raw.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text
      if(!output)throw new Error('Resposta vazia')
      // Normaliza antes de salvar: o titulo vem com quebra de linha e o
      // <input> do estudio apaga a quebra sem por espaco no lugar.
      const copy=normalizeCopy(JSON.parse(output))
      await auth.service.from('generations').update({copy_json:copy,status:'copy_ready'}).eq('id',g.id)
      await auth.service.rpc('add_generation_cost',{p_generation_id:g.id,p_cost:textCostUsd(raw.usage)})
      return json(200,{generation_id:g.id,copy})
    }catch(error){
      await auth.service.rpc('refund_credits',{p_user_id:auth.user.id,p_plan:Number(spent.spent_plan||0),p_extra:Number(spent.spent_extra||0),p_reason:'Estorno por falha na geração de copy',p_reference_id:g.id})
      await auth.service.from('generations').update({status:'failed'}).eq('id',g.id)
      throw error
    }
  }catch(error){return safeError(error)}
}
