import { audit,body,json,method,requireAdmin,safeError,text } from './_shared.js'
import { applyApprovedPayment } from './_billing.js'

export async function handler(event){
  try{
    method(event)
    const auth=await requireAdmin(event)
    const input=await body(event)
    const id=text(input.payment_id,80,true)

    // Sai de 'pending' de forma condicional para nao conflitar com o webhook.
    const {data:claimed}=await auth.service.from('payments')
      .update({status:'approved',paid_at:new Date().toISOString(),raw_payload:{manual:true,admin_id:auth.user.id}})
      .eq('id',id).eq('status','pending').select('*').maybeSingle()
    if(!claimed)throw Object.assign(new Error('Pagamento não encontrado ou já processado'),{statusCode:404})

    const result=await applyApprovedPayment(auth.service,claimed,auth.user.id)
    await audit(auth.service,auth.user.id,claimed.user_id,'manual_payment_approved',{payment_id:id,...result})
    return json(200,{ok:true,...result})
  }catch(error){ return safeError(error) }
}
