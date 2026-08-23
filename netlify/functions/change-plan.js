import { body,json,method,requireUser,safeError,text } from './_shared.js'

// Decide o caminho de troca de plano.
// Upgrade cobra agora (checkout). Downgrade entra no proximo ciclo, sem cobranca extra.
export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    const input=await body(event)
    const slug=text(input.plan_slug,80,true)

    const {data:newPlan}=await auth.service.from('plans').select('*').eq('slug',slug).eq('active',true).single()
    if(!newPlan)throw Object.assign(new Error('Plano não encontrado'),{statusCode:404})

    const {data:sub}=await auth.service.from('subscriptions').select('*,plan:plans!subscriptions_plan_id_fkey(*)')
      .eq('user_id',auth.user.id).in('status',['active','trialing','past_due']).maybeSingle()

    // Sem assinatura viva ou ciclo vencido: o caminho e contratar pelo checkout.
    if(!sub||sub.status==='past_due')return json(200,{mode:'checkout_required',plan_slug:slug})
    if(sub.plan_id===newPlan.id)throw Object.assign(new Error('Este já é o seu plano atual'),{statusCode:400})

    if(newPlan.price_cents<sub.plan.price_cents){
      await auth.service.from('subscriptions').update({next_plan_id:newPlan.id,updated_at:new Date().toISOString()}).eq('id',sub.id)
      return json(200,{mode:'scheduled_downgrade',plan_slug:slug,effective_at:sub.current_period_end})
    }
    return json(200,{mode:'checkout_required',plan_slug:slug})
  }catch(error){ return safeError(error) }
}
