import { json,method,requireUser,safeError,text } from './_shared.js'
export async function handler(event){
  try{
    method(event,['GET'])
    const auth=await requireUser(event)
    const id=text(event.queryStringParameters?.job_id,80,true)
    const {data,error}=await auth.service.from('generation_jobs')
      .select('id,status,done_count,total_count,start_index,last_error,generation_id,generations!inner(user_id,status)')
      .eq('id',id).eq('generations.user_id',auth.user.id).single()
    if(error)throw Object.assign(new Error('Job não encontrado'),{statusCode:404})
    const start=data.start_index||0
    return json(200,{job:{
      id:data.id,
      status:data.status,
      // Progresso relativo ao trecho que este job precisa produzir.
      done:Math.max(0,(data.done_count||0)-start),
      total:Math.max(1,(data.total_count||1)-start),
      done_absolute:data.done_count||0,
      total_absolute:data.total_count||1,
      generation_id:data.generation_id,
      generation_status:data.generations?.status||null,
      error:data.last_error
    }})
  }catch(error){ return safeError(error) }
}
