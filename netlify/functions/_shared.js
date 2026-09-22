import { createClient } from '@supabase/supabase-js'

export const json = (statusCode, body) => ({ statusCode, headers: { 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY' }, body: JSON.stringify(body) })
export const env = name => { const value=process.env[name]; if(!value) throw new Error(`Missing server env: ${name}`); return value }
export const service = () => createClient(env('SUPABASE_URL'),env('SUPABASE_SECRET_KEY'),{auth:{persistSession:false,autoRefreshToken:false}})
export const pub = token => createClient(env('SUPABASE_URL'),env('SUPABASE_PUBLISHABLE_KEY'),{global:{headers:token?{Authorization:`Bearer ${token}`}:{}} ,auth:{persistSession:false,autoRefreshToken:false}})
export const bearer = event => { const raw=event.headers.authorization||event.headers.Authorization||''; return raw.startsWith('Bearer ')?raw.slice(7):null }
export async function requireUser(event){const token=bearer(event);if(!token)throw Object.assign(new Error('Não autorizado'),{statusCode:401});const client=pub(token);const {data,error}=await client.auth.getUser(token);if(error||!data?.user)throw Object.assign(new Error('Não autorizado'),{statusCode:401});const svc=service();const {data:profile}=await svc.from('profiles').select('id,role,active,credits_plan,credits_extra,credits').eq('id',data.user.id).single();if(!profile?.active)throw Object.assign(new Error('Conta desativada'),{statusCode:403});return{user:data.user,profile,client,service:svc,token}}
export async function requireAdmin(event){const auth=await requireUser(event);if(auth.profile.role!=='admin')throw Object.assign(new Error('Acesso negado'),{statusCode:403});return auth}
export async function body(event){try{return event.body?JSON.parse(event.body):{}}catch{throw Object.assign(new Error('JSON inválido'),{statusCode:400})}}
export function method(event,allowed=['POST']){if(!allowed.includes(event.httpMethod))throw Object.assign(new Error('Método não permitido'),{statusCode:405})}
export const text = (value,max=2000,required=false) => { if(value==null||value===''){if(required)throw Object.assign(new Error('Campo obrigatório'),{statusCode:400});return''} if(typeof value!=='string'||value.length>max)throw Object.assign(new Error('Entrada inválida'),{statusCode:400});return value.trim() }
export const boolean=(value,fallback=false)=>{if(value===undefined||value===null)return fallback;if(typeof value==='boolean')return value;if(value==='true')return true;if(value==='false')return false;throw Object.assign(new Error('Valor booleano inválido'),{statusCode:400})}
export const integer=(value,min=0,max=100000)=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw Object.assign(new Error('Número inválido'),{statusCode:400});return n}
export async function rateLimit(svc,userId,action,limit=10){const {data,error}=await svc.rpc('check_rate_limit',{p_user_id:userId,p_action:action,p_limit:limit});if(error)throw error;if(!data)throw Object.assign(new Error('Muitas tentativas. Tente novamente em instantes.'),{statusCode:429})}
export function safeError(error){console.error(error);return json(error?.statusCode||500,{error:error?.statusCode?error.message:'Não foi possível concluir a operação'})}
export async function audit(svc,adminId,targetId,action,details={}){await svc.from('admin_audit_log').insert({admin_id:adminId,target_user_id:targetId,action,details})}

// ---------------------------------------------------------------------
// Catalogo de precos. A tabela public.pricing e a fonte de verdade.
// Cache curto em memoria: o container da function e reaproveitado entre
// invocacoes, entao sem cache cada geracao faria duas queries a mais.
// ---------------------------------------------------------------------
const CATALOG_TTL_MS = 60_000
let catalogCache = null

export async function loadCatalog(svc){
  if(catalogCache && Date.now()-catalogCache.at < CATALOG_TTL_MS) return catalogCache.value
  const [{data:pricing,error:pErr},{data:presets,error:aErr}]=await Promise.all([
    svc.from('pricing').select('*').eq('active',true).order('sort_order'),
    svc.from('art_presets').select('*').eq('active',true).order('sort_order')
  ])
  if(pErr||aErr) throw pErr||aErr
  const value={
    pricing:Object.fromEntries((pricing||[]).map(row=>[row.slug,row])),
    presets:presets||[],
    presetsBySlug:Object.fromEntries((presets||[]).map(row=>[row.slug,row]))
  }
  catalogCache={at:Date.now(),value}
  return value
}

export function priceOf(catalog,slug){
  const item=catalog.pricing[slug]
  if(!item) throw Object.assign(new Error('Tabela de preços indisponível. Fale com a Achilles.'),{statusCode:503})
  return item
}

export const FORMATS = Object.freeze(['post','story','carousel'])
export const copySlug = format => format==='carousel' ? 'copy_carousel' : format==='story' ? 'copy_story' : 'copy_post'
export const imageSlug = quality => quality==='signature' ? 'image_signature' : 'image_standard'
export const imageCount = format => format==='carousel' ? 5 : 1
// A familia gpt-image-2.5 aceita dimensao customizada: lados multiplos de
// 16, proporcao entre 1:3 e 3:1 e area entre 655.360 e 8.294.400 pixels.
// Com isso o feed sai em 4:5 nativo e o recorte deixa de existir.
const MIN_PIXELS=655_360, MAX_PIXELS=8_294_400
export function validSize(value){
  const m=/^(\d+)x(\d+)$/.exec(String(value||'').trim())
  if(!m) return null
  const w=Number(m[1]), h=Number(m[2])
  if(w%16 || h%16) return null
  const ratio=w/h
  if(ratio<1/3 || ratio>3) return null
  const pixels=w*h
  if(pixels<MIN_PIXELS || pixels>MAX_PIXELS) return null
  return {size:`${w}x${h}`,pixels}
}

export function imageSize(format,settings={}){
  const wanted = format==='story' ? settings.story_image_size : settings.feed_image_size
  const ok=validSize(wanted)
  if(ok) return ok.size
  // Padroes: 4:5 para feed, 9:16 para story. Ambos exatos e validos.
  return format==='story' ? '1152x2048' : '1024x1280'
}

// input_fidelity so existe na familia gpt-image-1. Mandar o parametro para
// um modelo que nao o conhece derruba a chamada inteira.
export const supportsInputFidelity = model => /^gpt-image-1/.test(String(model||''))

export const imageModelOf = (item,settings={}) =>
  item?.openai_model || settings.image_model_fallback || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare'

// ---------------------------------------------------------------------
// Custo real em dolar. A OpenAI devolve usage em tokens; convertemos com
// o preco por milhao. Sem isso a margem do painel seria um chute.
// Ajuste por env se a OpenAI reajustar a tabela.
// ---------------------------------------------------------------------
const price = (name,fallback) => Number(process.env[name] ?? fallback)
export const USD_PER_M = {
  textInput: () => price('OPENAI_TEXT_INPUT_USD_PER_M', 1.25),
  textOutput: () => price('OPENAI_TEXT_OUTPUT_USD_PER_M', 10),
  imageInput: () => price('OPENAI_IMAGE_INPUT_USD_PER_M', 8),
  imageOutput: () => price('OPENAI_IMAGE_OUTPUT_USD_PER_M', 30)
}

// Fallback quando a resposta nao traz usage. Com dimensao livre nao da para
// tabelar, entao estimamos por area. Os fatores saem da razao tokens/pixel
// observada no gpt-image-1 em cada faixa de qualidade.
const TOKENS_PER_MPX = { low:260, medium:1010, high:3980, xhigh:6000, max:8000 }
function estimateOutputTokens(size,quality){
  const parsed=validSize(size)
  const mpx=(parsed?.pixels ?? 1_048_576)/1_000_000
  return Math.round(mpx * (TOKENS_PER_MPX[quality] ?? TOKENS_PER_MPX.medium))
}

export function textCostUsd(usage){
  const input=Number(usage?.input_tokens||0), output=Number(usage?.output_tokens||0)
  return (input*USD_PER_M.textInput() + output*USD_PER_M.textOutput())/1_000_000
}

export function imageCostUsd(usage,size,quality){
  const output=Number(usage?.output_tokens||0) || estimateOutputTokens(size,quality)
  const input=Number(usage?.input_tokens||0)
  return (input*USD_PER_M.imageInput() + output*USD_PER_M.imageOutput())/1_000_000
}

// Trava global de gasto. Protege contra loop de geracao mesmo com credito
// disponivel. O teto da chave na OpenAI e a segunda camada, fora daqui.
export async function assertSpendCeiling(svc){
  const ceiling=Number(process.env.MONTHLY_API_CEILING_USD||0)
  if(!ceiling) return
  const from=new Date(); from.setUTCDate(1); from.setUTCHours(0,0,0,0)
  const {data}=await svc.from('generations').select('cost_usd').gte('created_at',from.toISOString())
  const spent=(data||[]).reduce((sum,row)=>sum+Number(row.cost_usd||0),0)
  if(spent>=ceiling) throw Object.assign(new Error('Geração temporariamente suspensa. Fale com a Achilles.'),{statusCode:503})
}

// ---------------------------------------------------------------------
// Despacho e estorno dos jobs de imagem.
// Ficam aqui porque tres caminhos precisam deles: o dispatcher, a
// regeneracao e o cron que recolhe job travado.
// ---------------------------------------------------------------------
export async function dispatchJob(jobId){
  const target=`${process.env.APP_URL}/.netlify/functions/generate-images-background`
  // Tempo limite curto: o despacho so precisa ser aceito. Se travar, o
  // cron-maintenance recolhe o job depois, e nao faz sentido segurar a
  // resposta do cliente esperando por isso.
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),8000)
  try{
    await fetch(target,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json','x-job-secret':process.env.INTERNAL_JOB_SECRET||''},body:JSON.stringify({job_id:jobId})})
  }catch(error){
    console.error('despacho do job falhou, cron-maintenance recolhe',jobId,error?.message)
  }finally{ clearTimeout(timer) }
}

export async function dispatchCopy(generationId){
  const target=`${process.env.APP_URL}/.netlify/functions/generate-copy-background`
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),8000)
  try{
    await fetch(target,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json','x-job-secret':process.env.INTERNAL_JOB_SECRET||''},body:JSON.stringify({generation_id:generationId})})
  }catch(error){
    console.error('despacho da copy falhou, cron-maintenance recolhe',generationId,error?.message)
  }finally{ clearTimeout(timer) }
}

// Estorna somente as pecas que nao chegaram ao cliente. Imagem entregue ja
// custou dinheiro na OpenAI e nao volta para o saldo.
export async function refundUnproducedImages(svc,job,generation,reason){
  const {data:current}=await svc.from('generation_jobs').select('done_count').eq('id',job.id).maybeSingle()
  const delivered=Number(current?.done_count ?? job.done_count ?? 0)
  const start=Number(job.start_index||0)
  const total=Number(job.total_count||0)
  const window=Math.max(1,total-start)
  const pending=Math.max(0,total-delivered)
  const ratio=Math.min(1,pending/window)
  const plan=Math.round(Number(job.charged_plan||0)*ratio)
  const extra=Math.round(Number(job.charged_extra||0)*ratio)
  if(plan+extra<=0) return {refunded:0}

  // Reivindica o estorno antes de conceder. O worker pode ser invocado duas
  // vezes para o mesmo job (retry da plataforma, redespacho do cron), e sem
  // esta guarda o credito voltava em dobro, no prejuizo da Achilles.
  const {data:claimed,error}=await svc.rpc('claim_job_refund',{p_job_id:job.id,p_credits:plan+extra})
  if(error){
    // Se a V12 ainda nao rodou a funcao nao existe. Melhor estornar uma vez
    // a mais do que deixar o cliente sem o credito de peca nao entregue.
    console.error('claim_job_refund indisponivel, seguindo sem guarda',error)
  }else if(!claimed){
    return {refunded:0,already:true}
  }

  await svc.rpc('refund_credits',{p_user_id:generation.user_id,p_plan:plan,p_extra:extra,p_reason:reason,p_reference_id:generation.id})
  return {refunded:plan+extra,plan,extra}
}

// ---------------------------------------------------------------------
// Configuracao operacional (public.app_settings). Mesmo cache do catalogo.
// ---------------------------------------------------------------------
let settingsCache = null
export async function loadSettings(svc){
  if(settingsCache && Date.now()-settingsCache.at < CATALOG_TTL_MS) return settingsCache.value
  const {data}=await svc.from('app_settings').select('key,value')
  const value=Object.fromEntries((data||[]).map(row=>[row.key,row.value]))
  settingsCache={at:Date.now(),value}
  return value
}

// Baixa as imagens de referencia da marca para anexar ao pedido de imagem.
// E o que reproduz mascote e tratamento visual: descricao em texto nao faz isso.
export async function loadBrandReferences(svc,userId,max=2){
  if(max<=0) return []
  const {data:rows}=await svc.from('brand_reference_images')
    .select('storage_path').eq('user_id',userId).order('position').limit(max)
  const out=[]
  for(const row of rows||[]){
    const {data:blob,error}=await svc.storage.from('brand-references').download(row.storage_path)
    if(error||!blob) continue
    out.push({bytes:Buffer.from(await blob.arrayBuffer()),type:blob.type||'image/png',name:row.storage_path.split('/').pop()||'referencia.png'})
  }
  return out
}

// ---------------------------------------------------------------------
// Normalizacao da copy.
// O modelo quebra linha dentro do titulo para desenhar a peca. Só que o
// <input type=text> do estudio, por especificacao do HTML, APAGA quebra de
// linha do valor em vez de trocar por espaco: "nao foi\nfeito" chegava na
// tela como "nao foifeito", e era esse valor corrompido que o cliente
// aprovava e que ia para o prompt da imagem.
// A correcao mora aqui, no servidor, para valer tambem para o que ja
// estiver salvo e para qualquer cliente futuro.
// ---------------------------------------------------------------------
export const oneLine = value => String(value ?? '')
  .replace(/[\r\n\t\u000b\u000c\u0085\u2028\u2029]+/g, ' ')  // toda quebra vira espaco
  .replace(/\u00a0/g, ' ')                                    // espaco duro vira normal
  .replace(/ {2,}/g, ' ')
  .trim()

// Na legenda o paragrafo tem valor, entao so limpamos o excesso.
export const manyLines = value => String(value ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/[\t\u000b\u000c\u0085\u2028\u2029]+/g, ' ')
  .replace(/\u00a0/g, ' ')
  .replace(/[ ]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .split('\n').map(line => line.trim()).join('\n')
  .trim()

export function normalizeCopy(copy){
  if(!copy || typeof copy !== 'object') return copy
  return {
    ...copy,
    headline: oneLine(copy.headline),
    caption: manyLines(copy.caption),
    hashtags: Array.isArray(copy.hashtags)
      ? copy.hashtags.map(h => oneLine(h).replace(/\s+/g,'')).filter(Boolean)
      : [],
    slides: Array.isArray(copy.slides)
      ? copy.slides.map(s => ({ ...s, title: oneLine(s?.title), subtitle: oneLine(s?.subtitle) }))
      : []
  }
}

// ---------------------------------------------------------------------
// Chamada a OpenAI com tempo limite, retentativa e erro legivel.
//
// O fetch do Node estoura sozinho por volta de cinco minutos e devolve
// "fetch failed", sem status nem causa. O cliente via isso na tela. Aqui
// o limite passa a ser nosso, menor que o da plataforma, para sobrar
// tempo de retentativa, e o erro sai com duas partes: uma mensagem para o
// cliente e um detalhe tecnico para o log.
// ---------------------------------------------------------------------
const TRANSIENT_CODES = new Set(['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENOTFOUND','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'])

export function apiError(userMessage, detail, {transient=false, statusCode=502}={}){
  const err=new Error(userMessage)
  err.userMessage=userMessage
  err.detail=detail
  err.transient=transient
  err.statusCode=statusCode
  return err
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function openaiFetch(url, init, { label='OpenAI', timeoutMs=150000, retries=2 } = {}){
  let lastError=null
  for(let attempt=0; attempt<=retries; attempt++){
    const controller=new AbortController()
    const timer=setTimeout(()=>controller.abort(), timeoutMs)
    const started=Date.now()
    try{
      const res=await fetch(url,{...init,signal:controller.signal})
      const elapsed=Date.now()-started

      if(res.ok) return await res.json()

      // Erro de status: le o corpo, que e onde a OpenAI explica o motivo.
      const body=await res.text().catch(()=>'')
      const reason=(()=>{ try{ return JSON.parse(body)?.error?.message || '' }catch{ return '' } })()
      const detail=`${label} HTTP ${res.status} em ${elapsed}ms: ${reason || body.slice(0,300) || 'sem corpo'}`

      // 429 e 5xx valem retentativa. 4xx restante e erro nosso de parametro.
      if((res.status===429 || res.status>=500) && attempt<retries){
        lastError=apiError('O serviço de geração está sobrecarregado.',detail,{transient:true})
        await sleep([2000,6000,15000][attempt] ?? 15000)
        continue
      }
      if(res.status===429) throw apiError('O serviço de geração está sobrecarregado. Tente de novo em alguns minutos.',detail,{transient:true,statusCode:429})
      if(res.status>=500) throw apiError('O serviço de geração está instável neste momento.',detail,{transient:true})
      if(res.status===400) throw apiError('A configuração de geração foi recusada pelo serviço. A Achilles já foi avisada.',detail,{statusCode:400})
      if(res.status===401||res.status===403) throw apiError('Falha de credencial no serviço de geração. Fale com a Achilles.',detail,{statusCode:502})
      throw apiError('O serviço de geração recusou o pedido.',detail,{statusCode:502})

    }catch(error){
      if(error?.userMessage) { if(!error.transient || attempt>=retries) throw error; lastError=error; continue }

      const elapsed=Date.now()-started
      const aborted=error?.name==='AbortError'
      const code=error?.cause?.code || error?.code || ''
      const transient=aborted || TRANSIENT_CODES.has(code) || /fetch failed|network|socket/i.test(error?.message||'')
      const detail=`${label} ${aborted?`abortado por tempo limite (${timeoutMs}ms)`:`falha de rede`} apos ${elapsed}ms${code?` [${code}]`:''}: ${error?.message||'sem mensagem'}`

      if(transient && attempt<retries){
        lastError=apiError('O serviço de geração não respondeu em tempo.',detail,{transient:true})
        await sleep([2000,6000,15000][attempt] ?? 15000)
        continue
      }
      throw apiError(
        aborted ? 'O serviço de geração não respondeu em tempo. Tente de novo.'
                : 'Não foi possível falar com o serviço de geração.',
        detail, {transient})
    }finally{
      clearTimeout(timer)
    }
  }
  throw lastError || apiError('Não foi possível concluir a geração.','sem detalhe',{transient:true})
}
