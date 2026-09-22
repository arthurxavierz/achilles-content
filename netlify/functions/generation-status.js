import { json,method,requireUser,safeError,text } from './_shared.js'
export async function handler(event){try{method(event,['GET']);const auth=await requireUser(event);
  // Consulta por geracao: e como o estudio acompanha a copy, que agora e
  // assincrona e nao tem job proprio.
  const generationId=event.queryStringParameters?.generation_id
  if(generationId){
    const gid=text(generationId,80,true)
    const {data:g,error:gErr}=await auth.service.from('generations').select('id,status,copy_json,copy_error,format').eq('id',gid).eq('user_id',auth.user.id).maybeSingle()
    if(gErr||!g)throw Object.assign(new Error('Geração não encontrada'),{statusCode:404})
    return json(200,{generation:{id:g.id,status:g.status,copy:g.copy_json||null,error:g.copy_error||null,format:g.format}})
  }
  const id=text(event.queryStringParameters?.job_id,80,true);const {data,error}=await auth.service.from('generation_jobs').select('id,status,done_count,total_count,last_error,generation_id,generations!inner(user_id)').eq('id',id).eq('generations.user_id',auth.user.id).single();if(error)throw Object.assign(new Error('Job não encontrado'),{statusCode:404});return json(200,{job:{id:data.id,status:data.status,done:data.done_count,total:data.total_count,error:data.last_error}})}catch(error){return safeError(error)}}
