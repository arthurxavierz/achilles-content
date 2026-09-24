import { CAROUSEL_MAX,FORMATS,body,imageCount,integer,json,method,normalizeCopy,rateLimit,requireUser,safeError,text } from './_shared.js'

// Copy escrita pelo cliente. Não cobra crédito: ele fez o trabalho.
//
// Existe porque o fluxo não deveria obrigar a passar pela geração de texto
// para chegar na arte. Quem já tem a legenda pronta, ou quer só descrever a
// cena, entra por aqui e vai direto para as imagens.
function validar(value,slidesEsperados){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('Copy inválida'),{statusCode:400})
  const clean=normalizeCopy(value)
  const headline=text(clean.headline,300,true)
  const caption=text(clean.caption,8000)
  const hashtags=Array.isArray(clean.hashtags)?clean.hashtags.slice(0,30).map(x=>text(x,80)).filter(Boolean):[]
  if(!Array.isArray(clean.slides)||!clean.slides.length)throw Object.assign(new Error('Escreva ao menos um slide'),{statusCode:400})
  const slides=clean.slides.slice(0,slidesEsperados).map(s=>({title:text(s?.title,300,true),subtitle:text(s?.subtitle,1200)}))
  return {headline,slides,caption,hashtags}
}

export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'save-manual-copy',20)

    const input=await body(event)
    const format=FORMATS.includes(input.format)?input.format:null
    if(!format)throw Object.assign(new Error('Formato inválido'),{statusCode:400})
    const requestId=text(input.idempotency_key,120,true)
    const count=imageCount(format,format==='carousel'?integer(input.image_count??CAROUSEL_MAX,1,CAROUSEL_MAX):1)
    const theme=text(input.theme,1200)
    const copy=validar(input.copy,count)

    const {data:existing}=await auth.service.from('generations')
      .select('id,status').eq('user_id',auth.user.id).eq('request_id',requestId).maybeSingle()
    if(existing){
      // Reenvio da mesma chave: atualiza o texto em vez de criar outra linha.
      await auth.service.from('generations').update({copy_json:copy,status:'copy_approved',approved_at:new Date().toISOString()}).eq('id',existing.id)
      return json(200,{generation_id:existing.id,copy,reused:true})
    }

    const {data:g,error}=await auth.service.from('generations').insert({
      user_id:auth.user.id,format,
      theme:theme||copy.headline,
      status:'copy_approved',
      copy_json:copy,
      copy_cost:0,
      copy_source:'manual',
      copy_attempts:0,
      image_count:count,
      request_id:requestId,
      approved_at:new Date().toISOString()
    }).select('id').single()
    if(error)throw error

    return json(201,{generation_id:g.id,copy})
  }catch(error){return safeError(error)}
}
