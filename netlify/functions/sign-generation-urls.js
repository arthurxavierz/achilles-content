import { body,json,method,requireUser,safeError,text } from './_shared.js'

const TTL_SECONDS=3600

// O banco guarda apenas storage_path. A URL assinada e criada a cada consulta.
export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    const input=await body(event)
    const id=text(input.generation_id,80,true)

    const {data:g}=await auth.service.from('generations').select('id').eq('id',id).eq('user_id',auth.user.id).single()
    if(!g)throw Object.assign(new Error('Geração não encontrada'),{statusCode:404})

    const {data:images,error}=await auth.service.from('generation_images').select('position,storage_path').eq('generation_id',id).order('position')
    if(error)throw error
    if(!images?.length)return json(200,{images:[]})

    // Assinatura em lote. Uma chamada em vez de uma por arquivo.
    const {data:signed,error:signError}=await auth.service.storage.from('generation-assets')
      .createSignedUrls(images.map(x=>x.storage_path),TTL_SECONDS)
    if(signError)throw signError

    const byPath=new Map((signed||[]).map(x=>[x.path,x.signedUrl]))
    const out=images
      .map(image=>({
        position:image.position,
        url:byPath.get(image.storage_path)||null,
        name:`achilles-${String(image.position).padStart(2,'0')}.png`
      }))
      .filter(x=>x.url)

    return json(200,{images:out,expires_in:TTL_SECONDS})
  }catch(error){ return safeError(error) }
}
