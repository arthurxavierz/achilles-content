import { isInternalCall, refundUnproducedImages, service } from './_shared.js'

export const config={background:true}

export async function handler(event){
  const svc=service()
  let job=null
  try{
    if(!isInternalCall(event))return{statusCode:403}
    const input=JSON.parse(event.body||'{}')
    const {data:j,error}=await svc.from('generation_jobs').select('*,generations(*)').eq('id',input.job_id).single()
    if(error||!j)return{statusCode:404}
    job=j
    if(j.status==='done')return{statusCode:200}
    if(j.status==='processing'&&j.started_at&&Date.now()-new Date(j.started_at).getTime()<10*60*1000){
      // Outra execucao ja esta cuidando deste job.
      return{statusCode:200}
    }

    await svc.from('generation_jobs').update({status:'processing',attempts:(j.attempts||0)+1,started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',j.id)

    const g=j.generations
    const {data:brand}=await svc.from('brand_profiles').select('*').eq('user_id',g.user_id).maybeSingle()
    const from=Math.max(j.start_index||0,j.done_count||0)

    for(let i=from;i<j.total_count;i++){
      const slide=g.copy_json?.slides?.[i]||g.copy_json?.slides?.[0]||{}
      const prompt=`Crie somente o fundo visual de uma peça de rede social. Não renderize palavras, letras, números, logotipos ou marcas. Formato ${g.format}. Marca do segmento ${brand?.segment||''}. Cor principal ${brand?.primary_color||'#D8AF58'}, cor secundária ${brand?.secondary_color||'#111111'}. Direção visual: ${brand?.visual_rules||'editorial, alto contraste, espaço limpo para tipografia'}. Conceito do slide: ${slide.title||g.theme}. Reserve área limpa e de alto contraste para texto ser aplicado por outra camada.`
      const response=await fetch('https://api.openai.com/v1/images/generations',{
        method:'POST',
        headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},
        body:JSON.stringify({model:process.env.OPENAI_IMAGE_MODEL,prompt,size:g.format==='story'?'1024x1536':'1024x1024',quality:'medium',output_format:'png'})
      })
      if(!response.ok)throw new Error(`Falha na imagem ${i+1}: ${response.status}`)
      const payload=await response.json()
      const b64=payload.data?.[0]?.b64_json
      if(!b64)throw new Error(`Imagem ${i+1} sem conteúdo`)
      const path=`${g.user_id}/${g.id}/${i+1}.png`
      const bytes=Buffer.from(b64,'base64')
      const {error:upErr}=await svc.storage.from('generation-assets').upload(path,bytes,{contentType:'image/png',upsert:true})
      if(upErr)throw upErr
      await svc.from('generation_images').upsert({generation_id:g.id,user_id:g.user_id,position:i+1,storage_path:path},{onConflict:'generation_id,position'})
      await svc.from('generation_jobs').update({done_count:i+1,updated_at:new Date().toISOString()}).eq('id',j.id)
      job={...job,done_count:i+1}
    }

    await svc.from('generation_jobs').update({status:'done',finished_at:new Date().toISOString(),done_count:j.total_count,updated_at:new Date().toISOString()}).eq('id',j.id)
    await svc.from('generations').update({status:'images_ready',completed_at:new Date().toISOString()}).eq('id',g.id)
    return{statusCode:200}
  }catch(error){
    console.error(error)
    if(job){
      await svc.from('generation_jobs').update({status:'failed',last_error:String(error.message||'Falha na geração').slice(0,500),finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id)
      const g=job.generations
      if(g){
        // Regeneracao pontual (start_index > 0) nao invalida a peca: as imagens
        // anteriores continuam intactas. Ja uma falha no lote inicial deixa a
        // geracao em 'failed', pronta para ser retomada por generate-images,
        // que cobra apenas as imagens que ainda faltam.
        const partial=(job.start_index||0)>0
        await svc.from('generations').update({status:partial?'images_ready':'failed'}).eq('id',g.id)
        await refundUnproducedImages(svc,job,g,'Estorno automático das imagens não geradas')
      }
    }
    return{statusCode:500}
  }
}
