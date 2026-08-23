import { body,integer,json,method,rateLimit,requireUser,safeError } from './_shared.js'

export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'request-credits',3)
    const input=await body(event)
    const amount=integer(input.amount,1,10000)

    // Uma solicitacao aberta por vez. Evita fila duplicada no painel.
    const {data:open}=await auth.service.from('credit_requests').select('id').eq('user_id',auth.user.id).eq('status','pending').maybeSingle()
    if(open)throw Object.assign(new Error('Você já tem uma solicitação em análise'),{statusCode:409})

    const {data,error}=await auth.service.from('credit_requests').insert({user_id:auth.user.id,amount,status:'pending'}).select('id').single()
    if(error)throw error
    return json(201,{request_id:data.id})
  }catch(error){ return safeError(error) }
}
