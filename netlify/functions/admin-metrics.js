import { json,method,requireAdmin,safeError } from './_shared.js'

const USD_BRL = () => Number(process.env.USD_BRL_RATE || 5.6)

export async function handler(event){
  try{
    method(event,['GET'])
    const auth=await requireAdmin(event)
    const month=new Date(); month.setUTCDate(1); month.setUTCHours(0,0,0,0)
    const iso=month.toISOString()

    const [{count:active},{data:subs},{data:profiles},{data:ledger},{data:latest},{data:generations},{data:paid},{count:pending}]=await Promise.all([
      auth.service.from('profiles').select('*',{count:'exact',head:true}).eq('role','client').eq('active',true),
      auth.service.from('subscriptions').select('plan:plans!subscriptions_plan_id_fkey(price_cents)').eq('status','active'),
      auth.service.from('profiles').select('credits').eq('role','client'),
      auth.service.from('credit_ledger').select('amount').eq('kind','consumption').gte('created_at',iso),
      auth.service.from('generations').select('id,theme,format,status,created_at,user_id,cost_usd').order('created_at',{ascending:false}).limit(10),
      auth.service.from('generations').select('cost_usd').gte('created_at',iso),
      auth.service.from('payments').select('amount_cents').eq('status','approved').gte('paid_at',iso),
      auth.service.from('payments').select('*',{count:'exact',head:true}).eq('status','pending')
    ])

    const mrr=(subs||[]).reduce((s,x)=>s+(x.plan?.price_cents||0),0)
    const circ=(profiles||[]).reduce((s,x)=>s+(x.credits||0),0)
    const used=Math.abs((ledger||[]).reduce((s,x)=>s+(x.amount||0),0))

    // Margem do mes: o que entrou de verdade contra o que a OpenAI cobrou.
    const costUsd=(generations||[]).reduce((s,x)=>s+Number(x.cost_usd||0),0)
    const costCents=Math.round(costUsd*USD_BRL()*100)
    const revenueCents=(paid||[]).reduce((s,x)=>s+(x.amount_cents||0),0)
    const marginPct=revenueCents>0?Math.round(((revenueCents-costCents)/revenueCents)*100):null

    return json(200,{
      active_clients:active||0,
      mrr_cents:mrr,
      credits_circulation:circ,
      credits_used_month:used,
      revenue_month_cents:revenueCents,
      api_cost_month_usd:Number(costUsd.toFixed(4)),
      api_cost_month_cents:costCents,
      margin_pct:marginPct,
      pending_payments:pending||0,
      usd_brl:USD_BRL(),
      latest:latest||[]
    })
  }catch(error){return safeError(error)}
}
