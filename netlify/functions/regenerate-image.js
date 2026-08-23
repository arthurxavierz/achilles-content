import { body,dispatchJob,IMAGE_CREDITS_EACH,imageCount,integer,json,method,rateLimit,requireUser,safeError,text } from './_shared.js'

// Refaz uma unica peca de uma geracao ja concluida.
export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'regenerate-image',10)
    const input=await body(event)
    const id=text(input.generation_id,80,true)

    const {data:g}=await auth.service.from('generations').select('*').eq('id',id).eq('user_id',auth.user.id).single()
    if(!g)throw Object.assign(new Error('Geração não encontrada'),{statusCode:404})
    if(g.status!=='images_ready')throw Object.assign(new Error('Geração não disponível para regeneração'),{statusCode:409})

    const total=imageCount(g.format)
    const position=integer(input.position,1,total)

    const {data:running}=await auth.service.from('generation_jobs').select('id,status').eq('generation_id',g.id).maybeSingle()
    if(running&&['queued','processing'].includes(running.status)){
      throw Object.assign(new Error('Já existe uma geração em andamento para esta peça'),{statusCode:409})
    }

    const {data:spent,error:spendError}=await auth.service.rpc('spend_credits',{p_user_id:auth.user.id,p_amount:IMAGE_CREDITS_EACH,p_reason:`Regeneração da imagem ${position}`,p_reference_id:g.id})
    if(spendError)throw spendError
    if(!spent?.ok)throw Object.assign(new Error('Saldo insuficiente'),{statusCode:402})

    // start_index e done_count marcam o inicio; total_count marca o fim.
    // O worker produz apenas o indice desta posicao.
    const {data:job,error}=await auth.service.from('generation_jobs').upsert({
      generation_id:g.id,status:'queued',attempts:0,
      start_index:position-1,done_count:position-1,total_count:position,
      charged_plan:spent.spent_plan||0,charged_extra:spent.spent_extra||0,
      last_error:null,started_at:null,finished_at:null,updated_at:new Date().toISOString()
    },{onConflict:'generation_id'}).select('id').single()
    if(error){
      await auth.service.rpc('refund_credits',{p_user_id:auth.user.id,p_plan:spent.spent_plan||0,p_extra:spent.spent_extra||0,p_reason:'Estorno por falha ao criar job de regeneração',p_reference_id:g.id})
      throw error
    }

    await auth.service.from('generations').update({status:'processing',image_cost:(g.image_cost||0)+IMAGE_CREDITS_EACH}).eq('id',g.id)
    await dispatchJob(job.id)
    return json(202,{job_id:job.id})
  }catch(error){ return safeError(error) }
}
