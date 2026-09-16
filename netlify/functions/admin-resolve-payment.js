import { audit,body,json,method,requireAdmin,safeError,text } from './_shared.js'
import { applyApprovedPayment } from './_billing.js'

// Conciliacao manual do PIX. O admin confere o extrato e libera aqui.
// Usa o mesmo caminho do webhook para que os dois nao divirjam.
export async function handler(event){
  try{
    method(event)
    const auth=await requireAdmin(event)
    const input=await body(event)
    const id=text(input.payment_id,80,true)
    const decision=input.status==='rejected'?'rejected':'approved'
    const note=text(input.note,300)

    const {data:p}=await auth.service.from('payments').select('*').eq('id',id).eq('status','pending').single()
    if(!p)throw Object.assign(new Error('Pagamento não encontrado ou já resolvido'),{statusCode:404})

    if(decision==='rejected'){
      await auth.service.from('payments').update({status:'rejected',note,raw_payload:{manual:true,admin_id:auth.user.id}}).eq('id',id)
      await audit(auth.service,auth.user.id,p.user_id,'manual_payment_rejected',{payment_id:id,note})
      return json(200,{ok:true,status:'rejected'})
    }

    // Marca primeiro e so entao concede. Se dois admins clicarem junto,
    // apenas um encontra a linha ainda pendente.
    const {data:claimed}=await auth.service.from('payments')
      .update({status:'approved',paid_at:new Date().toISOString(),note,raw_payload:{manual:true,admin_id:auth.user.id}})
      .eq('id',id).eq('status','pending').select('*').maybeSingle()
    if(!claimed)throw Object.assign(new Error('Pagamento já resolvido'),{statusCode:409})

    const applied=await applyApprovedPayment(auth.service,claimed,auth.user.id)
    await audit(auth.service,auth.user.id,p.user_id,'manual_payment_approved',{payment_id:id,...applied})
    return json(200,{ok:true,status:'approved',...applied})
  }catch(error){return safeError(error)}
}
