import { imageModelOf,imageSize,json,loadBrandReferences,loadCatalog,loadSettings,method,openaiFetch,requireAdmin,safeError } from './_shared.js'

// Diagnóstico da geração, sem cobrar crédito e sem criar geração.
// Serve para separar as três causas possíveis de falha antes de gastar:
// nome de modelo errado, tamanho pesado demais, ou rede/tempo limite.
// O teste sai na menor qualidade e no menor tamanho válido, então custa
// centavos de dólar por chamada.

const TINY = '1024x1024'

async function timed(label, fn){
  const started = Date.now()
  try{
    const out = await fn()
    return { label, ok:true, ms: Date.now()-started, ...out }
  }catch(error){
    return { label, ok:false, ms: Date.now()-started, error: error?.userMessage || error?.message, detail: error?.detail || null }
  }
}

export async function handler(event){
  try{
    method(event,['POST'])
    const auth = await requireAdmin(event)
    const svc = auth.service

    const settings = await loadSettings(svc)
    const catalog = await loadCatalog(svc)
    const standard = catalog.pricing.image_standard
    const signature = catalog.pricing.image_signature

    const config = {
      text_model: process.env.OPENAI_TEXT_MODEL || null,
      image_model_standard: imageModelOf(standard, settings),
      image_model_signature: imageModelOf(signature, settings),
      feed_size: imageSize('post', settings),
      story_size: imageSize('story', settings),
      image_timeout_ms: Number(settings.openai_image_timeout_ms||150000),
      retries: Number(settings.openai_retries??2),
      reference_images_max: Number(settings.reference_images_max??2),
      app_url: process.env.APP_URL || null,
      has_openai_key: !!process.env.OPENAI_API_KEY,
      has_job_secret: !!process.env.INTERNAL_JOB_SECRET
    }

    const auth_header = { authorization:`Bearer ${process.env.OPENAI_API_KEY}` }
    const checks = []

    // 1. A chave funciona e a API responde? Chamada mais barata possível.
    checks.push(await timed('lista de modelos', async () => {
      const out = await openaiFetch('https://api.openai.com/v1/models',{headers:auth_header},{label:'models',timeoutMs:20000,retries:0})
      const ids = (out?.data||[]).map(m=>m.id)
      return {
        total: ids.length,
        // Confirma se os modelos configurados existem de verdade nesta conta.
        standard_existe: ids.includes(config.image_model_standard),
        signature_existe: ids.includes(config.image_model_signature),
        text_existe: ids.includes(config.text_model),
        imagem_disponiveis: ids.filter(id=>id.startsWith('gpt-image')).sort()
      }
    }))

    // 2. Geração simples: isola modelo e endpoint, sem referência anexada.
    checks.push(await timed(`imagem simples ${config.image_model_standard} ${TINY} low`, async () => {
      const out = await openaiFetch('https://api.openai.com/v1/images/generations',
        {method:'POST',headers:{...auth_header,'content-type':'application/json'},
         body:JSON.stringify({model:config.image_model_standard,prompt:'Um círculo dourado sobre fundo preto liso.',size:TINY,quality:'low',output_format:'png'})},
        {label:'imagem simples',timeoutMs:config.image_timeout_ms,retries:0})
      return { bytes_recebidos: (out?.data?.[0]?.b64_json||'').length, usage: out?.usage ?? null }
    }))

    // 3. Mesmo pedido no tamanho real do feed: isola o custo do tamanho.
    checks.push(await timed(`imagem no tamanho real ${config.feed_size} medium`, async () => {
      const out = await openaiFetch('https://api.openai.com/v1/images/generations',
        {method:'POST',headers:{...auth_header,'content-type':'application/json'},
         body:JSON.stringify({model:config.image_model_standard,prompt:'Um círculo dourado sobre fundo preto liso.',size:config.feed_size,quality:'medium',output_format:'png'})},
        {label:'imagem tamanho real',timeoutMs:config.image_timeout_ms,retries:0})
      return { bytes_recebidos: (out?.data?.[0]?.b64_json||'').length, usage: out?.usage ?? null }
    }))

    // 4. Com referência anexada: é o caminho que o sistema usa de verdade e
    //    o mais pesado, porque sobe as imagens da marca em multipart.
    const refs = await loadBrandReferences(svc, auth.user.id, config.reference_images_max)
    const refKb = Math.round(refs.reduce((n,r)=>n+(r.bytes?.length||0),0)/1024)
    if(refs.length){
      checks.push(await timed(`imagem com ${refs.length} referência(s), anexo de ${refKb}KB`, async () => {
        const form = new FormData()
        form.append('model', config.image_model_standard)
        form.append('prompt','Um círculo dourado sobre fundo preto liso.')
        form.append('size', TINY)
        form.append('quality','low')
        for(const r of refs) form.append('image[]', new Blob([r.bytes],{type:r.type||'image/png'}), r.name||'ref.png')
        const out = await openaiFetch('https://api.openai.com/v1/images/edits',
          {method:'POST',headers:auth_header,body:form},
          {label:'imagem com referencia',timeoutMs:config.image_timeout_ms,retries:0})
        return { bytes_recebidos: (out?.data?.[0]?.b64_json||'').length, anexo_kb: refKb, usage: out?.usage ?? null }
      }))
    }

    // 5. Background Functions funcionam neste plano?
    //    A Netlify responde 202 na hora para Background Function. Se a
    //    funcao estiver rodando como comum, ela executa e devolve o que o
    //    handler retornar: 404 para uma geracao que nao existe. E esse o
    //    discriminador, e ele importa porque copy e imagem dependem disso.
    checks.push(await timed('Background Functions no plano', async () => {
      if(!process.env.APP_URL) throw new Error('APP_URL não está configurada.')
      const controller=new AbortController()
      const timer=setTimeout(()=>controller.abort(),15000)
      try{
        const res=await fetch(`${process.env.APP_URL}/.netlify/functions/generate-copy-background`,{
          method:'POST',signal:controller.signal,
          headers:{'content-type':'application/json','x-job-secret':process.env.INTERNAL_JOB_SECRET||''},
          body:JSON.stringify({generation_id:'00000000-0000-0000-0000-000000000000'})
        })
        const background = res.status===202
        return {
          http: res.status,
          background,
          leitura: background
            ? 'Background Function ativa: a geração roda até 15 minutos.'
            : res.status===404
              ? 'Rodando como função comum, limite de 10s. Copy e imagem vão falhar por tempo. O plano precisa de Background Functions.'
              : res.status===403
                ? 'Respondeu 403: o INTERNAL_JOB_SECRET do ambiente não bate com o que a função espera.'
                : 'Resposta inesperada. Confira se o deploy incluiu a função.'
        }
      } finally { clearTimeout(timer) }
    }))

    // 6. Quanto tempo uma copy de verdade leva? E o numero que decide se
    //    ela caberia ou nao no limite de uma funcao sincrona.
    checks.push(await timed('tempo real de uma copy de carrossel', async () => {
      const {data:brand}=await svc.from('brand_profiles').select('*').eq('user_id',auth.user.id).maybeSingle()
      const contexto=[brand?.brand_name,brand?.segment,brand?.audience,brand?.tone,brand?.briefing,brand?.guardrails,brand?.forbidden_terms].filter(Boolean).join(' | ')
      const out=await openaiFetch('https://api.openai.com/v1/responses',
        {method:'POST',headers:{...auth_header,'content-type':'application/json'},
         body:JSON.stringify({model:config.text_model,input:`Escreva cinco slides curtos para um carrossel sobre organização de processos.

MARCA
${contexto||'sem contexto'}`})},
        {label:'copy real',timeoutMs:config.image_timeout_ms,retries:0})
      const tokens=out?.usage?.output_tokens ?? 0
      return { tokens_saida: tokens, nota: 'Compare o tempo acima com 10s, que é o limite de função síncrona da Netlify.' }
    }))

    // 7. As falhas recentes, com o detalhe técnico.
    const {data:failures} = await svc.from('generation_jobs')
      .select('id,created_at,last_error,error_detail,done_count,total_count,refunded_credits,openai_model,image_quality')
      .eq('status','failed').order('created_at',{ascending:false}).limit(5)

    const veredito = (() => {
      const models = checks[0]
      if(!models.ok) return 'A API da OpenAI não respondeu nem para listar modelos. É chave ou rede.'
      if(models.standard_existe===false) return `O modelo "${config.image_model_standard}" não existe nesta conta. Corrija em pricing.openai_model.`
      const simples = checks[1], real = checks[2], comRef = checks[3]
      if(simples && !simples.ok) return 'A geração simples falhou: o problema é o modelo ou o endpoint, não o tamanho nem a referência.'
      if(real && !real.ok) return 'A geração simples passou e a do tamanho real falhou: o tamanho configurado é pesado demais. Baixe feed_image_size.'
      if(comRef && !comRef.ok) return `Só falha com referência anexada (${refKb}KB). Reduza as referências ou baixe reference_images_max.`
      const bg = checks.find(c=>c.label==='Background Functions no plano')
      if(bg && bg.background===false) return bg.leitura
      const copy = checks.find(c=>c.label==='tempo real de uma copy de carrossel')
      if(copy?.ok && copy.ms>10000 && bg?.background!==true)
        return `A copy levou ${(copy.ms/1000).toFixed(1)}s, acima do limite de 10s de função síncrona. Ela precisa rodar como Background Function.`
      return 'Todas as chamadas passaram. Se a geração real ainda falha, o problema está no volume do carrossel ou no tempo total da função.'
    })()

    return json(200,{ config, checks, referencias:{quantidade:refs.length, anexo_kb:refKb}, falhas_recentes:failures||[], veredito })
  }catch(error){ return safeError(error) }
}
