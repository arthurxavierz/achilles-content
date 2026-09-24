import { assertSpendCeiling,body,copySlug,dispatchCopy,json,loadCatalog,method,priceOf,rateLimit,requireUser,safeError,text } from './_shared.js'

// Refaz a copy da mesma geração, cobrando de novo. É trabalho novo do
// modelo, então é cobrança nova — mas a arte não é tocada, e o cliente não
// perde o formato, o preset nem a contagem que já tinha escolhido.
export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'regenerate-copy',6)
    await assertSpendCeiling(auth.service)

    const input=await body(event)
    const id=text(input.generation_id,80,true)

    const {data:g}=await auth.service.from('generations').select('*').eq('id',id).eq('user_id',auth.user.id).single()
    if(!g)throw Object.assign(new Error('Geração não encontrada'),{statusCode:404})
    if(g.copy_source==='manual')throw Object.assign(new Error('Esta copy foi escrita por você. Edite o texto direto no estúdio.'),{statusCode:409})
    if(['processing','images_ready'].includes(g.status))throw Object.assign(new Error('As artes já foram geradas. Comece uma nova geração para trocar o texto.'),{statusCode:409})

    const catalog=await loadCatalog(auth.service)
    const cost=priceOf(catalog,copySlug(g.format)).credits

    const {data:spent,error}=await auth.service.rpc('spend_credits',{p_user_id:auth.user.id,p_amount:cost,p_reason:`Refazer copy ${g.format}`,p_reference_id:g.id})
    if(error)throw error
    if(!spent?.ok)throw Object.assign(new Error('Saldo insuficiente'),{statusCode:402})

    // Limpa a copy e libera o direito de estorno outra vez: a cobrança é
    // nova, então a falha desta tentativa tem que poder ser devolvida.
    await auth.service.from('generations').update({
      copy_json:null, status:'copy_queued', copy_error:null,
      copy_refunded_at:null,
      copy_charged_plan:spent.spent_plan||0,
      copy_charged_extra:spent.spent_extra||0,
      copy_cost:(g.copy_cost||0)+cost,
      copy_attempts:(g.copy_attempts||0)+1,
      approved_at:null
    }).eq('id',g.id)

    await dispatchCopy(g.id)
    return json(202,{generation_id:g.id,status:'copy_queued',credits_spent:cost})
  }catch(error){return safeError(error)}
}
