import { json, method, requireUser, safeError, text } from './_shared.js'

// Como a tela acompanha a análise, que roda em segundo plano.
//
// Devolve o resultado uma vez pronto. O resultado é sugestão: quem grava no
// Brand Brain continua sendo o save-brand, depois do cliente revisar.
export async function handler(event){
  try{
    method(event,['GET'])
    const auth=await requireUser(event)
    const id=text(event.queryStringParameters?.job_id,80,true)

    const {data,error}=await auth.service.from('brand_autofill_jobs')
      .select('id,status,result,error,images_used,created_at')
      .eq('id',id).eq('user_id',auth.user.id).maybeSingle()
    if(error||!data)throw Object.assign(new Error('Análise não encontrada'),{statusCode:404})

    return json(200,{
      job:{
        id:data.id,
        status:data.status,
        images:data.images_used,
        error:data.error||null,
        result:data.status==='ready'?data.result:null
      }
    })
  }catch(error){return safeError(error)}
}
