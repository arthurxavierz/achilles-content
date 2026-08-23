import { service } from './_shared.js'

// Fecha os ciclos vencidos.
// renewal_mode 'manual' ou 'preapproval': alguem responde pelo pagamento, entao renova.
// renewal_mode 'payment': autoatendimento. Sem pagamento novo o ciclo expira e a
// assinatura vai para past_due. O saldo avulso do cliente nao e tocado.
export async function handler(){
  const svc=service()
  const {data:subs,error}=await svc.from('subscriptions')
    .select('id,user_id,renewal_mode')
    .in('status',['active','trialing'])
    .lte('current_period_end',new Date().toISOString())
    .limit(500)
  if(error){ console.error(error); return{statusCode:500,body:JSON.stringify({error:'query failed'})} }

  let renewed=0, expired=0, failed=0
  for(const s of subs||[]){
    try{
      const {data:ok,error:renewError}=await svc.rpc('renew_plan_credits',{p_subscription_id:s.id})
      if(renewError)throw renewError
      if(ok){ renewed++; continue }
      const {error:expireError}=await svc.rpc('expire_plan_cycle',{p_subscription_id:s.id})
      if(expireError)throw expireError
      expired++
    }catch(err){
      failed++
      console.error('renovação falhou',s.id,err)
    }
  }
  console.log(JSON.stringify({renewed,expired,failed,checked:(subs||[]).length}))
  return{statusCode:200,body:JSON.stringify({renewed,expired,failed})}
}
