import { body,boolean,json,method,rateLimit,requireUser,safeError,text } from './_shared.js'

// Arquiva ou desarquiva uma geração. Serve para o cliente parar numa copy e
// guardar, sem que ela fique para sempre no meio das entregas em andamento.
// Nada é apagado: arquivar não devolve crédito e não perde o texto.
export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'archive-generation',30)

    const input=await body(event)
    const id=text(input.generation_id,80,true)
    const arquivar=boolean(input.archived,true)

    const {data,error}=await auth.service.from('generations')
      .update({archived_at:arquivar?new Date().toISOString():null})
      .eq('id',id).eq('user_id',auth.user.id).select('id,archived_at').maybeSingle()
    if(error)throw error
    if(!data)throw Object.assign(new Error('Geração não encontrada'),{statusCode:404})

    return json(200,{ok:true,archived:!!data.archived_at})
  }catch(error){return safeError(error)}
}
