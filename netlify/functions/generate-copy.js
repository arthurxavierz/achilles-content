import { body,copyCost,imageCount,json,method,rateLimit,requireUser,safeError,text } from './_shared.js'

const schema={type:'object',additionalProperties:false,properties:{
  headline:{type:'string'},
  slides:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},subtitle:{type:'string'}},required:['title','subtitle']}},
  caption:{type:'string'},
  hashtags:{type:'array',maxItems:30,items:{type:'string'}}
},required:['headline','slides','caption','hashtags']}

export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'generate-copy',10)
    const input=await body(event)
    const theme=text(input.theme,1200,true)
    const format=['post','story','carousel'].includes(input.format)?input.format:null
    if(!format)throw Object.assign(new Error('Formato inválido'),{statusCode:400})
    const requestId=text(input.idempotency_key,120,true)

    // Idempotencia: o mesmo request_id nunca cobra duas vezes.
    const {data:existing}=await auth.service.from('generations').select('id,copy_json,status').eq('user_id',auth.user.id).eq('request_id',requestId).maybeSingle()
    if(existing?.copy_json)return json(200,{generation_id:existing.id,copy:existing.copy_json,reused:true})

    const slides=imageCount(format)
    const cost=copyCost(format)
    const {data:g,error:gerr}=await auth.service.from('generations')
      .insert({user_id:auth.user.id,format,theme,status:'draft',copy_cost:cost,image_count:slides,request_id:requestId})
      .select('id').single()
    if(gerr)throw gerr

    const {data:spent,error:serr}=await auth.service.rpc('spend_credits',{p_user_id:auth.user.id,p_amount:cost,p_reason:`Copy ${format}`,p_reference_id:g.id})
    if(serr)throw serr
    if(!spent?.ok){
      await auth.service.from('generations').delete().eq('id',g.id)
      throw Object.assign(new Error('Saldo insuficiente'),{statusCode:402})
    }

    try{
      const {data:brand}=await auth.service.from('brand_profiles').select('*').eq('user_id',auth.user.id).maybeSingle()
      const prompt=`Crie conteúdo em português do Brasil para a marca abaixo. Tema: ${theme}. Formato: ${format}. Marca: ${brand?.brand_name||''}. Segmento: ${brand?.segment||''}. Público: ${brand?.audience||''}. Tom: ${brand?.tone||''}. Diferenciais: ${brand?.differentiators||''}. Serviços: ${brand?.services||''}. CTA padrão: ${brand?.default_cta||''}. Briefing: ${brand?.briefing||''}. Guardrails: ${brand?.guardrails||''}. Regras: sem emojis e sem travessão longo. Gere exatamente ${slides} ${slides===1?'slide':'slides'}.`
      const res=await fetch('https://api.openai.com/v1/responses',{
        method:'POST',
        headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},
        body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL,input:prompt,text:{format:{type:'json_schema',name:'content_copy',strict:true,schema}}})
      })
      if(!res.ok)throw new Error(`OpenAI ${res.status}`)
      const raw=await res.json()
      const output=raw.output_text||raw.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text
      if(!output)throw new Error('Resposta vazia')
      const copy=JSON.parse(output)

      // O modelo as vezes devolve mais ou menos slides do que o formato pede.
      // O numero de slides define quantas imagens serao cobradas depois.
      if(Array.isArray(copy.slides)){
        copy.slides=copy.slides.slice(0,slides)
        while(copy.slides.length<slides)copy.slides.push({title:copy.headline||theme,subtitle:''})
      }

      await auth.service.from('generations').update({copy_json:copy,status:'copy_ready'}).eq('id',g.id)
      return json(200,{generation_id:g.id,copy})
    }catch(error){
      await auth.service.rpc('refund_credits',{p_user_id:auth.user.id,p_plan:Number(spent.spent_plan||0),p_extra:Number(spent.spent_extra||0),p_reason:'Estorno por falha na geração de copy',p_reference_id:g.id})
      await auth.service.from('generations').update({status:'failed'}).eq('id',g.id)
      throw error
    }
  }catch(error){ return safeError(error) }
}
