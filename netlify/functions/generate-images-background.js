import { apiError,imageCostUsd,imageModelOf,imageSize,loadBrandReferences,loadCatalog,loadSettings,openaiFetch,refundUnproducedImages,service,supportsInputFidelity,textCostUsd } from './_shared.js'

// Estagio 1. O modelo de texto vira diretor de arte: le a marca e a copy e
// devolve uma direcao fechada. Sem esta etapa o prompt de imagem vira uma
// lista de adjetivos e o resultado sai generico.
const directionSchema={type:'object',additionalProperties:false,properties:{
  palette:{type:'array',maxItems:4,items:{type:'string'}},
  lighting:{type:'string'},texture:{type:'string'},composition:{type:'string'},mood:{type:'string'},
  // Elementos que se repetem em todas as pecas: mascote, motivos graficos,
  // tipo de interface. E o que faz o feed parecer de uma marca so.
  recurring_elements:{type:'array',maxItems:6,items:{type:'string'}},
  scenes:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,properties:{subject:{type:'string'},detail:{type:'string'}},required:['subject','detail']}}
},required:['palette','lighting','texture','composition','mood','recurring_elements','scenes']}

async function buildDirection(svc,g,brand,preset,timeouts){
  const slides=(g.copy_json?.slides||[]).map((s,i)=>`Slide ${i+1}: ${s.title} | ${s.subtitle||''}`).join('\n')||g.theme
  const prompt=`Você é diretor de arte de uma marca que já tem identidade visual definida. Seu trabalho não é inventar um estilo: é aplicar o estilo que já existe a um conteúdo novo.

IDENTIDADE DA MARCA. Isto é lei e prevalece sobre o preset.
Nome: ${brand?.brand_name||'não informado'}
Segmento: ${brand?.segment||'não informado'}
Cor principal: ${brand?.primary_color||'#D8AF58'} | Cor secundária: ${brand?.secondary_color||'#111111'}

Referência visual declarada pelo cliente:
${brand?.references_text||'nenhuma referência declarada'}

Regras visuais da marca:
${brand?.visual_rules||'alto contraste, muito espaço limpo'}

Elementos que a marca repete em toda peça:
${brand?.recurring_elements||'nenhum declarado'}

PRESET DE APOIO. Use só no que não conflitar com a identidade acima.
${preset?.name||'Editorial'} — ${preset?.summary||''}

CONTEÚDO
${slides}

Devolva uma direção única para todas as peças e uma cena por slide (${(g.copy_json?.slides||[{}]).length} no total).

Como decidir:
A paleta sai da identidade da marca, não do preset. Se a marca descreve um fundo dourado, a paleta é dourada.
Em recurring_elements repita o que a marca declarou acima como recorrente. Se ela não declarou nada, extraia da referência visual o que aparece em toda peça: mascote, motivos gráficos, tipo de interface, texturas de fundo. Não havendo nada, devolva lista vazia.
Cada cena descreve um assunto visual concreto e construível, nunca um conceito abstrato.
Elementos de interface, HUD, gráficos, circuitos e dashboards são permitidos quando a marca os usa, desde que sem nenhum rótulo escrito.
${g.render_text?'O título da peça será escrito sobre a arte, então cada cena precisa deixar a faixa superior limpa e de contraste uniforme, com o assunto na metade inferior ou na lateral.':''}
As cenas variam de enquadramento entre si, mas mantêm a mesma paleta, luz, textura e elementos recorrentes.
Adapte o assunto ao nicho tratado no slide, sem trocar o estilo da marca.`

  const raw=await openaiFetch('https://api.openai.com/v1/responses',
    {method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},
     body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL,input:prompt,text:{format:{type:'json_schema',name:'art_direction',strict:true,schema:directionSchema}}})},
    {label:'direção de arte',timeoutMs:timeouts.text,retries:timeouts.retries})
  const output=raw.output_text||raw.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text
  if(!output)throw apiError('A direção de arte voltou vazia.','responses sem output_text')
  const direction=JSON.parse(output)
  await svc.rpc('add_generation_cost',{p_generation_id:g.id,p_cost:textCostUsd(raw.usage)})
  return direction
}

// Estagio 2. A ordem aqui importa mais que o conteudo: o modelo de imagem
// pesa mais o inicio do prompt. Por isso a marca vem antes do preset, e nao
// depois. Invertido, o preset sequestra a peca e o resultado sai generico.
// Quando o texto entra na arte ele precisa chegar ao modelo literal, com
// acento, e com regra explicita de que nada alem daquilo pode ser escrito.
// Modelo de imagem que "interpreta" texto inventa palavra e erra grafia.
function textBlock({brand,slide,render}){
  if(!render) return `PROIBIÇÕES DE TEXTO
Não renderize texto, letra, número, palavra, legenda, logotipo ou marca d'água. Nenhum caractere legível em lugar nenhum da imagem.
As imagens de referência contêm títulos. Eles são da peça original, não do estilo: reproduza a estética e deixe o lugar do texto vazio.
Reserve uma área ampla e de contraste uniforme para a tipografia ser aplicada depois, em outra camada.`

  const title=String(slide?.title||'').trim()
  const subtitle=String(slide?.subtitle||'').trim()
  // Subtitulo longo vira parede de texto na arte e o modelo erra mais.
  const support=subtitle.length>0&&subtitle.length<=110?subtitle:''

  return `TEXTO QUE VAI NA ARTE
Escreva na imagem, exatamente como está entre aspas, sem alterar nenhuma letra, acento ou pontuação:
Título: "${title}"${support?`
Apoio: "${support}"`:''}

Como aplicar:
${brand?.text_style||'Tipografia condensada pesada em caixa alta. Título em branco com uma palavra destacada na cor principal da marca.'}
${brand?.typography?`Referência de tipografia: ${brand.typography}.`:''}
O título ocupa a faixa superior da peça, alinhado à esquerda, em no máximo três linhas, com margem folgada até a borda.
O texto fica sobre área limpa e de alto contraste, nunca por cima do rosto do personagem nem de detalhe importante.

Regras do texto, inegociáveis:
Nenhuma palavra além das citadas acima. Não invente, não traduza, não repita, não acrescente assinatura, site, arroba ou marca d'água.
Ortografia do português do Brasil, com acentuação correta e sem hifenizar palavra no fim da linha.`
}

function buildImagePrompt({g,brand,preset,direction,index,safeCrop,renderText,defaultFinish}){
  // Acabamento e sugestao da plataforma. A marca sobrescreve por inteiro.
  const finish=String(brand?.image_rules||'').trim() || defaultFinish || 'Acabamento de publicidade, alta definição.'
  const scene=direction.scenes?.[index]||direction.scenes?.[0]||{}
  const slide=g.copy_json?.slides?.[index]||g.copy_json?.slides?.[0]||{}
  // O que a marca declarou vence o que o modelo inferiu.
  const declared=String(brand?.recurring_elements||'').trim()
  const recurring=declared?[declared]:(direction.recurring_elements||[]).filter(Boolean)

  const identidade=[
    brand?.references_text&&`Referência visual da marca, siga fielmente:\n${brand.references_text}`,
    brand?.visual_rules&&`Regras visuais obrigatórias:\n${brand.visual_rules}`,
    `Paleta obrigatória: ${(direction.palette||[]).join(', ')||`${brand?.primary_color||'#D8AF58'} e ${brand?.secondary_color||'#111111'}`}.`
  ].filter(Boolean).join('\n\n')

  return `IDENTIDADE VISUAL DA MARCA
Esta seção define a aparência da peça e prevalece sobre qualquer outra instrução abaixo.

${identidade}

CENA
${scene.subject||slide.title||g.theme}. ${scene.detail||''}
${recurring.length?`\nELEMENTOS QUE APARECEM EM TODA PEÇA DESTA MARCA\n${recurring.join('. ')}.`:''}

ACABAMENTO
Luz: ${direction.lighting||'cinematográfica, com volume e profundidade'}.
Textura: ${direction.texture||'limpa, sem ruído artificial'}.
Composição: ${direction.composition||'assimétrica, com amplo espaço livre'}.
Clima: ${direction.mood||'confiante e profissional'}.

ESTILO BASE, aplicar somente no que não conflitar com a identidade da marca
${preset?.prompt_block||''}

ENQUADRAMENTO
${renderText?'Deixe a faixa superior da peça limpa e de contraste uniforme para receber o título; posicione o personagem e os elementos principais na metade inferior ou na lateral. ':''}${safeCrop?`A peça será recortada para ${safeCrop} a partir do centro. Mantenha o assunto principal, o personagem e qualquer elemento essencial dentro da faixa central, com margem de segurança generosa no topo e na base. Nada importante encostado nas bordas.`:'Componha para a proporção inteira do quadro, sem elemento essencial encostado nas bordas.'}

${textBlock({brand,slide,render:renderText})}

ACABAMENTO FINAL
${finish}`
}

// Referencias anexadas ao pedido. Sao de duas origens e as duas importam:
// as da marca (mascote, tratamento visual) e a primeira arte da geracao
// (consistencia entre os slides do carrossel).
async function callImageApi({model,prompt,size,quality,references,fidelity,timeouts}){
  const list=(references||[]).filter(Boolean)
  if(!list.length){
    return openaiFetch('https://api.openai.com/v1/images/generations',
      {method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},
       body:JSON.stringify({model,prompt,size,quality,output_format:'png'})},
      {label:`imagem ${model} ${size} ${quality}`,timeoutMs:timeouts.image,retries:timeouts.retries})
  }
  const form=new FormData()
  form.append('model',model)
  form.append('prompt',`${prompt}

REFERÊNCIA VISUAL ANEXADA
As imagens anexadas são peças reais desta marca. Reproduza fielmente o tratamento delas: paleta, iluminação, acabamento, tipo de interface e qualquer personagem ou motivo gráfico que apareça nelas.
Não copie a composição nem o assunto: construa a cena descrita acima com o visual das referências.
Não copie o texto que aparece nas referências: a peça tem o texto próprio definido acima, ou nenhum.`)
  form.append('size',size)
  form.append('quality',quality)
  // input_fidelity so existe na familia gpt-image-1. No 2.5 a fidelidade a
  // referencia ja e do modelo, e mandar o parametro derruba a chamada.
  if(supportsInputFidelity(model)) form.append('input_fidelity',fidelity==='low'?'low':'high')
  for(const ref of list) form.append('image[]',new Blob([ref.bytes],{type:ref.type||'image/png'}),ref.name||'referencia.png')
  return openaiFetch('https://api.openai.com/v1/images/edits',
    {method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form},
    {label:`imagem-edits ${model} ${size} ${quality} refs=${list.length}`,timeoutMs:timeouts.image,retries:timeouts.retries})
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
      direction=await buildDirection(svc,g,brand,preset,timeouts)
      await svc.from('generations').update({art_direction:direction}).eq('id',g.id)
    }

    const settings=await loadSettings(svc)
    const timeouts={
      image:Number(settings.openai_image_timeout_ms||150000),
      text:Number(settings.openai_text_timeout_ms||90000),
      retries:Number(settings.openai_retries??2)
    }
    const size=imageSize(g.format,settings)
    const quality=j.image_quality||g.image_quality||'medium'
    const model=j.openai_model||g.openai_model||imageModelOf(null,settings)
    const renderText=j.render_text ?? g.render_text ?? false
    const safeCrop=g.format==='story'?'':(settings.feed_safe_crop||'')

    // Referencias da marca: valem para toda peca, inclusive a primeira.
    // E o unico jeito de trazer mascote e tratamento visual proprios.
    const fidelity=settings.reference_fidelity||'high'
    const brandRefs=await loadBrandReferences(svc,g.user_id,Number(settings.reference_images_max??2))

    // Numa regeneracao isolada a primeira arte ja existe. Buscamos ela para
    // servir de referencia, senao a peca refeita destoa do resto do carrossel.
    let previous=null
    if(j.done_count>0){
      const {data:first}=await svc.from('generation_images').select('storage_path').eq('generation_id',g.id).eq('position',1).maybeSingle()
      if(first){
        const {data:blob}=await svc.storage.from('generation-assets').download(first.storage_path)
        if(blob)previous={bytes:Buffer.from(await blob.arrayBuffer()),type:'image/png',name:'peca-anterior.png'}
      }
    }

    for(let i=j.done_count;i<j.total_count;i++){
      const prompt=buildImagePrompt({g,brand,preset,direction,index:i,safeCrop,renderText,defaultFinish:settings.image_style_default})
      const payload=await callImageApi({model,prompt,size,quality,fidelity,timeouts,references:[...brandRefs,previous]})
      const b64=payload.data?.[0]?.b64_json
      if(!b64)throw apiError(`A arte ${i+1} voltou vazia do serviço de geração.`,`images sem b64_json na posicao ${i+1}`)
      const bytes=Buffer.from(b64,'base64')
      // A primeira peca entregue vira referencia das seguintes, junto com as da marca.
      if(!previous)previous={bytes,type:'image/png',name:'peca-anterior.png'}

      const path=`${g.user_id}/${g.id}/${i+1}.png`
      const {error:upErr}=await svc.storage.from('generation-assets').upload(path,bytes,{contentType:'image/png',upsert:true})
      if(upErr)throw upErr

      const cost=imageCostUsd(payload.usage,size,quality)
      await svc.from('generation_images').upsert({generation_id:g.id,user_id:g.user_id,position:i+1,storage_path:path,cost_usd:cost,quality,openai_model:model,prompt:prompt.slice(0,4000)},{onConflict:'generation_id,position'})
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
      // last_error e o que o cliente le. error_detail guarda status, causa e
      // tempo gasto, que e o que permite diagnosticar sem adivinhar.
      const userMessage=error?.userMessage || 'Não foi possível concluir a geração.'
      const detail=error?.detail || String(error?.stack || error?.message || 'sem detalhe')
      console.error('falha no job',job.id,detail)
      await svc.from('generation_jobs').update({
        status:'failed',
        last_error:userMessage.slice(0,500),
        error_detail:detail.slice(0,2000),
        finished_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      }).eq('id',job.id)
      // Se alguma peca chegou a ser entregue, a geracao continua utilizavel.
      await svc.from('generations').update({status:delivered>0?'images_ready':'failed',...(delivered>0?{completed_at:new Date().toISOString()}:{})}).eq('id',job.generation_id)
      const out=await refundUnproducedImages(svc,job,job.generations,'Estorno das imagens não entregues')
      if(out?.refunded>0){
        await svc.from('generation_jobs')
          .update({last_error:`${userMessage} Os créditos das artes não entregues foram estornados.`.slice(0,500)})
          .eq('id',job.id)
      }
    }
    return{statusCode:500}
  }
}
