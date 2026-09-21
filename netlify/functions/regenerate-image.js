import { assertSpendCeiling,body,dispatchJob,imageModelOf,imageSlug,integer,json,loadCatalog,loadSettings,method,priceOf,rateLimit,requireUser,safeError,text } from './_shared.js'

export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'regenerate-image',10)
    await assertSpendCeiling(auth.service)

    const input=await body(event)
    const id=text(input.generation_id,80,true)
    const position=integer(input.position,1,20)
    const quality=input.quality==='signature'?'signature':'standard'

    const {data:g}=await auth.service.from('generations').select('*').eq('id',id).eq('user_id',auth.user.id).single()
    if(!g||g.status!=='images_ready')throw Object.assign(new Error('Geração não disponível'),{statusCode:409})

    const catalog=await loadCatalog(auth.service)
    const settings=await loadSettings(auth.service)
    const item=priceOf(catalog,imageSlug(quality))
    const model=imageModelOf(item,settings)

    const {data:spent}=await auth.service.rpc('spend_credits',{p_user_id:auth.user.id,p_amount:item.credits,p_reason:`Regeneração da imagem ${position}`,p_reference_id:g.id})
    if(!spent?.ok)throw Object.assign(new Error('Saldo insuficiente'),{statusCode:402})

    // start_index marca onde a regeneracao comeca. O estorno por falha usa
    // essa janela para devolver so o que foi cobrado agora.
    const {data:job,error}=await auth.service.from('generation_jobs').upsert({generation_id:g.id,status:'queued',attempts:0,start_index:position-1,done_count:position-1,total_count:position,image_quality:item.image_quality,openai_model:model,render_text:!!g.render_text,credits_each:item.credits,charged_plan:spent.spent_plan||0,charged_extra:spent.spent_extra||0,last_error:null,finished_at:null,updated_at:new Date().toISOString()},{onConflict:'generation_id'}).select('id').single()
    if(error)throw error

    await auth.service.from('generations').update({status:'processing'}).eq('id',g.id)
    await dispatchJob(job.id)
    return json(202,{job_id:job.id,credits_spent:item.credits})
  }catch(error){return safeError(error)}
}
