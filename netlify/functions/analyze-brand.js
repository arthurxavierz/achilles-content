import { assertSpendCeiling, dispatchAutofill, json, loadCatalog, loadSettings, method, priceOf, rateLimit, requireUser, safeError } from './_shared.js'

// Abre a análise das imagens de referência e devolve na hora.
//
// O trabalho mora em analyze-brand-background porque ler quatro imagens e
// devolver vinte e dois campos estruturados passa dos dez segundos que a
// Netlify dá a uma função síncrona. Foi esse limite que derrubou a copy no
// V18, e aqui o estrago seria o mesmo: crédito debitado numa resposta que o
// cliente nunca recebe.
//
// Esta função não cobra nada. Quem cobra é o worker, e só depois de ter um
// resultado válido na mão.
export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'analyze-brand',3)
    await assertSpendCeiling(auth.service)

    const catalog=await loadCatalog(auth.service)
    const cost=priceOf(catalog,'brand_analysis').credits
    const saldo=(auth.profile.credits_plan||0)+(auth.profile.credits_extra||0)
    if(saldo<cost)throw Object.assign(new Error(`Faltam ${cost-saldo} créditos para analisar as imagens.`),{statusCode:402})

    // Quantas imagens entram é ajuste de operação, não do cliente: é o que
    // governa o custo na OpenAI. Teto de 6 porque é o que o Brand Brain
    // aceita guardar.
    const settings=await loadSettings(auth.service)
    const limite=Math.min(6,Math.max(1,Number(settings.brand_autofill_images||4)||4))

    const {count}=await auth.service.from('brand_reference_images')
      .select('id',{count:'exact',head:true}).eq('user_id',auth.user.id)
    if(!count)throw Object.assign(new Error('Envie ao menos uma imagem de referência antes de analisar.'),{statusCode:400})

    // Análise em andamento não abre outra: o cliente clicaria duas vezes e
    // pagaria duas.
    const {data:aberto}=await auth.service.from('brand_autofill_jobs')
      .select('id,status').eq('user_id',auth.user.id).in('status',['queued','running'])
      .order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(aberto) return json(202,{job_id:aberto.id,status:aberto.status,reused:true})

    const {data:job,error}=await auth.service.from('brand_autofill_jobs')
      .insert({user_id:auth.user.id,status:'queued',images_used:Math.min(limite,count)})
      .select('id').single()
    if(error)throw error

    await dispatchAutofill(job.id)
    return json(202,{job_id:job.id,status:'queued',cost,images:Math.min(limite,count)})
  }catch(error){return safeError(error)}
}
