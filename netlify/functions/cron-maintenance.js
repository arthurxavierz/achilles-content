import { dispatchJob, refundUnproducedImages, service } from './_shared.js'

const STUCK_MINUTES=15

// Higiene diaria: limpa tabelas de crescimento infinito e reenfileira jobs
// que ficaram parados porque o despacho para a Background Function falhou.
export async function handler(){
  const svc=service()
  const result={rate_limits_purged:0,webhook_events_purged:0,jobs_requeued:0,jobs_failed:0}

  try{
    const {data}=await svc.rpc('purge_rate_limits')
    result.rate_limits_purged=data||0
  }catch(error){ console.error('purge_rate_limits',error) }

  try{
    const {data}=await svc.rpc('purge_webhook_events',{p_days:90})
    result.webhook_events_purged=data||0
  }catch(error){ console.error('purge_webhook_events',error) }

  try{
    const cutoff=new Date(Date.now()-STUCK_MINUTES*60000).toISOString()
    const {data:stuck}=await svc.from('generation_jobs')
      .select('*,generations(*)')
      .in('status',['queued','processing'])
      .lt('updated_at',cutoff)
      .limit(50)
    for(const job of stuck||[]){
      if((job.attempts||0)>=3){
        // Estourou as tentativas. Aqui o worker pode nunca ter rodado,
        // entao o estorno do que nao foi produzido acontece neste ponto.
        await svc.from('generation_jobs').update({status:'failed',last_error:'Job abandonado após 3 tentativas',finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id)
        const g=job.generations
        if(g){
          const partial=(job.start_index||0)>0
          await svc.from('generations').update({status:partial?'images_ready':'failed'}).eq('id',g.id)
          await refundUnproducedImages(svc,job,g,'Estorno automático de geração abandonada')
        }
        result.jobs_failed++
        continue
      }
      await svc.from('generation_jobs').update({status:'queued',started_at:null,updated_at:new Date().toISOString()}).eq('id',job.id)
      await dispatchJob(job.id)
      result.jobs_requeued++
    }
  }catch(error){ console.error('reaper',error) }

  // Copy presa: despacho perdido ou funcao morta sem chegar ao catch.
  // Sem esta varredura o credito ficava debitado para sempre.
  try{
    const {data:cfg}=await svc.from('app_settings').select('value').eq('key','copy_stuck_minutes').maybeSingle()
    const minutes=Number(cfg?.value||10)
    const cutoff=new Date(Date.now()-minutes*60000).toISOString()
    const {data:stuck}=await svc.from('generations')
      .select('id,user_id,copy_charged_plan,copy_charged_extra,copy_refunded_at')
      .in('status',['draft','copy_queued']).lt('created_at',cutoff).limit(50)
    for(const g of stuck||[]){
      const {data:claimed}=await svc.rpc('claim_copy_refund',{p_generation_id:g.id})
      if(claimed!==false && (g.copy_charged_plan||g.copy_charged_extra)){
        await svc.rpc('refund_credits',{p_user_id:g.user_id,p_plan:g.copy_charged_plan||0,p_extra:g.copy_charged_extra||0,p_reason:'Estorno de copy que não foi produzida',p_reference_id:g.id})
      }
      await svc.from('generations').update({status:'failed',copy_error:'A copy não foi produzida a tempo. Os créditos foram estornados.'}).eq('id',g.id)
      result.copies_refunded=(result.copies_refunded||0)+1
    }
  }catch(error){ console.error('varredura de copy presa',error) }

  console.log(JSON.stringify(result))
  return{statusCode:200,body:JSON.stringify(result)}
}
