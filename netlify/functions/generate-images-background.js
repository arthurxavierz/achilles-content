import { imageCostUsd,imageSize,loadCatalog,refundUnproducedImages,service,textCostUsd } from './_shared.js'

// Estagio 1. O modelo de texto vira diretor de arte: le a marca e a copy e
// devolve uma direcao fechada. Sem esta etapa o prompt de imagem vira uma
// lista de adjetivos e o resultado sai generico.
const directionSchema={type:'object',additionalProperties:false,properties:{
  palette:{type:'array',maxItems:4,items:{type:'string'}},
  lighting:{type:'string'},texture:{type:'string'},composition:{type:'string'},mood:{type:'string'},
  scenes:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,properties:{subject:{type:'string'},detail:{type:'string'}},required:['subject','detail']}}
},required:['palette','lighting','texture','composition','mood','scenes']}

async function buildDirection(svc,g,brand,preset){
  const slides=(g.copy_json?.slides||[]).map((s,i)=>`Slide ${i+1}: ${s.title} | ${s.subtitle||''}`).join('\n')||g.theme
  const prompt=`Você é diretor de arte. Defina a direção visual de uma sequência de peças para rede social.

MARCA
Nome: ${brand?.brand_name||'não informado'}
Segmento: ${brand?.segment||'não informado'}
Cor principal: ${brand?.primary_color||'#D8AF58'} | Cor secundária: ${brand?.secondary_color||'#111111'}
Regras visuais da marca: ${brand?.visual_rules||'editorial, alto contraste, muito espaço limpo'}
Referências citadas pelo cliente: ${brand?.references_text||'nenhuma'}

PRESET ESCOLHIDO
${preset?.name||'Editorial'} — ${preset?.summary||''}

CONTEÚDO
${slides}

Devolva uma direção única e coerente para todas as peças, e uma cena por slide (${(g.copy_json?.slides||[{}]).length} no total).
Cada cena descreve um assunto visual concreto e fotografável, nunca um conceito abstrato.
Nenhuma cena contém texto, letras, números, logotipos ou interface.
As cenas variam de enquadramento entre si, mas mantêm a mesma paleta, luz e textura.`

  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL,input:prompt,text:{format:{type:'json_schema',name:'art_direction',strict:true,schema:directionSchema}}})})
  if(!res.ok)throw new Error(`Direção de arte falhou: OpenAI ${res.status}`)
  const raw=await res.json()
  const output=raw.output_text||raw.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text
  if(!output)throw new Error('Direção de arte vazia')
  const direction=JSON.parse(output)
  await svc.rpc('add_generation_cost',{p_generation_id:g.id,p_cost:textCostUsd(raw.usage)})
  return direction
}

// Estagio 2. O prompt final e montado com blocos fixos. O preset entra
// literal; a marca e a direcao entram como variaveis.
function buildImagePrompt({g,brand,preset,direction,index}){
  const scene=direction.scenes?.[index]||direction.scenes?.[0]||{}
  const slide=g.copy_json?.slides?.[index]||g.copy_json?.slides?.[0]||{}
  return `${preset?.prompt_block||''}

CENA
${scene.subject||slide.title||g.theme}. ${scene.detail||''}

DIREÇÃO FECHADA
Paleta: ${(direction.palette||[]).join(', ')||`${brand?.primary_color||'#D8AF58'} e ${brand?.secondary_color||'#111111'}`}.
Luz: ${direction.lighting||'natural difusa'}.
Textura: ${direction.texture||'sutil, sem ruído artificial'}.
Composição: ${direction.composition||'assimétrica com amplo espaço negativo'}.
Clima: ${direction.mood||'sóbrio e confiante'}.

REGRAS INEGOCIÁVEIS
Não renderize nenhum texto, letra, número, palavra, logotipo, marca d'água ou elemento de interface.
Reserve uma área ampla, limpa e de contraste uniforme para a tipografia ser aplicada depois, em outra camada.
Imagem fotográfica ou tridimensional real, nunca ilustração de banco de imagens, nunca colagem, nunca moldura.
${brand?.visual_rules?`Regras da marca: ${brand.visual_rules}`:''}`
}

// Slides 2 em diante usam o primeiro como referencia. E o que segura a
// identidade visual do carrossel inteiro.
async function callImageApi({prompt,size,quality,reference}){
  const model=process.env.OPENAI_IMAGE_MODEL
  if(reference){
    const form=new FormData()
    form.append('model',model)
    form.append('prompt',`${prompt}

CONSISTÊNCIA
Mantenha exatamente a mesma paleta, luz, textura e tratamento da imagem de referência anexada. Mude apenas o assunto e o enquadramento.`)
    form.append('size',size)
    form.append('quality',quality)
    form.append('input_fidelity','low')
    form.append('image[]',new Blob([reference],{type:'image/png'}),'referencia.png')
    const res=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form})
    if(!res.ok)throw new Error(`OpenAI imagem ${res.status}`)
    return res.json()
  }
  const res=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model,prompt,size,quality,output_format:'png'})})
  if(!res.ok)throw new Error(`OpenAI imagem ${res.status}`)
  return res.json()
}

export async function handler(event){
  const svc=service()
  let job=null
  try{
    if((event.headers['x-job-secret']||'')!==(process.env.INTERNAL_JOB_SECRET||''))return{statusCode:403}
    const input=JSON.parse(event.body||'{}')
    const {data:j,error}=await svc.from('generation_jobs').select('*,generations(*)').eq('id',input.job_id).single()
    if(error||!j)return{statusCode:404}
    job=j
    if(j.status==='done')return{statusCode:200}
    await svc.from('generation_jobs').update({status:'processing',attempts:j.attempts+1,started_at:new Date().toISOString()}).eq('id',j.id)

    const g=j.generations
    const catalog=await loadCatalog(svc)
    const preset=catalog.presetsBySlug[g.preset_slug]||catalog.presets[0]
    const {data:brand}=await svc.from('brand_profiles').select('*').eq('user_id',g.user_id).maybeSingle()

    // A direcao e calculada uma vez por geracao e reaproveitada em retentativas.
    let direction=g.art_direction
    if(!direction){
      direction=await buildDirection(svc,g,brand,preset)
      await svc.from('generations').update({art_direction:direction}).eq('id',g.id)
    }

    const size=imageSize(g.format)
    const quality=j.image_quality||g.image_quality||'medium'

    // Numa regeneracao isolada a primeira arte ja existe. Buscamos ela para
    // servir de referencia, senao a peca refeita destoa do resto do carrossel.
    let reference=null
    if(j.done_count>0){
      const {data:first}=await svc.from('generation_images').select('storage_path').eq('generation_id',g.id).eq('position',1).maybeSingle()
      if(first){
        const {data:blob}=await svc.storage.from('generation-assets').download(first.storage_path)
        if(blob)reference=Buffer.from(await blob.arrayBuffer())
      }
    }

    for(let i=j.done_count;i<j.total_count;i++){
      const prompt=buildImagePrompt({g,brand,preset,direction,index:i})
      const payload=await callImageApi({prompt,size,quality,reference})
      const b64=payload.data?.[0]?.b64_json
      if(!b64)throw new Error(`Imagem ${i+1} sem conteúdo`)
      const bytes=Buffer.from(b64,'base64')
      if(!reference)reference=bytes

      const path=`${g.user_id}/${g.id}/${i+1}.png`
      const {error:upErr}=await svc.storage.from('generation-assets').upload(path,bytes,{contentType:'image/png',upsert:true})
      if(upErr)throw upErr

      const cost=imageCostUsd(payload.usage,size,quality)
      await svc.from('generation_images').upsert({generation_id:g.id,user_id:g.user_id,position:i+1,storage_path:path,cost_usd:cost,quality,prompt:prompt.slice(0,4000)},{onConflict:'generation_id,position'})
      await svc.rpc('add_generation_cost',{p_generation_id:g.id,p_cost:cost})
      await svc.from('generation_jobs').update({done_count:i+1,updated_at:new Date().toISOString()}).eq('id',j.id)
    }

    await svc.from('generation_jobs').update({status:'done',finished_at:new Date().toISOString(),done_count:j.total_count}).eq('id',j.id)
    await svc.from('generations').update({status:'images_ready',completed_at:new Date().toISOString()}).eq('id',g.id)
    return{statusCode:200}
  }catch(error){
    console.error(error)
    if(job){
      const {data:current}=await svc.from('generation_jobs').select('done_count').eq('id',job.id).maybeSingle()
      const delivered=Number(current?.done_count||0)
      await svc.from('generation_jobs').update({status:'failed',last_error:String(error.message||'Falha na geração').slice(0,500),finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id)
      // Se alguma peca chegou a ser entregue, a geracao continua utilizavel.
      await svc.from('generations').update({status:delivered>0?'images_ready':'failed',...(delivered>0?{completed_at:new Date().toISOString()}:{})}).eq('id',job.generation_id)
      await refundUnproducedImages(svc,job,job.generations,'Estorno das imagens não entregues')
    }
    return{statusCode:500}
  }
}
