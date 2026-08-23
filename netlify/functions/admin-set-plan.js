import { audit,body,json,method,requireAdmin,safeError,text } from './_shared.js'

const MODES=['payment','manual','preapproval']

export async function handler(event){
  try{
    method(event)
    const auth=await requireAdmin(event)
    const input=await body(event)
    const id=text(input.user_id,80,true)
    const slug=text(input.plan_slug,80,true)
    const mode=MODES.includes(input.renewal_mode)?input.renewal_mode:null
    const applyCredits=input.apply_credits===true

    const {data:plan}=await auth.service.from('plans').select('*').eq('slug',slug).single()
    if(!plan)throw Object.assign(new Error('Plano não encontrado'),{statusCode:404})

    const {data:sub}=await auth.service.from('subscriptions').select('*')
      .eq('user_id',id).in('status',['active','trialing','past_due']).maybeSingle()

    if(sub){
      const patch={plan_id:plan.id,next_plan_id:null,status:'active',updated_at:new Date().toISOString()}
      if(mode)patch.renewal_mode=mode
      await auth.service.from('subscriptions').update(patch).eq('id',sub.id)
    }else{
      await auth.service.from('subscriptions').insert({user_id:id,plan_id:plan.id,status:'active',renewal_mode:mode||'manual'})
    }

    // Trocar o plano nao mexe no saldo por padrao. O admin pede isso de forma explicita.
    if(applyCredits){
      await auth.service.rpc('set_plan_credits',{p_user_id:id,p_amount:plan.monthly_credits,p_reason:`Plano ${plan.name} aplicado pelo suporte`})
    }

    await audit(auth.service,auth.user.id,id,'plan_changed',{plan_slug:slug,renewal_mode:mode,apply_credits:applyCredits})
    return json(200,{ok:true})
  }catch(error){ return safeError(error) }
}
