import { audit,body,json,method,requireAdmin,safeError,text } from './_shared.js'

const MODES=['payment','manual','preapproval']

// Define quem responde pelo pagamento do proximo ciclo.
// 'manual' renova sozinho no cron. 'payment' exige um pagamento aprovado novo.
export async function handler(event){
  try{
    method(event)
    const auth=await requireAdmin(event)
    const input=await body(event)
    const id=text(input.user_id,80,true)
    if(!MODES.includes(input.renewal_mode))throw Object.assign(new Error('Modo de renovação inválido'),{statusCode:400})

    const {data:sub}=await auth.service.from('subscriptions').select('id')
      .eq('user_id',id).in('status',['active','trialing','past_due']).maybeSingle()
    if(!sub)throw Object.assign(new Error('Assinatura não encontrada'),{statusCode:404})

    const {error}=await auth.service.from('subscriptions').update({renewal_mode:input.renewal_mode,updated_at:new Date().toISOString()}).eq('id',sub.id)
    if(error)throw error
    await audit(auth.service,auth.user.id,id,'renewal_mode_changed',{renewal_mode:input.renewal_mode})
    return json(200,{ok:true})
  }catch(error){ return safeError(error) }
}
