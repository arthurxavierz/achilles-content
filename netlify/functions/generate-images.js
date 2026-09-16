import { assertSpendCeiling,body,dispatchJob,imageCount,imageSlug,json,loadCatalog,method,priceOf,rateLimit,requireUser,safeError,text } from './_shared.js'

export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'generate-images',10)
    await assertSpendCeiling(auth.service)

    const input=await body(event)
    const generationId=text(input.generation_id,80,true)
    const quality=input.quality==='signature'?'signature':'standard'

    const {data:g}=await auth.service.from('generations').select('*').eq('id',generationId).eq('user_id',auth.user.id).single()
    if(!g||g.status!=='copy_approved')throw Object.assign(new Error('A copy precisa estar aprovada'),{statusCode:409})

    const {data:old}=await auth.service.from('generation_jobs').select('*').eq('generation_id',g.id).maybeSingle()
    if(old)return json(202,{job_id:old.id,reused:true})

    const catalog=await loadCatalog(auth.service)
    const item=priceOf(catalog,imageSlug(quality))
    const count=imageCount(g.format)
    const each=item.credits
    const cost=each*count

    // O preset vem do estudio; se vier vazio, cai no preset da marca.
    const requested=text(input.preset_slug,60)
    const {data:brand}=await auth.service.from('brand_profiles').select('preset_slug').eq('user_id',auth.user.id).maybeSingle()
    const preset=catalog.presetsBySlug[requested]?requested:(catalog.presetsBySlug[brand?.preset_slug]?brand.preset_slug:catalog.presets[0]?.slug)

    const {data:spent,error}=await auth.service.rpc('spend_credits',{p_user_id:auth.user.id,p_amount:cost,p_reason:`${item.label} · ${g.format}`,p_reference_id:g.id})
    if(error)throw error
    if(!spent?.ok)throw Object.assign(new Error('Saldo insuficiente'),{statusCode:402})

    const {data:job,error:jerr}=await auth.service.from('generation_jobs').insert({generation_id:g.id,total_count:count,image_quality:item.image_quality,credits_each:each,charged_plan:spent.spent_plan||0,charged_extra:spent.spent_extra||0}).select('id').single()
    if(jerr){
      await auth.service.rpc('refund_credits',{p_user_id:auth.user.id,p_plan:spent.spent_plan||0,p_extra:spent.spent_extra||0,p_reason:'Estorno por falha ao criar job',p_reference_id:g.id})
      throw jerr
    }

    await auth.service.from('generations').update({status:'processing',image_cost:cost,image_quality:item.image_quality,preset_slug:preset}).eq('id',g.id)

    await dispatchJob(job.id)
    return json(202,{job_id:job.id,credits_spent:cost})
  }catch(error){return safeError(error)}
}
