import { json,method,requireAdmin,safeError } from './_shared.js'

// Fila operacional do painel: o que espera uma decisao humana.
export async function handler(event){
  try{
    method(event,['GET'])
    const auth=await requireAdmin(event)
    const [{data:payments},{data:requests},{data:failedJobs}]=await Promise.all([
      auth.service.from('payments').select('id,user_id,kind,amount_cents,credits,created_at,plan:plans(name),pack:credit_packs(name),profile:profiles(full_name,email)').eq('status','pending').order('created_at',{ascending:false}).limit(50),
      auth.service.from('credit_requests').select('id,user_id,amount,created_at,profile:profiles(full_name,email)').eq('status','pending').order('created_at',{ascending:false}).limit(50),
      auth.service.from('generation_jobs').select('id,generation_id,last_error,error_detail,refunded_credits,total_count,done_count,created_at,generations(user_id,theme,format)').eq('status','failed').order('created_at',{ascending:false}).limit(20)
    ])
    return json(200,{payments:payments||[],requests:requests||[],failed_jobs:failedJobs||[]})
  }catch(error){ return safeError(error) }
}
