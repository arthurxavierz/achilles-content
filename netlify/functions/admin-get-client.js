import { json,method,requireAdmin,safeError,text } from './_shared.js'

export async function handler(event){
  try{
    method(event,['GET'])
    const auth=await requireAdmin(event)
    const id=text(event.queryStringParameters?.user_id,80,true)

    const [{data:profile},{data:brand},{data:history},{data:ledger},{data:subscription},{data:payments}]=await Promise.all([
      auth.service.from('profiles').select('*').eq('id',id).single(),
      auth.service.from('brand_profiles').select('*').eq('user_id',id).maybeSingle(),
      auth.service.from('generations').select('*').eq('user_id',id).order('created_at',{ascending:false}).limit(100),
      auth.service.from('credit_ledger').select('*').eq('user_id',id).order('created_at',{ascending:false}).limit(100),
      auth.service.from('subscriptions').select('*,plan:plans!subscriptions_plan_id_fkey(*),next_plan:plans!subscriptions_next_plan_id_fkey(*)').eq('user_id',id).in('status',['active','trialing','past_due']).maybeSingle(),
      auth.service.from('payments').select('id,kind,status,amount_cents,credits,created_at,paid_at').eq('user_id',id).order('created_at',{ascending:false}).limit(20)
    ])
    if(!profile)throw Object.assign(new Error('Cliente não encontrado'),{statusCode:404})

    return json(200,{profile,brand,history:history||[],ledger:ledger||[],subscription,payments:payments||[]})
  }catch(error){ return safeError(error) }
}
