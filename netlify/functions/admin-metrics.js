import { json,method,requireAdmin,safeError } from './_shared.js'

export async function handler(event){
  try{
    method(event,['GET'])
    const auth=await requireAdmin(event)
    const month=new Date(); month.setUTCDate(1); month.setUTCHours(0,0,0,0)

    const [activeClients,subs,profiles,ledger,latest,pendingPayments,pendingRequests,failedJobs]=await Promise.all([
      auth.service.from('profiles').select('*',{count:'exact',head:true}).eq('role','client').eq('active',true),
      auth.service.from('subscriptions').select('status,renewal_mode,plan:plans!subscriptions_plan_id_fkey(price_cents)').in('status',['active','past_due']),
      auth.service.from('profiles').select('credits').eq('role','client'),
      auth.service.from('credit_ledger').select('amount').eq('kind','consumption').gte('created_at',month.toISOString()),
      auth.service.from('generations').select('id,theme,format,status,created_at,user_id').order('created_at',{ascending:false}).limit(10),
      auth.service.from('payments').select('*',{count:'exact',head:true}).eq('status','pending'),
      auth.service.from('credit_requests').select('*',{count:'exact',head:true}).eq('status','pending'),
      auth.service.from('generation_jobs').select('*',{count:'exact',head:true}).eq('status','failed')
    ])

    const live=(subs.data||[]).filter(x=>x.status==='active')
    const mrr=live.reduce((sum,x)=>sum+(x.plan?.price_cents||0),0)
    const circulation=(profiles.data||[]).reduce((sum,x)=>sum+(x.credits||0),0)
    const used=Math.abs((ledger.data||[]).reduce((sum,x)=>sum+(x.amount||0),0))

    return json(200,{
      active_clients:activeClients.count||0,
      mrr_cents:mrr,
      credits_circulation:circulation,
      credits_used_month:used,
      // Assinaturas que renovam sozinhas porque a cobranca acontece fora da plataforma.
      manual_subscriptions:live.filter(x=>x.renewal_mode==='manual').length,
      past_due:(subs.data||[]).filter(x=>x.status==='past_due').length,
      pending_payments:pendingPayments.count||0,
      pending_requests:pendingRequests.count||0,
      failed_jobs:failedJobs.count||0,
      latest:latest.data||[]
    })
  }catch(error){ return safeError(error) }
}
