const CYCLE_DAYS=30

// Aplica um pagamento aprovado. Usado pelo webhook do Mercado Pago e pela
// confirmacao manual do painel, para que os dois caminhos tenham o mesmo efeito.
// Nao faz upsert em subscriptions: o indice unico e parcial e ON CONFLICT nao o alcanca.
export async function applyApprovedPayment(svc,payment,adminId=null){
  if(payment.kind==='credit_pack'){
    await svc.rpc('grant_credits',{
      p_user_id:payment.user_id,p_amount:payment.credits,
      p_reason:adminId?'Créditos avulsos confirmados manualmente':'Compra de créditos avulsos',
      p_admin_id:adminId,p_bucket:'extra',p_kind:'purchase',p_reference_id:payment.id
    })
    return{applied:'credit_pack',credits:payment.credits}
  }

  const {data:plan,error:planError}=await svc.from('plans').select('*').eq('id',payment.plan_id).single()
  if(planError||!plan)throw new Error('Plano do pagamento não encontrado')

  const now=new Date()
  const periodEnd=new Date(now.getTime()+CYCLE_DAYS*86400000)
  const {data:sub}=await svc.from('subscriptions').select('id')
    .eq('user_id',payment.user_id).in('status',['active','trialing','past_due']).maybeSingle()

  if(sub){
    await svc.from('subscriptions').update({
      plan_id:plan.id,status:'active',renewal_mode:'payment',
      current_period_start:now.toISOString(),current_period_end:periodEnd.toISOString(),
      next_plan_id:null,last_renewed_at:now.toISOString(),updated_at:now.toISOString()
    }).eq('id',sub.id)
  }else{
    await svc.from('subscriptions').insert({
      user_id:payment.user_id,plan_id:plan.id,status:'active',renewal_mode:'payment',
      current_period_start:now.toISOString(),current_period_end:periodEnd.toISOString(),
      last_renewed_at:now.toISOString()
    })
  }

  // O saldo do plano nao acumula entre ciclos. O restante expira e o novo valor entra.
  await svc.rpc('set_plan_credits',{
    p_user_id:payment.user_id,p_amount:plan.monthly_credits,
    p_reason:adminId?'Plano confirmado manualmente':'Créditos do plano contratado',
    p_reference_id:payment.id
  })
  return{applied:'plan',plan_slug:plan.slug,credits:plan.monthly_credits}
}
