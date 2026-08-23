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

  console.log(JSON.stringify(result))
  return{statusCode:200,body:JSON.stringify(result)}
}
