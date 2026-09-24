import { CAROUSEL_MAX,FORMATS,assertSpendCeiling,body,copySlug,dispatchCopy,imageCount,integer,json,loadCatalog,method,priceOf,rateLimit,requireUser,safeError,text } from './_shared.js'

// Esta função só cobra, registra e despacha. O trabalho com a OpenAI mora
// em generate-copy-background, porque função síncrona da Netlify é morta em
// torno de dez segundos: a copy estourava esse limite, o crédito já tinha
// saído e o estorno, que vivia no catch, nunca chegava a rodar.
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
    // Carrossel de tamanho escolhido: a copy gera um slide por arte.
    const count=imageCount(format,format==='carousel'?integer(input.image_count??CAROUSEL_MAX,1,CAROUSEL_MAX):1)

    // Clique repetido não cobra duas vezes: a mesma chave devolve a mesma
    // geração, em qualquer estado em que ela esteja.
    const {data:existing}=await auth.service.from('generations')
      .select('id,copy_json,status').eq('user_id',auth.user.id).eq('request_id',requestId).maybeSingle()
    if(existing) return json(202,{generation_id:existing.id,status:existing.status,copy:existing.copy_json||null,reused:true})

    const catalog=await loadCatalog(auth.service)
    const cost=priceOf(catalog,copySlug(format)).credits

    const {data:g,error:gerr}=await auth.service.from('generations').insert({
      user_id:auth.user.id,format,theme,status:'draft',
      copy_cost:cost,image_count:count,request_id:requestId
    }).select('id').single()
    if(gerr)throw gerr

    const {data:spent,error:serr}=await auth.service.rpc('spend_credits',{p_user_id:auth.user.id,p_amount:cost,p_reason:`Copy ${format}`,p_reference_id:g.id})
    if(serr)throw serr
    if(!spent?.ok){
      await auth.service.from('generations').delete().eq('id',g.id)
      throw Object.assign(new Error('Saldo insuficiente'),{statusCode:402})
    }

    // Guarda a divisão da cobrança: o estorno devolve a cada saldo o que
    // saiu dele, em vez de adivinhar plano contra avulso.
    await auth.service.from('generations').update({
      status:'copy_queued',
      copy_charged_plan:spent.spent_plan||0,
      copy_charged_extra:spent.spent_extra||0
    }).eq('id',g.id)

    await dispatchCopy(g.id)
    return json(202,{generation_id:g.id,status:'copy_queued',credits_spent:cost})
  }catch(error){return safeError(error)}
}
