import { body,dispatchJob,IMAGE_CREDITS_EACH,imageCount,json,method,rateLimit,requireUser,safeError,text } from './_shared.js'

// Cria o job de imagens ou retoma um job que falhou.
// Regra de cobranca: paga-se apenas pelas imagens que ainda faltam produzir.
export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'generate-images',10)
    const input=await body(event)
    const generationId=text(input.generation_id,80,true)

    const {data:g}=await auth.service.from('generations').select('*').eq('id',generationId).eq('user_id',auth.user.id).single()
    if(!g)throw Object.assign(new Error('Geração não encontrada'),{statusCode:404})

    const total=imageCount(g.format)
    const {data:existing}=await auth.service.from('generation_jobs').select('*').eq('generation_id',g.id).maybeSingle()

    // Job em andamento ou concluido. Nada a cobrar.
    if(existing&&existing.status!=='failed'){
      return json(202,{job_id:existing.id,reused:true,status:existing.status})
    }

    // Primeira execucao exige copy aprovada. Retomada exige um job que falhou.
    if(!existing&&g.status!=='copy_approved'){
      throw Object.assign(new Error('A copy precisa estar aprovada'),{statusCode:409})
    }

    const startIndex=existing?Math.max(existing.done_count||0,existing.start_index||0):0
    const remaining=total-startIndex
    if(remaining<=0){
      await auth.service.from('generations').update({status:'images_ready'}).eq('id',g.id)
      return json(200,{job_id:existing?.id||null,status:'done'})
    }

    const cost=remaining*IMAGE_CREDITS_EACH
    const {data:spent,error:spendError}=await auth.service.rpc('spend_credits',{p_user_id:auth.user.id,p_amount:cost,p_reason:`Imagens ${g.format}`,p_reference_id:g.id})
    if(spendError)throw spendError
    if(!spent?.ok)throw Object.assign(new Error('Saldo insuficiente'),{statusCode:402})

    const jobPayload={generation_id:g.id,status:'queued',attempts:0,start_index:startIndex,done_count:startIndex,total_count:total,charged_plan:spent.spent_plan||0,charged_extra:spent.spent_extra||0,last_error:null,started_at:null,finished_at:null,updated_at:new Date().toISOString()}
    const {data:job,error:jobError}=await auth.service.from('generation_jobs').upsert(jobPayload,{onConflict:'generation_id'}).select('id').single()
    if(jobError){
      await auth.service.rpc('refund_credits',{p_user_id:auth.user.id,p_plan:spent.spent_plan||0,p_extra:spent.spent_extra||0,p_reason:'Estorno por falha ao criar job',p_reference_id:g.id})
      throw jobError
    }

    await auth.service.from('generations').update({status:'processing',image_cost:(g.image_cost||0)+cost}).eq('id',g.id)
    await dispatchJob(job.id)
    return json(202,{job_id:job.id,retried:Boolean(existing)})
  }catch(error){ return safeError(error) }
}
