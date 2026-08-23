import { json,method,requireAdmin,safeError } from './_shared.js'

export async function handler(event){
  try{
    method(event,['GET'])
    const auth=await requireAdmin(event)
    const [{data:profiles,error},{data:subs}]=await Promise.all([
      auth.service.from('profiles').select('id,full_name,email,active,credits,credits_plan,credits_extra,created_at').eq('role','client').order('created_at',{ascending:false}),
      auth.service.from('subscriptions').select('user_id,status,renewal_mode,current_period_end,plan:plans!subscriptions_plan_id_fkey(name,slug,price_cents)').in('status',['active','trialing','past_due'])
    ])
    if(error)throw error
    const byUser=new Map((subs||[]).map(s=>[s.user_id,s]))
    const clients=(profiles||[]).map(p=>{
      const sub=byUser.get(p.id)
      return{...p,
        plan_name:sub?.plan?.name||null,
        plan_slug:sub?.plan?.slug||null,
        subscription_status:sub?.status||null,
        renewal_mode:sub?.renewal_mode||null,
        current_period_end:sub?.current_period_end||null}
    })
    return json(200,{clients})
  }catch(error){ return safeError(error) }
}
