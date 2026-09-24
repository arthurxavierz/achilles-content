import { assertSpendCeiling,body,boolean,dispatchJob,imageCount,imageModelOf,imageSlug,json,loadCatalog,loadSettings,method,priceOf,rateLimit,requireUser,safeError,text } from './_shared.js'

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
    if(!g)throw Object.assign(new Error('Geração não encontrada'),{statusCode:404})

    const {data:old}=await auth.service.from('generation_jobs').select('*').eq('generation_id',g.id).maybeSingle()

    // Job em andamento ou concluido: devolve o mesmo, sem cobrar de novo.
    if(old && old.status!=='failed') return json(202,{job_id:old.id,reused:true})

    // Job falho e retentativa do cliente. Os creditos das pecas nao
    // entregues ja foram estornados, entao esta e uma cobranca nova e
    // legitima. Sem isso a geracao virava beco sem saida: o endpoint
    // devolvia o job falho para sempre e o cliente tinha que refazer a
    // copy, pagando por ela outra vez.
    const retry = !!old
    if(!retry && g.status!=='copy_approved')throw Object.assign(new Error('A copy precisa estar aprovada'),{statusCode:409})
    if(retry && !g.copy_json)throw Object.assign(new Error('Esta geração não tem copy para refazer'),{statusCode:409})

    const catalog=await loadCatalog(auth.service)
    const settings=await loadSettings(auth.service)
    const item=priceOf(catalog,imageSlug(quality))
    // O modelo vem da faixa de preco: Padrao e Assinatura usam motores diferentes.
    const model=imageModelOf(item,settings)
    // A contagem vem da geracao, decidida quando a copy foi criada.
    const count=imageCount(g.format,g.image_count)
    const each=item.credits
    const cost=each*count

    // O preset vem do estudio; se vier vazio, cai no preset da marca.
    const requested=text(input.preset_slug,60)
    const {data:brand}=await auth.service.from('brand_profiles').select('preset_slug,render_text').eq('user_id',auth.user.id).maybeSingle()
    // O estudio manda a escolha da geracao; sem ela, vale o padrao da marca.
    const renderText=boolean(input.render_text,!!brand?.render_text)
    const preset=catalog.presetsBySlug[requested]?requested:(catalog.presetsBySlug[brand?.preset_slug]?brand.preset_slug:catalog.presets[0]?.slug)

    const {data:spent,error}=await auth.service.rpc('spend_credits',{p_user_id:auth.user.id,p_amount:cost,p_reason:`${item.label} · ${g.format}`,p_reference_id:g.id})
    if(error)throw error
    if(!spent?.ok)throw Object.assign(new Error('Saldo insuficiente'),{statusCode:402})

    // Na retentativa o job e reaproveitado e zerado, inclusive a marca de
    // estorno: a cobranca e nova, entao o direito de estornar volta a valer.
    const jobRow={
      generation_id:g.id,total_count:count,image_quality:item.image_quality,openai_model:model,
      render_text:renderText,credits_each:each,
      charged_plan:spent.spent_plan||0,charged_extra:spent.spent_extra||0,
      status:'queued',attempts:0,done_count:0,start_index:0,
      last_error:null,error_detail:null,refunded_at:null,refunded_credits:0,
      started_at:null,finished_at:null,updated_at:new Date().toISOString()
    }
    const {data:job,error:jerr}=await auth.service.from('generation_jobs')
      .upsert(jobRow,{onConflict:'generation_id'}).select('id').single()
    if(jerr){
      await auth.service.rpc('refund_credits',{p_user_id:auth.user.id,p_plan:spent.spent_plan||0,p_extra:spent.spent_extra||0,p_reason:'Estorno por falha ao criar job',p_reference_id:g.id})
      throw jerr
    }

    // A direcao de arte anterior e descartada na retentativa: se ela foi a
    // causa da falha, repetir a mesma nao ajuda.
    await auth.service.from('generations').update({status:'processing',image_cost:cost,...(retry?{art_direction:null}:{}),image_quality:item.image_quality,openai_model:model,preset_slug:preset,render_text:renderText}).eq('id',g.id)

    await dispatchJob(job.id)
    return json(202,{job_id:job.id,credits_spent:cost,retry})
  }catch(error){return safeError(error)}
}
