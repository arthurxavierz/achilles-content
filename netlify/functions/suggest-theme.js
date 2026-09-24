import { assertSpendCeiling,json,loadCatalog,loadSettings,method,openaiFetch,priceOf,rateLimit,requireUser,safeError } from './_shared.js'

// Propõe um tema de publicação lendo o Brand Brain.
//
// A cobrança acontece DEPOIS da resposta, de propósito: é uma operação
// curta e síncrona, e cobrar antes exigiria um caminho de estorno para
// algo que custa frações de centavo. Antes de chamar, confere se o saldo
// cobre, então ninguém gera de graça.
export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'suggest-theme',8)
    await assertSpendCeiling(auth.service)

    const catalog=await loadCatalog(auth.service)
    const cost=priceOf(catalog,'theme_suggestion').credits
    const saldo=(auth.profile.credits_plan||0)+(auth.profile.credits_extra||0)
    if(saldo<cost)throw Object.assign(new Error(`Faltam ${cost-saldo} créditos para sugerir um tema.`),{statusCode:402})

    const settings=await loadSettings(auth.service)
    const {data:brand}=await auth.service.from('brand_profiles').select('*').eq('user_id',auth.user.id).maybeSingle()

    // Evita repetir o que já foi publicado recentemente.
    const {data:recentes}=await auth.service.from('generations')
      .select('theme').eq('user_id',auth.user.id).order('created_at',{ascending:false}).limit(12)
    const jaFeitos=(recentes||[]).map(r=>r.theme).filter(Boolean).join(' / ')

    const prompt=`Proponha UM tema de publicação para a marca abaixo.

MARCA
Nome: ${brand?.brand_name||'não informado'}
Segmento: ${brand?.segment||'não informado'}
Público: ${brand?.audience||'não informado'}
Serviços: ${brand?.services||'não informado'}
Diferenciais: ${brand?.differentiators||'não informado'}
CTA padrão: ${brand?.default_cta||'não informado'}
Guardrails: ${brand?.guardrails||'nenhum'}

TEMAS JÁ USADOS, NÃO REPITA
${jaFeitos||'nenhum'}

Responda em uma única frase curta, no imperativo, descrevendo o tema e o objetivo.
Não escreva a copy, não escreva headline, não use aspas nem markdown.
Exemplo do formato esperado: post sobre preparação para o vestibular com CTA final para a matrícula.`

    const raw=await openaiFetch('https://api.openai.com/v1/responses',
      {method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},
       body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL,input:prompt})},
      {label:'sugestão de tema',timeoutMs:Math.min(20000,Number(settings.openai_text_timeout_ms||20000)),retries:0})

    const saida=raw.output_text||raw.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text
    const tema=String(saida||'').replace(/\s+/g,' ').replace(/^["'\s]+|["'\s.]+$/g,'').trim()
    if(!tema)throw Object.assign(new Error('Não foi possível sugerir um tema agora.'),{statusCode:502})

    const {data:spent}=await auth.service.rpc('spend_credits',{p_user_id:auth.user.id,p_amount:cost,p_reason:'Sugestão de tema'})
    if(!spent?.ok)throw Object.assign(new Error('Saldo insuficiente'),{statusCode:402})

    return json(200,{theme:tema,credits_spent:cost})
  }catch(error){return safeError(error)}
}
