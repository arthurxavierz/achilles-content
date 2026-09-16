import { json,loadCatalog,method,requireUser,safeError } from './_shared.js'

export async function handler(event){
  try{
    method(event,['GET'])
    const auth=await requireUser(event)
    const [{data:subscription},{data:plans},{data:packs},{data:recent},{data:pending},catalog]=await Promise.all([
      auth.service.from('subscriptions').select('*,plan:plans!subscriptions_plan_id_fkey(*),next_plan:plans!subscriptions_next_plan_id_fkey(*)').eq('user_id',auth.user.id).in('status',['active','trialing','past_due']).maybeSingle(),
      auth.service.from('plans').select('*').eq('active',true).order('sort_order'),
      auth.service.from('credit_packs').select('*').eq('active',true).order('sort_order'),
      auth.service.from('credit_ledger').select('*').eq('user_id',auth.user.id).order('created_at',{ascending:false}).limit(50),
      auth.service.from('payments').select('id,kind,amount_cents,credits,created_at,expires_at,plan:plans(name),pack:credit_packs(name)').eq('user_id',auth.user.id).eq('status','pending').order('created_at',{ascending:false}).limit(5),
      loadCatalog(auth.service)
    ])
    return json(200,{
      subscription,plans:plans||[],packs:packs||[],recent:recent||[],pending:pending||[],
      pricing:catalog.pricing,
      presets:catalog.presets.map(({slug,name,summary})=>({slug,name,summary}))
    })
  }catch(error){return safeError(error)}
}
